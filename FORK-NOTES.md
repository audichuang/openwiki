# Fork notes — `feat/agent-cli-grok-and-claude`

Personal fork (`audichuang/openwiki`) that integrates two still-open upstream
PRs and hardens them. This file is the durable record of what diverges from
upstream and why. High-level status lives in `AGENTS.md`; this is the detail.

- **Base:** upstream `main` `d43bd4f` (AWS Bedrock #327).
- **Integrates:** [#280](https://github.com/langchain-ai/openwiki/pull/280)
  (`grok-build`) + [#181](https://github.com/langchain-ai/openwiki/pull/181)
  (`claude-code`) — both still OPEN upstream, both conflict with `main`.
- **Not** [#293](https://github.com/langchain-ai/openwiki/pull/293) (competing
  `cli-runner` design). We keep one agent-cli stack under `src/agent/engines/`
  and graft #293's good ideas instead of merging it.

## Timeline

### 2026-07-15 — rebase + first fix

| Commit    | What                                                                                                                                                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e7367e5` | Squash-merge #280 + #181 onto latest `main` (was on a 07-11 base); re-resolved conflicts in `constants.ts`/`agent/index.ts`/`cli.tsx`/`env.ts`/`credentials.tsx`/`README.md`. `ProviderConfig` became a `kind`-discriminated union. |
| `2f98fff` | Trim `AGENTS.md` branch-status: fix remote facts, drop session/changelog noise.                                                                                                                                                     |
| `d3587ec` | Reduce claude-code tool failures in personal multi-root mode: `--add-dir`, read-only Bash discovery allowlist, engine-branched prompt wording.                                                                                      |

### 2026-07-16 — completeness + upstream grafts (TDD, per-commit verified)

**Finish the runtime-note fix (Codex review found it incomplete)**

| Commit    | What                                                                                                                                                                                                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `c27503d` | Engine-branched runtime note (`createRuntimeNote`): DeepAgents = virtual root, agent-cli = real filesystem. Fixed stale repo-mode wording, extracted mode-aware `createAgentCliSystemSuffix`, made the absolute-path rule engine-aware (agent-cli may read `--add-dir` evidence). |
| `303af31` | `runAgentCliRun` persists metadata on late failure (mirrors the API path). `formatProviderSwitchNotice` stops claiming a bogus default model for empty-modelOptions providers (bedrock, openai-compatible) — idea from #167.                                                      |

**Merge low-risk upstream PRs**

| Commit    | Upstream | What                                                                                                                                         |
| --------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `bdf1e55` | #287     | Isolate stdio MCP child env from OpenWiki credentials (allowlist, not full `process.env`).                                                   |
| `d9fefac` | #215     | Suppress file/image content blocks in streamed output (fix landed in `extractContentBlockText`; #215's own test was stale vs the v3 stream). |
| `a9c29fa` | #289     | Warn when the configured model belongs to a different provider (union-safe; agent-cli aliases don't false-trigger).                          |
| `74670c0` | #175     | Broaden `test/prompt.test.ts` coverage, merged with our backlog/coverage tests.                                                              |

**Graft #293's improvements (not a merge)**

| Commit    | What                                                                                                                                                                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `396faf5` | Per-provider login copy — claude-code no longer told to run `grok login`. New `loginCommand` config field + `getProviderLoginCommand`.                                                                                                                    |
| `a150420` | Persistent CLI session store (`~/.openwiki/cli-sessions.json`, provider-tagged, corrupt-tolerant) replacing the in-memory Map, so chat follow-ups resume across processes; plus stale-resume fallback. Path overridable via `OPENWIKI_CLI_SESSIONS_PATH`. |
| `5feed63` | Warn-only guard for repository-mode writes outside `openwiki/` (baseline vs post-run `git status --porcelain`; handles renames/quoted paths). Never fails a run.                                                                                          |

## Upstream PR disposition

- **Merged:** #287, #215, #289, #175.
- **Grafted (ideas, not merged):** #293 (session store, resume fallback, login copy, write guard), #167 (empty-modelOptions default fix — concept only, not the raw `getDefaultModelId → null` refactor).
- **Skipped:** #158 (breaks the `kind` discriminated union + redundant with our provider inference); DeepAgents-only PRs low-value for this agent-cli-focused fork (#267, #281, #336, #165, #189, #273); #205/#160 (heavier alt auth paths our claude-code provider already covers).

## New / notable files vs upstream

- `src/agent/engines/{types,runner,index,claude-code,grok-build}.ts` — agent-cli stack (#280 + #181).
- `src/agent/engines/session-store.ts` — persistent thread→session map.
- `src/agent/engines/write-guard.ts` — out-of-wiki write detector.
- `src/agent/tool-format.ts`, `src/credentials-flow.ts` — from the integrated PRs.

## Install & use

```sh
git checkout feat/agent-cli-grok-and-claude
pnpm install && pnpm run build && pnpm link --global

OPENWIKI_PROVIDER=grok-build  OPENWIKI_MODEL_ID=grok-4.5  openwiki …
OPENWIKI_PROVIDER=claude-code OPENWIKI_MODEL_ID=default   openwiki …   # needs `claude` logged in
```

## Caveats

- Not an official release; do not treat as `npm install -g openwiki` behavior.
- Both integrated PRs are still open upstream — a future rebase onto `main` will
  re-open conflicts in `constants.ts`/`agent/index.ts`/`engines`.
- Verified at `5feed63`: typecheck, lint, format, `pnpm test` (376), build all pass.
