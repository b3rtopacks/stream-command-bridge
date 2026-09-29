import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { TokenStore, TwitchTokens } from "./types.js";

/** Opt-in local persistence. Keep its path ignored by source control. */
export class JsonFileTokenStore implements TokenStore {
  constructor(private readonly path: string) {}

  async load(): Promise<TwitchTokens | null> {
    try {
      return JSON.parse(await readFile(this.path, "utf8")) as TwitchTokens;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async save(tokens: TwitchTokens): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(tokens, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  async clear(): Promise<void> { await rm(this.path, { force: true }); }
}

export class MemoryTokenStore implements TokenStore {
  constructor(private tokens: TwitchTokens | null = null) {}
  async load(): Promise<TwitchTokens | null> { return this.tokens; }
  async save(tokens: TwitchTokens): Promise<void> { this.tokens = tokens; }
  async clear(): Promise<void> { this.tokens = null; }
}
