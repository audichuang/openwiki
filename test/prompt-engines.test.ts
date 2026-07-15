import { describe, expect, test } from "vitest";
import {
  createAgentCliSystemSuffix,
  createRuntimeNote,
  createSystemPrompt,
} from "../src/agent/prompt.ts";

describe("createSystemPrompt engines", () => {
  test("deepagents variant keeps the virtual filesystem discipline", () => {
    const prompt = createSystemPrompt("init", "repo-docs", "deepagents");

    expect(prompt).toContain("virtual paths");
    expect(prompt).toContain("read_file");
    expect(prompt).toContain("/openwiki/_plan.md");
    expect(prompt).toContain("openwiki/quickstart.md");
  });

  test("agent-cli variant appends repository-relative path guidance", () => {
    const prompt = createSystemPrompt("init", "repo-docs", "agent-cli");

    expect(prompt).toContain("repository-relative paths");
    expect(prompt).toContain("Agent CLI runtime note");
    // Shared base prompt still mentions DeepAgents tool names for API
    // providers; the agent-cli note steers the delegated CLI away from virtual
    // root assumptions.
    expect(prompt).toContain("Do not rely on DeepAgents virtual paths");
  });

  test("mode instructions are engine-independent", () => {
    expect(createSystemPrompt("update", "repo-docs", "agent-cli")).toContain(
      "maintenance update run",
    );
    expect(createSystemPrompt("chat", "repo-docs", "agent-cli")).toContain(
      "interactive chat turn",
    );
  });
});

describe("createRuntimeNote engines", () => {
  const cwd = "/home/u/.openwiki/wiki";

  test("deepagents keeps virtual-root discipline (local-wiki)", () => {
    const note = createRuntimeNote(cwd, "local-wiki", "deepagents");

    expect(note).toContain(cwd);
    expect(note).toContain("virtual root");
    expect(note).toContain("will write to the wrong location");
    // Specific directives that must survive (dropping any is a regression).
    expect(note).toContain("cd ");
    expect(note).toContain("parent directories");
    // Must NOT hand the virtual DeepAgents backend real-filesystem guidance.
    expect(note).not.toContain("Absolute paths are allowed");
  });

  test("agent-cli uses real-filesystem discipline (local-wiki)", () => {
    const note = createRuntimeNote(cwd, "local-wiki", "agent-cli");

    expect(note).toContain(cwd);
    expect(note).toContain("real filesystem");
    expect(note).toContain("Absolute paths are allowed");
    expect(note).toContain("--add-dir");
    // The vendor CLI runs on the real FS; virtual-root wording would misdirect.
    expect(note).not.toContain("virtual root");
  });

  test("deepagents repo mode is virtual and points writes at /openwiki", () => {
    const note = createRuntimeNote("/repo", "repo-docs", "deepagents");

    expect(note).toContain("virtual root");
    expect(note).toContain("/openwiki");
    // Stale d43bd4f wording that contradicts the mode-specific system prompt.
    expect(note).not.toContain("canonical generated wiki is ~/.openwiki/wiki");
  });

  test("agent-cli repo mode is real filesystem", () => {
    const note = createRuntimeNote("/repo", "repo-docs", "agent-cli");

    expect(note).toContain("real filesystem");
    expect(note).not.toContain("virtual root");
  });
});

describe("createAgentCliSystemSuffix mode-awareness", () => {
  test("local-wiki writes to the wiki root, not a nested openwiki/", () => {
    const suffix = createAgentCliSystemSuffix("local-wiki");

    expect(suffix).toContain("Agent CLI runtime note");
    expect(suffix).toContain("do not create a nested openwiki/ directory");
    // Reading --add-dir evidence outside the root must be allowed.
    expect(suffix).toContain("--add-dir");
    expect(suffix).toContain("do not modify files outside the runtime root");
  });

  test("repo mode writes generated docs under openwiki/", () => {
    const suffix = createAgentCliSystemSuffix("repo-docs");

    expect(suffix).toContain("openwiki/");
    expect(suffix).not.toContain("do not create a nested openwiki/ directory");
  });
});

describe("createSystemPrompt absolute-path rule is engine-aware", () => {
  test("deepagents forbids host absolute paths", () => {
    const prompt = createSystemPrompt("init", "local-wiki", "deepagents");

    expect(prompt).toContain("Never pass host absolute paths");
    expect(prompt).not.toContain("--add-dir");
  });

  test("agent-cli allows absolute paths for --add-dir evidence reads", () => {
    const prompt = createSystemPrompt("init", "local-wiki", "agent-cli");

    expect(prompt).toContain("--add-dir");
    expect(prompt).not.toContain("Never pass host absolute paths");
  });
});
