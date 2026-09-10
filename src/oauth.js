import { HttpError, safeRemoteError } from "./utils.js";

export function buildClientRegistrationRequest(config) {
  return {
    client_name: "Node-RED Calories Club Bridge",
    redirect_uris: ["http://127.0.0.1/callback"],
    grant_types: [
      "urn:ietf:params:oauth:grant-type:device_code",
      "refresh_token"
    ],
    token_endpoint_auth_method: "none",
    scope: config.scopes
  };
}

export class OAuthManager {
  constructor(config, store) {
    this.config = config;
    this.store = store;
    this.pollPromise = null;
  }

  status() {
    const state = this.store.get();
    const expiresAt = state.expires_at || null;
    return {
      authorized: Boolean(state.refresh_token || (state.access_token && expiresAt > Date.now())),
      client_registered: Boolean(state.client_id),
      login_pending: Boolean(state.device_code && state.device_expires_at > Date.now()),
      token_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      scopes: state.scope || this.config.scopes
    };
  }

  async registerClient() {
    const current = this.store.get();
    if (current.client_id) return current;

    const response = await fetch(this.config.registrationEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(buildClientRegistrationRequest(this.config))
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.client_id) {
      throw safeRemoteError(response.status || 502, body, "Dynamic client registration failed");
    }
    await this.store.merge({
      client_id: body.client_id,
      ...(body.client_secret ? { client_secret: body.client_secret } : {})
    });
    return this.store.get();
  }

  async startLogin() {
    const state = this.store.get();
    if (this.status().authorized) return { already_authorized: true, ...this.status() };
    if (state.device_code && state.device_expires_at > Date.now()) {
      this.startPolling();
      return this.publicDeviceInfo(state);
    }

    const client = await this.registerClient();
    const form = new URLSearchParams({ client_id: client.client_id, scope: this.config.scopes });
    const response = await fetch(this.config.deviceEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: form
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.device_code || !body.user_code) {
      throw safeRemoteError(response.status || 502, body, "Device authorization failed");
    }

    const patch = {
      device_code: body.device_code,
      user_code: body.user_code,
      verification_uri: body.verification_uri,
      verification_uri_complete: body.verification_uri_complete,
      device_interval: Number(body.interval || 5),
      device_expires_at: Date.now() + Number(body.expires_in || 600) * 1000
    };
    await this.store.merge(patch);
    this.startPolling();
    return this.publicDeviceInfo(this.store.get());
  }

  publicDeviceInfo(state) {
    return {
      verification_uri: state.verification_uri,
      verification_uri_complete: state.verification_uri_complete || null,
      user_code: state.user_code,
      expires_at: new Date(state.device_expires_at).toISOString(),
      interval_seconds: state.device_interval
    };
  }

  startPolling() {
    if (!this.pollPromise) {
      this.pollPromise = this.pollDeviceToken().finally(() => { this.pollPromise = null; });
    }
  }

  async pollDeviceToken() {
    let interval = this.store.get().device_interval || 5;
    while (this.store.get().device_expires_at > Date.now()) {
      await new Promise((resolve) => setTimeout(resolve, interval * 1000));
      const state = this.store.get();
      const form = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: state.device_code,
        client_id: state.client_id
      });
      if (state.client_secret) form.set("client_secret", state.client_secret);

      const response = await fetch(this.config.tokenEndpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: form
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.access_token) {
        await this.saveTokens(body);
        return;
      }
      if (body.error === "authorization_pending") continue;
      if (body.error === "slow_down") {
        interval += 5;
        continue;
      }
      if (["access_denied", "expired_token"].includes(body.error)) break;
      // Temporary upstream errors should not destroy a still-valid device flow.
      if (response.status >= 500) continue;
      break;
    }
    await this.store.merge({
      device_code: null, user_code: null, verification_uri: null,
      verification_uri_complete: null, device_expires_at: null
    });
  }

  async saveTokens(body) {
    const old = this.store.get();
    await this.store.merge({
      access_token: body.access_token,
      refresh_token: body.refresh_token || old.refresh_token,
      token_type: body.token_type || "Bearer",
      scope: body.scope || old.scope || this.config.scopes,
      expires_at: Date.now() + Number(body.expires_in || 3600) * 1000,
      device_code: null, user_code: null, verification_uri: null,
      verification_uri_complete: null, device_expires_at: null
    });
  }

  async accessToken(forceRefresh = false) {
    const state = this.store.get();
    if (!forceRefresh && state.access_token && state.expires_at > Date.now() + 60_000) {
      return state.access_token;
    }
    if (!state.refresh_token) throw new HttpError(401, "Bridge is not authorized; call POST /login");

    const form = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: state.refresh_token,
      client_id: state.client_id
    });
    if (state.client_secret) form.set("client_secret", state.client_secret);
    const response = await fetch(this.config.tokenEndpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: form
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.access_token) {
      if (["invalid_grant", "invalid_token"].includes(body.error)) {
        await this.store.merge({ access_token: null, refresh_token: null, expires_at: null });
      }
      throw safeRemoteError(response.status || 502, body, "Token refresh failed");
    }
    await this.saveTokens(body);
    return this.store.get().access_token;
  }
}
