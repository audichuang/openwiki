import type { OpenWikiCommand, OpenWikiRunEvent } from "../types.js";

export type EngineRunSpec = {
  command: OpenWikiCommand;
  cwd: string;
  /**
   * User / combined prompt body. For `prompt-file` delivery the runner may
   * prepend {@link EngineRunSpec.systemPrompt}; for `stdin` delivery this is
   * written to the child's stdin.
   */
  prompt: string;
  /**
   * OpenWiki system instructions. File-based CLIs get this concatenated into
   * the temp prompt file; stdin-based CLIs (Claude Code) pass it via
   * `--append-system-prompt`.
   */
  systemPrompt: string;
  /** Vendor session id to resume for interactive follow-ups. */
  resumeSessionId?: string;
  /**
   * Model id. Vendor-specific: Grok uses concrete ids like `grok-4.5`; Claude
   * Code may use `default` / `sonnet` / `opus` / `haiku`.
   */
  modelId: string;
};

export type AgentCliEvent =
  | { type: "openwiki"; event: OpenWikiRunEvent }
  | { type: "session"; sessionId: string }
  | { type: "result"; ok: boolean; errorMessage?: string };

export type AgentCliInstallStatus = {
  found: boolean;
  version?: string;
};

/**
 * Stateful stream parser. Holds buffer across NDJSON lines so partial text
 * tokens can be coalesced before OpenWiki surfaces them.
 */
export type AgentCliStreamParser = {
  parse(line: unknown): AgentCliEvent[];
  /** Flush any remaining buffered output once the process exits. */
  flush(): AgentCliEvent[];
};

/** How the runner delivers {@link EngineRunSpec.prompt} to the vendor CLI. */
export type AgentCliPromptDelivery = "prompt-file" | "stdin";

export type AgentCliAdapter = {
  id: string;
  promptDelivery: AgentCliPromptDelivery;
  detectInstall(binary: string): Promise<AgentCliInstallStatus>;
  /**
   * Builds CLI args. When `promptDelivery` is `prompt-file`, the runner writes
   * the prompt to a temp file and passes its path as `promptFilePath`. For
   * `stdin`, `promptFilePath` is null and the prompt is piped to stdin.
   */
  buildArgs(spec: EngineRunSpec, promptFilePath: string | null): string[];
  createParser(): AgentCliStreamParser;
};
