import { promises as fs } from "node:fs";
import path from "node:path";

import type { Logger } from "../logging/logger.js";

export interface RelayState {
  nextCursor?: string;
  updatedAt?: string;
}

export interface RelayStateStore {
  init?(): Promise<void>;
  getState(): RelayState;
  setNextCursor(nextCursor: string | undefined): Promise<void>;
}

export class FileRelayStateStore implements RelayStateStore {
  private state: RelayState = {};

  constructor(
    private readonly filename: string,
    private readonly logger: Logger,
  ) {}

  async init() {
    const absolutePath = path.resolve(this.filename);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });

    try {
      const raw = await fs.readFile(absolutePath, "utf8");
      this.state = JSON.parse(raw) as RelayState;
      this.logger.info("Loaded relay state", {
        stateFile: absolutePath,
        nextCursor: this.state.nextCursor,
      });
    } catch (error) {
      const knownError = error as NodeJS.ErrnoException;

      if (knownError.code !== "ENOENT") {
        throw error;
      }

      await this.persist();
      this.logger.info("Initialized new relay state file", {
        stateFile: absolutePath,
      });
    }
  }

  getState() {
    return structuredClone(this.state);
  }

  async setNextCursor(nextCursor: string | undefined) {
    this.state = {
      ...this.state,
      nextCursor,
      updatedAt: new Date().toISOString(),
    };

    await this.persist();
    this.logger.debug("Updated relay cursor", {
      nextCursor,
    });
  }

  private async persist() {
    const absolutePath = path.resolve(this.filename);
    await fs.writeFile(absolutePath, JSON.stringify(this.state, null, 2), "utf8");
  }
}
