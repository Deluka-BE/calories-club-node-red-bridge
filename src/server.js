import http from "node:http";
import { config } from "./config.js";
import { StateStore } from "./state.js";
import { OAuthManager } from "./oauth.js";
import { McpClient } from "./mcp.js";
import { WorkoutSync } from "./workout-sync.js";
import { HttpError, readJson, sendJson, validateExternalId, validateSourceUpdatedAt, validateWorkout } from "./utils.js";

const store = new StateStore(config.stateFile);
await store.load();
const oauth = new OAuthManager(config, store);
const mcp = new McpClient(config, oauth);
const workoutSync = new WorkoutSync(store, mcp);

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
    if (req.method === "GET" && url.pathname === "/tools") {
      requireApiKey(req);
      return sendJson(res, 200, { tools: await mcp.tools() });
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
    if (req.method === "DELETE" && url.pathname === "/workout-sync") {
      requireApiKey(req);
      const outcome = await workoutSync.reset();
      return sendJson(res, 200, { success: true, ...outcome });
    }
    const match = url.pathname.match(/^\/workout\/([^/]+)$/);
    if (match && req.method === "PUT") {
      requireApiKey(req);
      const body = await readJson(req);
      const externalId = validateExternalId(decodeURIComponent(match[1]));
      const sourceUpdatedAt = validateSourceUpdatedAt(body.source_updated_at);
      const workout = validateWorkout(body);
      const outcome = await workoutSync.put(externalId, sourceUpdatedAt, workout);
      return sendJson(res, 200, { success: true, ...outcome });
    }
    if (match && req.method === "DELETE") {
      requireApiKey(req);
      const externalId = validateExternalId(decodeURIComponent(match[1]));
      const outcome = await workoutSync.delete(externalId);
      return sendJson(res, 200, { success: true, ...outcome });
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
