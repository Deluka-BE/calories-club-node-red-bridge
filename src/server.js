import http from "node:http";
import { config } from "./config.js";
import { StateStore } from "./state.js";
import { OAuthManager } from "./oauth.js";
import { McpClient } from "./mcp.js";
import { HttpError, readJson, sendJson, validateWorkout } from "./utils.js";

const store = new StateStore(config.stateFile);
await store.load();
const oauth = new OAuthManager(config, store);
const mcp = new McpClient(config, oauth);

if (oauth.status().login_pending) oauth.startPolling();

function requireApiKey(req) {
  if (config.apiKey && req.headers["x-api-key"] !== config.apiKey) {
    throw new HttpError(401, "Missing or invalid bridge API key");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && url.pathname === "/status") {
      requireApiKey(req);
      return sendJson(res, 200, oauth.status());
    }
    if (req.method === "POST" && url.pathname === "/login") {
      requireApiKey(req);
      return sendJson(res, 200, await oauth.startLogin());
    }
    if (req.method === "POST" && url.pathname === "/workout") {
      requireApiKey(req);
      const workout = validateWorkout(await readJson(req));
      const result = await mcp.workout(workout);
      return sendJson(res, 200, { success: true, result });
    }
    return sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    // Never log request headers, request bodies, tokens, or persisted auth state.
    console.error(`${req.method} ${req.url}: ${error.message}`);
    return sendJson(res, status, {
      success: false,
      error: error.message,
      ...(error.details ? { details: error.details } : {})
    });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`Calories Club bridge listening on ${config.host}:${config.port}`);
});
