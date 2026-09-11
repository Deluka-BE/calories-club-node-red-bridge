import test from "node:test";
import assert from "node:assert/strict";
import { WorkoutSync } from "../src/workout-sync.js";

function memoryStore(initial = {}) {
  let state = { ...initial };
  return { get: () => state, merge: async (patch) => { state = { ...state, ...patch }; } };
}

test("a stable key creates once, then updates only on a newer revision", async () => {
  const store = memoryStore();
  const calls = [];
  const mcp = {
    workout: async (workout) => { calls.push(["create", workout]); return { structuredContent: { entry: { id: "cc-1" } } }; },
    updateWorkout: async (id, workout) => { calls.push(["update", id, workout]); return { ok: true }; }
  };
  const sync = new WorkoutSync(store, mcp);
  const first = await sync.put("apple_health:other_active:2026-09-11", 1, { title: "Other", emoji: "🔥" });
  const repeat = await sync.put("apple_health:other_active:2026-09-11", 1, { title: "Other", emoji: "🔥" });
  const corrected = await sync.put("apple_health:other_active:2026-09-11", 2, { title: "Other", emoji: "🔥", calories_burned: 50 });
  assert.equal(first.action, "created");
  assert.equal(repeat.action, "unchanged");
  assert.equal(corrected.action, "updated");
  assert.deepEqual(calls.map((call) => call[0]), ["create", "update"]);
  assert.equal(store.get().workout_sync["apple_health:other_active:2026-09-11"].revision, 2);
});

test("an older revision is rejected and deletion removes the saved mapping", async () => {
  const store = memoryStore({ workout_sync: { key: { entry_id: "cc-1", revision: 3 } } });
  const calls = [];
  const sync = new WorkoutSync(store, {
    updateWorkout: async () => { throw new Error("should not update"); },
    deleteEntry: async (id) => { calls.push(id); return { ok: true }; }
  });
  await assert.rejects(sync.put("key", 2, {}), (error) => error.status === 409);
  const result = await sync.delete("key");
  assert.equal(result.action, "deleted");
  assert.deepEqual(calls, ["cc-1"]);
  assert.deepEqual(store.get().workout_sync, {});
});
