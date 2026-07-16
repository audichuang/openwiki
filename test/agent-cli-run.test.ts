import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runOpenWikiAgent } from "../src/agent/index.ts";
import type { OpenWikiRunEvent } from "../src/agent/types.ts";
import { CLAUDE_CODE_BINARY_ENV_KEY } from "../src/constants.ts";

const execFileAsync = promisify(execFile);

const DOC_WRITING_STUB = `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
if (process.argv.includes("--version")) {
  console.log("0.0.0-stub");
  process.exit(0);
}
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  mkdirSync("openwiki", { recursive: true });
  writeFileSync("openwiki/quickstart.md", "# Stub docs\\n");
  console.log(JSON.stringify({ type: "system", subtype: "init", session_id: "stub-session" }));
  console.log(JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "Docs written." }] } }));
  console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "done" }));
});
`;

// Records every invocation's args and stdin prompt as one JSON line per call
// in <repo>/stub-called-args.json, so a test can inspect exactly what a
// follow-up (resume) run sent the vendor CLI.
const RESUME_TRACKING_STUB = `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
if (process.argv.includes("--version")) {
  console.log("0.0.0-stub");
  process.exit(0);
}
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  appendFileSync(
    "stub-called-args.json",
    JSON.stringify({ args: process.argv.slice(2), prompt: input }) + "\\n",
  );
  console.log(JSON.stringify({ type: "system", subtype: "init", session_id: "stub-session" }));
  console.log(JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "ok" }] } }));
  console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "done" }));
});
`;

// Writes docs, then reports a failure result and exits non-zero — models a
// vendor CLI that dies late after already changing the wiki on disk.
const FAILING_AFTER_WRITE_STUB = `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
if (process.argv.includes("--version")) {
  console.log("0.0.0-stub");
  process.exit(0);
}
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  mkdirSync("openwiki", { recursive: true });
  writeFileSync("openwiki/quickstart.md", "# Partial docs\\n");
  console.log(JSON.stringify({ type: "system", subtype: "init", session_id: "stub-session" }));
  console.log(JSON.stringify({ type: "result", subtype: "error", is_error: true, result: "boom" }));
  process.exit(1);
});
`;

// Records whether each invocation carried --resume; fails when it did (models a
// stale/expired session id) and succeeds on a fresh session otherwise.
const RESUME_FALLBACK_STUB = `#!/usr/bin/env node
import { appendFileSync } from "node:fs";
if (process.argv.includes("--version")) {
  console.log("0.0.0-stub");
  process.exit(0);
}
const hasResume = process.argv.includes("--resume");
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  appendFileSync("stub-calls.json", JSON.stringify({ resume: hasResume }) + "\\n");
  if (hasResume) {
    console.log(JSON.stringify({ type: "result", subtype: "error", is_error: true, result: "stale session" }));
    process.exit(1);
  }
  console.log(JSON.stringify({ type: "system", subtype: "init", session_id: "fresh-session" }));
  console.log(JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "ok" }] } }));
  console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "done" }));
});
`;

// Writes an in-wiki page AND a stray file outside openwiki/, to exercise the
// warn-only out-of-wiki write guard.
const STRAY_WRITE_STUB = `#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
if (process.argv.includes("--version")) {
  console.log("0.0.0-stub");
  process.exit(0);
}
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  mkdirSync("openwiki", { recursive: true });
  writeFileSync("openwiki/quickstart.md", "# Docs\\n");
  writeFileSync("leak.txt", "stray write outside the wiki\\n");
  console.log(JSON.stringify({ type: "system", subtype: "init", session_id: "stub-session" }));
  console.log(JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "done" }] } }));
  console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "done" }));
});
`;

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function createFixtureRepo(): Promise<string> {
  const repo = await mkdtemp(path.join(tmpdir(), "openwiki-agentcli-"));
  await git(repo, ["init"]);
  await git(repo, ["config", "user.email", "test@example.com"]);
  await git(repo, ["config", "user.name", "OpenWiki Test"]);
  await writeFile(path.join(repo, "README.md"), "# Fixture\n", "utf8");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "initial"]);
  return repo;
}

const ENV_KEYS = [
  "OPENWIKI_PROVIDER",
  "OPENWIKI_MODEL_ID",
  "OPENWIKI_CLI_SESSIONS_PATH",
  CLAUDE_CODE_BINARY_ENV_KEY,
];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(async () => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
  }

  const stubDir = await mkdtemp(path.join(tmpdir(), "openwiki-stub-"));
  const stubPath = path.join(stubDir, "claude-stub.mjs");
  await writeFile(stubPath, DOC_WRITING_STUB, "utf8");
  await chmod(stubPath, 0o755);

  process.env.OPENWIKI_PROVIDER = "claude-code";
  process.env.OPENWIKI_MODEL_ID = "default";
  process.env[CLAUDE_CODE_BINARY_ENV_KEY] = stubPath;
  // Keep the persistent CLI session store out of the real ~/.openwiki.
  process.env.OPENWIKI_CLI_SESSIONS_PATH = path.join(
    stubDir,
    "cli-sessions.json",
  );
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("runOpenWikiAgent with an agent-cli provider", () => {
  test("init run delegates, streams events, writes docs and metadata without an API key", async () => {
    const repo = await createFixtureRepo();
    const events: OpenWikiRunEvent[] = [];

    const result = await runOpenWikiAgent("init", repo, {
      outputMode: "repo-docs",
      onEvent: (event) => events.push(event),
    });

    expect(result).toEqual({ command: "init", model: "default" });
    expect(events.some((event) => event.type === "text")).toBe(true);

    const docs = await readFile(
      path.join(repo, "openwiki", "quickstart.md"),
      "utf8",
    );
    expect(docs).toContain("Stub docs");

    const metadata = JSON.parse(
      await readFile(path.join(repo, "openwiki", ".last-update.json"), "utf8"),
    ) as { command: string; model: string };
    expect(metadata.command).toBe("init");
    expect(metadata.model).toBe("default");
  }, 30_000);

  test("persists metadata when the CLI fails after writing docs", async () => {
    const repo = await createFixtureRepo();
    const failStubDir = await mkdtemp(
      path.join(tmpdir(), "openwiki-fail-stub-"),
    );
    const failStubPath = path.join(failStubDir, "fail-stub.mjs");
    await writeFile(failStubPath, FAILING_AFTER_WRITE_STUB, "utf8");
    await chmod(failStubPath, 0o755);
    process.env[CLAUDE_CODE_BINARY_ENV_KEY] = failStubPath;

    await expect(
      runOpenWikiAgent("init", repo, { outputMode: "repo-docs" }),
    ).rejects.toThrow();

    // The failed run left changed content, so metadata must still be written
    // (mirrors the API path) — otherwise the next update diffs from a stale base.
    const metadata = JSON.parse(
      await readFile(path.join(repo, "openwiki", ".last-update.json"), "utf8"),
    ) as { command: string; model: string };
    expect(metadata.command).toBe("init");
    expect(metadata.model).toBe("default");
  }, 30_000);

  test("resume failure falls back to a fresh session instead of failing", async () => {
    const repo = await createFixtureRepo();
    const stubDir = await mkdtemp(path.join(tmpdir(), "openwiki-resume-fb-"));
    const stubPath = path.join(stubDir, "resume-fallback.mjs");
    await writeFile(stubPath, RESUME_FALLBACK_STUB, "utf8");
    await chmod(stubPath, 0o755);
    process.env[CLAUDE_CODE_BINARY_ENV_KEY] = stubPath;

    // First run (no resume) establishes and stores a session.
    await runOpenWikiAgent("chat", repo, {
      outputMode: "repo-docs",
      threadId: "t1",
      userMessage: "hello",
    });

    // Follow-up resumes; the stub rejects --resume, so the run must retry with
    // a fresh session rather than throwing.
    const result = await runOpenWikiAgent("chat", repo, {
      outputMode: "repo-docs",
      threadId: "t1",
      isFollowup: true,
      userMessage: "again",
    });
    expect(result.command).toBe("chat");

    const calls = (await readFile(path.join(repo, "stub-calls.json"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { resume: boolean });

    // 1st run (fresh) → follow-up resume attempt (fails) → fresh retry.
    expect(calls).toEqual([
      { resume: false },
      { resume: true },
      { resume: false },
    ]);
  }, 30_000);

  test("warns (does not fail) when a repository run writes outside openwiki/", async () => {
    const repo = await createFixtureRepo();
    const stubDir = await mkdtemp(path.join(tmpdir(), "openwiki-stray-"));
    const stubPath = path.join(stubDir, "stray.mjs");
    await writeFile(stubPath, STRAY_WRITE_STUB, "utf8");
    await chmod(stubPath, 0o755);
    process.env[CLAUDE_CODE_BINARY_ENV_KEY] = stubPath;

    const events: OpenWikiRunEvent[] = [];
    const result = await runOpenWikiAgent("init", repo, {
      outputMode: "repo-docs",
      onEvent: (event) => events.push(event),
    });

    // The run still succeeds; the guard only warns.
    expect(result).toEqual({ command: "init", model: "default" });

    const warnings = events
      .filter((event) => event.type === "text")
      .map((event) => (event as { text: string }).text)
      .filter((text) => text.includes("outside the openwiki/ wiki directory"));

    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("leak.txt");
  }, 30_000);

  test("chat run does not write update metadata", async () => {
    const repo = await createFixtureRepo();

    const result = await runOpenWikiAgent("chat", repo, {
      outputMode: "repo-docs",
      userMessage: "hello",
    });

    expect(result.command).toBe("chat");
    await expect(
      readFile(path.join(repo, "openwiki", ".last-update.json"), "utf8"),
    ).rejects.toThrow();
  }, 30_000);

  test("follow-up run resumes the vendor session and sends only the trimmed user message", async () => {
    const repo = await createFixtureRepo();
    const resumeStubDir = await mkdtemp(
      path.join(tmpdir(), "openwiki-resume-stub-"),
    );
    const resumeStubPath = path.join(resumeStubDir, "resume-stub.mjs");
    await writeFile(resumeStubPath, RESUME_TRACKING_STUB, "utf8");
    await chmod(resumeStubPath, 0o755);
    process.env[CLAUDE_CODE_BINARY_ENV_KEY] = resumeStubPath;

    const events: OpenWikiRunEvent[] = [];
    const onEvent = (event: OpenWikiRunEvent) => events.push(event);

    const firstResult = await runOpenWikiAgent("chat", repo, {
      outputMode: "repo-docs",
      threadId: "t1",
      userMessage: "hello",
      onEvent,
    });
    expect(firstResult.command).toBe("chat");

    await runOpenWikiAgent("chat", repo, {
      outputMode: "repo-docs",
      threadId: "t1",
      isFollowup: true,
      userMessage: "again",
    });

    const callLines = (
      await readFile(path.join(repo, "stub-called-args.json"), "utf8")
    )
      .trim()
      .split("\n");
    const calls = callLines.map(
      (line) => JSON.parse(line) as { args: string[]; prompt: string },
    );

    expect(calls).toHaveLength(2);

    const [, secondCall] = calls;
    const resumeFlagIndex = secondCall.args.indexOf("--resume");

    expect(resumeFlagIndex).toBeGreaterThanOrEqual(0);
    expect(secondCall.args[resumeFlagIndex + 1]).toBe("stub-session");
    expect(secondCall.prompt).toBe("again");
  }, 30_000);
});
