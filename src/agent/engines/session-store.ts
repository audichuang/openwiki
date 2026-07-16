import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Persistent thread -> vendor-CLI session map so chat follow-ups can resume the
// same CLI session across separate `openwiki` processes (the previous in-memory
// Map only survived within one process). Stored under ~/.openwiki so it lives
// alongside other OpenWiki state; the path is resolved lazily and can be
// overridden for tests via OPENWIKI_CLI_SESSIONS_PATH so runs never touch the
// real home directory.

type StoredSession = { provider: string; sessionId: string };
type SessionFile = Record<string, StoredSession>;

function sessionsPath(): string {
  const override = process.env.OPENWIKI_CLI_SESSIONS_PATH?.trim();
  if (override) {
    return override;
  }

  return path.join(os.homedir(), ".openwiki", "cli-sessions.json");
}

function isStoredSession(value: unknown): value is StoredSession {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as StoredSession).provider === "string" &&
    typeof (value as StoredSession).sessionId === "string"
  );
}

// Tolerates a missing or corrupt file: a bad store must never break a run, it
// just means no session can be resumed.
function readSessions(): SessionFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(sessionsPath(), "utf8"));
  } catch {
    return {};
  }

  if (typeof parsed !== "object" || parsed === null) {
    return {};
  }

  const sessions: SessionFile = {};
  for (const [threadId, value] of Object.entries(parsed)) {
    if (isStoredSession(value)) {
      sessions[threadId] = {
        provider: value.provider,
        sessionId: value.sessionId,
      };
    }
  }

  return sessions;
}

function writeSessions(sessions: SessionFile): void {
  const file = sessionsPath();
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify(sessions, null, 2)}\n`, {
    mode: 0o600,
  });
}

/**
 * The resumable session id for this thread, but only when it was created by the
 * same provider — resuming a Claude session with the Grok CLI (or vice versa)
 * would fail, so a provider mismatch returns undefined.
 */
export function getThreadSessionId(
  threadId: string,
  provider: string,
): string | undefined {
  const entry = readSessions()[threadId];

  return entry?.provider === provider ? entry.sessionId : undefined;
}

export function setThreadSessionId(
  threadId: string,
  provider: string,
  sessionId: string,
): void {
  const sessions = readSessions();
  sessions[threadId] = { provider, sessionId };
  writeSessions(sessions);
}

/** Drops a stored session, e.g. after a resume attempt failed on a stale id. */
export function clearThreadSessionId(threadId: string): void {
  const sessions = readSessions();
  if (threadId in sessions) {
    delete sessions[threadId];
    writeSessions(sessions);
  }
}
