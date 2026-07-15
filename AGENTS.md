# OpenWiki

TypeScript CLI that runs an agent to create/maintain wikis for a **code repo** (`openwiki/`) or a **personal brain** (`~/.openwiki/wiki`). Not a general agent framework.

Canonical user docs: [README.md](README.md), [DEVELOPMENT.md](DEVELOPMENT.md). Generated wiki (this repo's own docs): start at [openwiki/quickstart.md](openwiki/quickstart.md).

## Dev

- **Node ≥ 20**, **pnpm only** (see `packageManager` in `package.json`).
- Install / typecheck / test / build:

```sh
pnpm install
pnpm run typecheck
pnpm test                 # full suite before handoff
pnpm exec vitest run path/to/file.test.ts   # preferred while iterating
pnpm run build            # emits dist/; prebuild cleans
pnpm link --global        # optional: use local openwiki on PATH
```

- Local credentials live in `~/.openwiki/.env` (gitignored). Never commit secrets or paste them into docs.

## Hard rules

1. **`openwiki/` pages are generated** — do not hand-edit unless the user explicitly asks; change source/prompt/behavior and re-run OpenWiki.
2. **Leave the OpenWiki marker block alone** — `<!-- OPENWIKI:START -->` … `<!-- OPENWIKI:END -->` in this file / `CLAUDE.md` is rewritten by OpenWiki; put durable agent notes _outside_ it.
3. **Provider config is centralized** — add/change providers in `src/constants.ts` (`PROVIDER_CONFIGS`, `OpenWikiProvider`, `SELECTABLE_OPENWIKI_PROVIDERS`) plus the model/dispatch branch in `src/agent/index.ts`. Agent-CLI providers also need an adapter under `src/agent/engines/`.
4. **Two run engines** — `kind: "api"` goes through DeepAgents + LangChain models; `kind: "agent-cli"` spawns a local vendor CLI (subscription login, no OpenWiki API key). Do not force agent-cli into the API-key onboarding path.
5. **Agent-CLI prompt delivery differs by vendor** — shared runner in `src/agent/engines/runner.ts`; adapters declare `promptDelivery`:
   - `prompt-file` (e.g. Grok Build): system+user concatenated into a temp file.
   - `stdin` (e.g. Claude Code): system via CLI flag, user on stdin.
6. **Docs-only writes for API path** — DeepAgents uses `OpenWikiLocalShellBackend` (`src/agent/docs-only-backend.ts`). Agent-CLI trusts the vendor CLI + allowlists/flags; keep that boundary explicit when changing adapters.
7. **CLI semantics are split** — parser/help in `src/commands.ts`, UI lifecycle in `src/cli.tsx`, agent run in `src/agent/*`. Change user-visible behavior in the right place(s).
8. **Ask before** force-push, `git push` to shared remotes the user did not request, deleting data, or broad dependency upgrades.

## Where to start (judgment, not a file tree)

| Concern                  | Start here                                                         |
| ------------------------ | ------------------------------------------------------------------ |
| CLI / modes / `--init`   | `src/commands.ts`, `src/cli.tsx`, `src/startup.ts`                 |
| Provider list / env keys | `src/constants.ts`, `src/env.ts`                                   |
| Agent run + metadata     | `src/agent/index.ts`, `src/agent/prompt.ts`, `src/agent/utils.ts`  |
| Agent-CLI adapters       | `src/agent/engines/{types,runner,index,claude-code,grok-build}.ts` |
| Connectors / ingest      | `src/connectors/`, `src/ingestion.ts`                              |
| Credential onboarding    | `src/credentials.tsx`, `src/credentials-flow.ts`                   |

Full structure: use the repo tree / search; do not maintain a second inventory here.

## Branch status — `feat/agent-cli-grok-and-claude`

**Remote:** fork `audichuang/openwiki` (`git remote fork`). Upstream remains `langchain-ai/openwiki` (`origin`).

**What this branch is:** a **local merge** of upstream PRs that are still open and each conflict with `main`:

| Upstream PR                                               | Intent                                                |
| --------------------------------------------------------- | ----------------------------------------------------- |
| [#280](https://github.com/langchain-ai/openwiki/pull/280) | `grok-build` — Grok Build CLI subscription provider   |
| [#181](https://github.com/langchain-ai/openwiki/pull/181) | `claude-code` — Claude Code CLI subscription provider |

**Not included:** [#293](https://github.com/langchain-ai/openwiki/pull/293) (competing `cli-runner` design for the same Claude/Codex idea). Prefer one agent-cli stack (`src/agent/engines/`), not two.

**What we did (session work):**

1. Checked out / built #280; `pnpm link --global` for local `openwiki`.
2. Configured personal mode for CAT multi-repo workspace (`~/.openwiki` + `git-repo` connector); code mode alone does not fit a non-git multi-repo root.
3. Merged #181 onto #280 as `feat/agent-cli-grok-and-claude`, resolved heavy conflicts (both PRs invented engines interfaces).
4. Unified runner: `promptDelivery` + both adapters registered; tests updated for current CLI (`code --init`, `outputMode: "repo-docs"`).
5. Verified: `pnpm run typecheck`, `pnpm run lint:check`, `pnpm test` (**243**), `pnpm run build`.
6. Forked to `audichuang/openwiki` and pushed this branch.

**How to use subscription CLIs on this branch:**

```sh
# Grok (already common default in local ~/.openwiki/.env for this machine)
OPENWIKI_PROVIDER=grok-build OPENWIKI_MODEL_ID=grok-4.5 openwiki …

# Claude Code (requires local `claude` logged into a subscription)
OPENWIKI_PROVIDER=claude-code OPENWIKI_MODEL_ID=default openwiki …
# optional: OPENWIKI_CLAUDE_CODE_BINARY=/path/to/claude
```

**Rebased onto latest `main`** (`d43bd4f`, AWS Bedrock #327): both PRs are still
open upstream and unmerged, so the integrated feature set was squash-merged onto
the current `main`. Conflicts re-resolved in `constants.ts` (provider list/union,
`ProviderConfig` discriminated union now requires `kind`), `agent/index.ts`
(`finalizeAgentRun` uses `persistRunMetadataIfChanged`), `cli.tsx`, `env.ts`,
`credentials.tsx`, `README.md`. Verified: typecheck, lint, format, `pnpm test`
(**313**), build.

**Caveats for future agents on this branch:**

- New upstream `main` providers (bedrock/nebius/…) merge cleanly with the
  agent-cli stack; keep the `kind: "api" | "agent-cli"` discriminator intact when
  adding providers so the region/secret helpers narrow correctly.
- This is **not** an official release; do not treat as `npm install -g openwiki` behavior.
- Prefer scoped vitest while iterating; full suite before push/PR.

<!-- OPENWIKI:START -->

## OpenWiki

This repository uses OpenWiki for recurring code documentation. Start with `openwiki/quickstart.md`, then follow its links to architecture, workflows, domain concepts, operations, integrations, testing guidance, and source maps.

The scheduled OpenWiki GitHub Actions workflow refreshes the repository wiki. Do not hand-edit generated OpenWiki pages unless explicitly asked; prefer updating source code/docs and letting OpenWiki regenerate.

<!-- OPENWIKI:END -->
