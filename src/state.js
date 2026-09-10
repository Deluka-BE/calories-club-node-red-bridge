import fs from "node:fs/promises";
import path from "node:path";

export class StateStore {
  constructor(file) {
    this.file = file;
    this.state = {};
  }

  async load() {
    await fs.mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
    try {
      this.state = JSON.parse(await fs.readFile(this.file, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      this.state = {};
    }
    return this.state;
  }

  get() {
    return this.state;
  }

  async replace(next) {
    this.state = next;
    const temp = `${this.file}.tmp`;
    await fs.writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temp, this.file);
    await fs.chmod(this.file, 0o600);
  }

  async merge(patch) {
    await this.replace({ ...this.state, ...patch });
  }
}
