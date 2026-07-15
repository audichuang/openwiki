import { describe, expect, test } from "vitest";
import { createSystemPrompt } from "../src/agent/prompt.ts";

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
