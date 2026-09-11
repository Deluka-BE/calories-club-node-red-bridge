import test from "node:test";
import assert from "node:assert/strict";
import { WorkoutSync } from "../src/workout-sync.js";

function memoryStore(initial = {}) {
  let state = { ...initial };
  return { get: () => state, merge: async (patch) => { state = { ...state, ...patch }; } };
}

test("a stable key creates once, then updates only when the workout changes", async () => {
  const store = memoryStore();
  const calls = [];
  const mcp = {
    workout: async (workout) => { calls.push(["create", workout]); return { structuredContent: { entry: { id: "cc-1" } } }; },
    updateWorkout: async (id, workout) => { calls.push(["update", id, workout]); return { ok: true }; }
  };
  const sync = new WorkoutSync(store, mcp);
  const first = await sync.put("apple_health:other_active:2026-09-11", "2026-09-11T12:00:00Z", { title: "Other", emoji: "🔥" });
  const repeat = await sync.put("apple_health:other_active:2026-09-11", "2026-09-11T12:00:00Z", { title: "Other", emoji: "🔥" });
  const corrected = await sync.put("apple_health:other_active:2026-09-11", "2026-09-11T12:05:00Z", { title: "Other", emoji: "🔥", calories_burned: 50 });
  assert.equal(first.action, "created");
  assert.equal(repeat.action, "unchanged");
  assert.equal(corrected.action, "updated");
  assert.deepEqual(calls.map((call) => call[0]), ["create", "update"]);
  assert.equal(store.get().workout_sync["apple_health:other_active:2026-09-11"].source_updated_at, "2026-09-11T12:05:00Z");
});

test("an older source timestamp is rejected and deletion removes the saved mapping", async () => {
  const store = memoryStore({ workout_sync: { key: { entry_id: "cc-1", fingerprint: "old", source_updated_at: "2026-09-11T12:00:00Z" } } });
  const calls = [];
  const sync = new WorkoutSync(store, {
    updateWorkout: async () => { throw new Error("should not update"); },
    deleteEntry: async (id) => { calls.push(id); return { ok: true }; }
  });
  await assert.rejects(sync.put("key", "2026-09-11T11:59:59Z", {}), (error) => error.status === 409);
  const result = await sync.delete("key");
  assert.equal(result.action, "deleted");
  assert.deepEqual(calls, ["cc-1"]);
  assert.deepEqual(store.get().workout_sync, {});
});

test("reset clears only locally stored workout mappings", async () => {
  const store = memoryStore({
    refresh_token: "keep-this",
    workout_sync: { a: { entry_id: "cc-1" }, b: { entry_id: "cc-2" } }
  });
  const sync = new WorkoutSync(store, {});
  const result = await sync.reset();
  assert.deepEqual(result, { action: "reset", cleared: 2 });
  assert.deepEqual(store.get().workout_sync, {});
  assert.equal(store.get().refresh_token, "keep-this");
});
