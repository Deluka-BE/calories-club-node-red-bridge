import { HttpError, parseMcpPayload } from "./utils.js";

export class McpClient {
  constructor(config, oauth) {
    this.config = config;
    this.oauth = oauth;
  }

  async workout(arguments_) {
    try {
      return await this.runSession(arguments_, false);
    } catch (error) {
      if (error.status !== 401) throw error;
      return this.runSession(arguments_, true);
    }
  }

  async tools() {
    try {
      return await this.listTools(false);
    } catch (error) {
      if (error.status !== 401) throw error;
      return this.listTools(true);
    }
  }

  async listTools(forceRefresh) {
    const token = await this.oauth.accessToken(forceRefresh);
    const initialize = await this.post(token, null, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: this.config.protocolVersion,
        capabilities: {},
        clientInfo: { name: "node-red-calories-club-bridge", version: "1.0.0" }
      }
    }, 1);

    const sessionId = initialize.sessionId;
    await this.post(token, sessionId, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {}
    });

    const result = await this.post(token, sessionId, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {}
    }, 2);

    const tools = result.payload?.result?.tools;
    if (!Array.isArray(tools)) {
      throw new HttpError(502, "Calories Club MCP returned no tool list");
    }
    return tools;
  }

  async runSession(arguments_, forceRefresh) {
    const token = await this.oauth.accessToken(forceRefresh);
    const initialize = await this.post(token, null, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: this.config.protocolVersion,
        capabilities: {},
        clientInfo: { name: "node-red-calories-club-bridge", version: "1.0.0" }
      }
    }, 1);

    const sessionId = initialize.sessionId;
    await this.post(token, sessionId, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {}
    });

    const result = await this.post(token, sessionId, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "add_workout_entry", arguments: arguments_ }
    }, 2);

    if (result.payload?.error) {
      throw new HttpError(502, "Calories Club MCP returned an error", result.payload.error);
    }
    if (result.payload?.result?.isError) {
      throw new HttpError(502, "Calories Club rejected the workout", result.payload.result);
    }
    return result.payload?.result ?? result.payload;
  }

  async post(token, sessionId, message, expectedId) {
    const headers = {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": this.config.protocolVersion
    };
    if (sessionId) headers["mcp-session-id"] = sessionId;

    const response = await fetch(this.config.mcpUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(message)
    });
    const text = await response.text();
    if (!response.ok) {
      let detail;
      try { detail = JSON.parse(text); } catch { detail = undefined; }
      throw new HttpError(response.status, `MCP request failed with HTTP ${response.status}`, detail);
    }
    return {
      sessionId: response.headers.get("mcp-session-id") || sessionId || null,
      payload: expectedId === undefined || !text.trim() ? null : parseMcpPayload(text, expectedId)
    };
  }
}
