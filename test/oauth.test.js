import test from "node:test";
import assert from "node:assert/strict";
import {
  buildClientRegistrationRequest,
  buildClientRegistrationUrl,
  buildDeviceAuthorizationRequest,
  OAuthManager
} from "../src/oauth.js";

test("dynamic client registration includes the Calories app and a valid redirect_uris array", () => {
  const request = buildClientRegistrationRequest({
    scopes: "read:entries write:entries"
  });

  assert.equal(request.app, "calories");
  assert.ok(Array.isArray(request.redirect_uris));
  assert.ok(request.redirect_uris.length > 0);
  assert.doesNotThrow(() => new URL(request.redirect_uris[0]));
  assert.deepEqual(request.redirect_uris, ["http://127.0.0.1/callback"]);
});

test("dynamic client registration URL includes the Calories app query parameter", () => {
  const url = new URL(buildClientRegistrationUrl("https://api.recordo.app/api/mcp/auth/register"));

  assert.equal(url.pathname, "/api/mcp/auth/register");
  assert.equal(url.searchParams.get("app"), "calories");
});

test("device authorization form includes the Calories app", () => {
  const form = buildDeviceAuthorizationRequest(
    { scopes: "read:entries write:entries" },
    "test-client-id"
  );

  assert.equal(form.get("app"), "calories");
  assert.equal(form.get("client_id"), "test-client-id");
  assert.equal(form.get("scope"), "read:entries write:entries");
});

function memoryStore(initial = {}) {
  let value = { ...initial };
  return {
    get: () => value,
    merge: async (patch) => { value = { ...value, ...patch }; }
  };
}

const config = {
  scopes: "read:entries write:entries",
  registrationEndpoint: "https://example.test/register",
  deviceEndpoint: "https://example.test/device",
  tokenEndpoint: "https://example.test/token"
};

test("an invalid refresh token begins a new device login and exposes no tokens", async (t) => {
  const store = memoryStore({
    client_id: "existing-client",
    access_token: "expired-access-token",
    refresh_token: "revoked-refresh-token",
    expires_at: 0
  });
  const manager = new OAuthManager(config, store);
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (url) => {
    if (url === config.tokenEndpoint) {
      return new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }
    if (url === config.deviceEndpoint) {
      return new Response(JSON.stringify({
        device_code: "device-code-secret",
        user_code: "ABCD-EFGH",
        verification_uri: "https://example.test/activate",
        expires_in: 600,
        interval: 5
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    throw new Error(`unexpected fetch URL: ${url}`);
  };

  await assert.rejects(
    manager.accessToken(),
    (error) => {
      assert.equal(error.status, 401);
      assert.equal(error.message, "Bridge authorization expired; complete device login");
      assert.deepEqual(error.details.login, {
        verification_uri: "https://example.test/activate",
        verification_uri_complete: null,
        user_code: "ABCD-EFGH",
        expires_at: error.details.login.expires_at,
        interval_seconds: 5
      });
      return true;
    }
  );

  assert.equal(store.get().access_token, null);
  assert.equal(store.get().refresh_token, null);
  const status = manager.status();
  assert.equal(status.login_pending, true);
  assert.equal(status.login.user_code, "ABCD-EFGH");
  assert.equal(JSON.stringify(status).includes("device-code-secret"), false);
});
