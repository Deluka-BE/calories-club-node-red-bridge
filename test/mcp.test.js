import test from "node:test";
import assert from "node:assert/strict";
import { McpClient } from "../src/mcp.js";

test("tools lists MCP tools through an initialized session", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  const replies = [
    { id: 1, result: { protocolVersion: "2025-03-26" } },
    null,
    { id: 2, result: { tools: [{ name: "update_workout_entry" }] } }
  ];
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    const body = replies.shift();
    return new Response(body ? JSON.stringify(body) : "", {
      status: 200,
      headers: { "mcp-session-id": "session-1" }
    });
  };

  const client = new McpClient(
    { mcpUrl: "https://example.test/mcp", protocolVersion: "2025-03-26" },
    { accessToken: async () => "access-token" }
  );
  const tools = await client.tools();

  assert.deepEqual(tools, [{ name: "update_workout_entry" }]);
  assert.deepEqual(calls.map((call) => call.method), [
    "initialize",
    "notifications/initialized",
    "tools/list"
  ]);
});

test("updateWorkout calls the exact MCP update tool with the stored entry ID", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  const replies = [{ id: 1, result: {} }, null, { id: 2, result: { structuredContent: { entry: { id: "entry-1" } } } }];
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    const body = replies.shift();
    return new Response(body ? JSON.stringify(body) : "", { status: 200, headers: { "mcp-session-id": "session-1" } });
  };
  const client = new McpClient({ mcpUrl: "https://example.test/mcp", protocolVersion: "2025-03-26" }, { accessToken: async () => "token" });
  await client.updateWorkout("entry-1", { title: "Corrected", calories_burned: 123 });
  assert.deepEqual(calls.at(-1).params, {
    name: "update_workout_entry",
    arguments: { entry_id: "entry-1", title: "Corrected", calories_burned: 123 }
  });
});
