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

  async put(externalId, sourceUpdatedAt, workout) {
    return this.serial(async () => {
      const all = this.store.get().workout_sync || {};
      const existing = all[externalId];
      const fingerprint = JSON.stringify(workout);

      if (existing) {
        if (existing.fingerprint === fingerprint) {
          return { action: "unchanged", entry_id: existing.entry_id };
        }
        if (sourceUpdatedAt && existing.source_updated_at && sourceUpdatedAt < existing.source_updated_at) {
          throw new HttpError(409, "Workout source timestamp is older than the stored timestamp");
        }

        const result = await this.mcp.updateWorkout(existing.entry_id, workout);
        await this.store.merge({
          workout_sync: { ...all, [externalId]: {
            entry_id: existing.entry_id, fingerprint, source_updated_at: sourceUpdatedAt || existing.source_updated_at || null
          } }
        });
        return { action: "updated", entry_id: existing.entry_id, result };
      }

      const result = await this.mcp.workout(workout);
      const entryId = result?.structuredContent?.entry?.id;
      if (typeof entryId !== "string" || !entryId) {
        throw new HttpError(502, "Calories Club created a workout without an entry ID");
      }
      await this.store.merge({
        workout_sync: { ...all, [externalId]: { entry_id: entryId, fingerprint, source_updated_at: sourceUpdatedAt || null } }
      });
      return { action: "created", entry_id: entryId, result };
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
