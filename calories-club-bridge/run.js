import { readFile } from "node:fs/promises";

const optionsPath = "/data/options.json";
let options;

try {
  options = JSON.parse(await readFile(optionsPath, "utf8"));
} catch (error) {
  console.error(`Unable to read Home Assistant app configuration: ${error.message}`);
  process.exit(1);
}

if (typeof options.bridge_api_key !== "string" || options.bridge_api_key.length < 16) {
  console.error("bridge_api_key must contain at least 16 characters");
  process.exit(1);
}

process.env.BRIDGE_API_KEY = options.bridge_api_key;
process.env.DATA_DIR = "/data";
process.env.HOST = "0.0.0.0";
process.env.PORT = "3000";

await import("./src/server.js");
