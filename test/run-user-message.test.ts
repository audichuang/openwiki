import { describe, expect, test } from "vitest";
import { createRunUserMessage } from "../src/agent/index.ts";
import type { RunContext } from "../src/agent/types.ts";

const context: RunContext = { lastUpdate: null, gitSummary: "" };
const cwd = "/home/u/.openwiki/wiki";

describe("createRunUserMessage runtime note wiring", () => {
  test("deepagents (API path) gets virtual-filesystem guidance", () => {
    const message = createRunUserMessage(
      "init",
      cwd,
      context,
      { outputMode: "local-wiki" },
      "deepagents",
    );

    expect(message).toContain("virtual root");
    expect(message).not.toContain("Absolute paths are allowed");
  });

  test("agent-cli path gets real-filesystem guidance", () => {
    const message = createRunUserMessage(
      "init",
      cwd,
      context,
      { outputMode: "local-wiki" },
      "agent-cli",
    );

    expect(message).toContain("real filesystem");
    expect(message).not.toContain("virtual root");
  });
});
