import test from "node:test";
import assert from "node:assert/strict";
import { parseMcpPayload, validateExternalId, validateRevision, validateWorkout } from "../src/utils.js";

test("parses an SSE JSON-RPC response", () => {
  const value = parseMcpPayload('event: message\ndata: {"jsonrpc":"2.0","id":2,"result":{"ok":true}}\n\n', 2);
  assert.equal(value.result.ok, true);
});

test("accepts a valid workout and removes unknown fields", () => {
  const value = validateWorkout({
    title: "Run", emoji: "🏃", activity_type: "run",
    calories_burned: 250, event_datetime: "2026-09-10T06:00:00+02:00",
    ignored: "no"
  });
  assert.equal(value.ignored, undefined);
  assert.equal(value.activity_type, "run");
});

test("rejects a datetime without timezone", () => {
  assert.throws(() => validateWorkout({
    title: "Run", emoji: "🏃", event_datetime: "2026-09-10T06:00:00"
  }), /timezone offset/);
});

test("accepts a stable workout key and positive revision", () => {
  assert.equal(validateExternalId("apple_health:other_active:2026-09-11"), "apple_health:other_active:2026-09-11");
  assert.equal(validateRevision(4), 4);
  assert.throws(() => validateExternalId("has/a/slash"), /workout key/);
  assert.throws(() => validateRevision(0), /positive integer/);
});
