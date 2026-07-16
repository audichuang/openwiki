import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  clearThreadSessionId,
  getThreadSessionId,
  setThreadSessionId,
} from "../src/agent/engines/session-store.ts";

let sessionsPath: string;
let saved: string | undefined;

beforeEach(async () => {
  saved = process.env.OPENWIKI_CLI_SESSIONS_PATH;
  const dir = await mkdtemp(path.join(tmpdir(), "openwiki-sessions-"));
  sessionsPath = path.join(dir, "cli-sessions.json");
  process.env.OPENWIKI_CLI_SESSIONS_PATH = sessionsPath;
});

afterEach(() => {
  if (saved === undefined) {
    delete process.env.OPENWIKI_CLI_SESSIONS_PATH;
  } else {
    process.env.OPENWIKI_CLI_SESSIONS_PATH = saved;
  }
});

describe("cli session store", () => {
  test("round-trips a session id for the same thread and provider", () => {
    setThreadSessionId("thread-1", "claude-code", "sess-abc");

    expect(getThreadSessionId("thread-1", "claude-code")).toBe("sess-abc");
  });

  test("does not resume a session created by a different provider", () => {
    setThreadSessionId("thread-1", "grok-build", "sess-grok");

    expect(getThreadSessionId("thread-1", "claude-code")).toBeUndefined();
    expect(getThreadSessionId("thread-1", "grok-build")).toBe("sess-grok");
  });

  test("persists to disk so a separate process can resume it", async () => {
    setThreadSessionId("thread-1", "claude-code", "sess-abc");

    // The store keeps no in-process state (every get reads the file), so the
    // on-disk contents are what a separate `openwiki` process would resume.
    const onDisk = JSON.parse(await readFile(sessionsPath, "utf8")) as Record<
      string,
      { provider: string; sessionId: string }
    >;
    expect(onDisk["thread-1"]).toEqual({
      provider: "claude-code",
      sessionId: "sess-abc",
    });
  });

  test("clearing a thread removes its stored session", () => {
    setThreadSessionId("thread-1", "claude-code", "sess-abc");
    clearThreadSessionId("thread-1");

    expect(getThreadSessionId("thread-1", "claude-code")).toBeUndefined();
  });

  test("returns undefined for a missing store", () => {
    expect(getThreadSessionId("never-set", "claude-code")).toBeUndefined();
  });

  test("tolerates a corrupt store file without throwing", async () => {
    await writeFile(sessionsPath, "{ not valid json", "utf8");

    expect(getThreadSessionId("thread-1", "claude-code")).toBeUndefined();
    // A write after corruption should recover the store.
    expect(() =>
      setThreadSessionId("thread-1", "claude-code", "sess-abc"),
    ).not.toThrow();
    expect(getThreadSessionId("thread-1", "claude-code")).toBe("sess-abc");
  });
});
