import { HttpError } from "./utils.js";

// MCP requests can arrive concurrently. Serialising mutations prevents two
// simultaneous PUTs for a new day from both creating a Calories Club entry.
export class WorkoutSync {
  constructor(store, mcp) {
    this.store = store;
    this.mcp = mcp;
    this.tail = Promise.resolve();
  }

  serial(task) {
    const run = this.tail.then(task, task);
    this.tail = run.catch(() => {});
    return run;
  }

  async put(externalId, revision, workout) {
    return this.serial(async () => {
      const all = this.store.get().workout_sync || {};
      const existing = all[externalId];

      if (existing) {
        if (revision < existing.revision) {
          throw new HttpError(409, "Workout revision is older than the stored revision");
        }
        if (revision === existing.revision) {
          return { action: "unchanged", entry_id: existing.entry_id, revision };
        }

        const result = await this.mcp.updateWorkout(existing.entry_id, workout);
        await this.store.merge({
          workout_sync: { ...all, [externalId]: { entry_id: existing.entry_id, revision } }
        });
        return { action: "updated", entry_id: existing.entry_id, revision, result };
      }

      const result = await this.mcp.workout(workout);
      const entryId = result?.structuredContent?.entry?.id;
      if (typeof entryId !== "string" || !entryId) {
        throw new HttpError(502, "Calories Club created a workout without an entry ID");
      }
      await this.store.merge({
        workout_sync: { ...all, [externalId]: { entry_id: entryId, revision } }
      });
      return { action: "created", entry_id: entryId, revision, result };
    });
  }

  async delete(externalId) {
    return this.serial(async () => {
      const all = this.store.get().workout_sync || {};
      const existing = all[externalId];
      if (!existing) return { action: "absent" };

      const result = await this.mcp.deleteEntry(existing.entry_id);
      const next = { ...all };
      delete next[externalId];
      await this.store.merge({ workout_sync: next });
      return { action: "deleted", entry_id: existing.entry_id, result };
    });
  }
}
