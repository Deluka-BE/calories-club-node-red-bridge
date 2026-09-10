import path from "node:path";

const dataDir = process.env.DATA_DIR || "/data";

export const config = Object.freeze({
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || "0.0.0.0",
  dataDir,
  stateFile: path.join(dataDir, "auth-state.json"),
  apiKey: process.env.BRIDGE_API_KEY || "",
  mcpUrl: process.env.MCP_URL || "https://api.recordo.app/api/mcp/calories/mcp",
  registrationEndpoint:
    process.env.OAUTH_REGISTRATION_ENDPOINT ||
    "https://api.recordo.app/api/mcp/auth/register",
  deviceEndpoint:
    process.env.OAUTH_DEVICE_ENDPOINT ||
    "https://api.recordo.app/api/mcp/auth/device",
  tokenEndpoint:
    process.env.OAUTH_TOKEN_ENDPOINT ||
    "https://api.recordo.app/api/mcp/auth/token",
  scopes: process.env.OAUTH_SCOPES || "read:entries write:entries",
  protocolVersion: process.env.MCP_PROTOCOL_VERSION || "2025-03-26"
});
