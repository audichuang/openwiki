import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const WIKI_DIR_PREFIX = "openwiki/";
const OUT_OF_WIKI_WARNING_LIMIT = 10;

// The claude-code allowlist grants unscoped Write/Edit/MultiEdit and the runner
// now passes --add-dir, so the vendor CLI's cwd boundary no longer guarantees
// writes land only under openwiki/. This is a warn-only detector (never blocks
// a run) for repository-mode runs that touched files outside openwiki/.

/**
 * Compares two `git status --porcelain` (v1) captures and returns changed paths
 * OUTSIDE openwiki/ that appear post-run but were not already dirty pre-run, so
 * a pre-existing dirty tree is never blamed on the CLI agent. Handles the
 * rename form `R  old -> new` (both sides checked) and C-quoted paths
 * (core.quotePath). Duplicate paths are collapsed, preserving first-seen order.
 */
export function findUnexpectedChanges(
  baselinePorcelain: string,
  porcelainOutput: string,
): string[] {
  const baseline = new Set(collectOutOfWikiPaths(baselinePorcelain));

  return collectOutOfWikiPaths(porcelainOutput).filter(
    (filePath) => !baseline.has(filePath),
  );
}

function collectOutOfWikiPaths(porcelainOutput: string): string[] {
  const outOfWiki: string[] = [];

  for (const rawLine of porcelainOutput.split("\n")) {
    if (rawLine.trim().length === 0) {
      continue;
    }

    for (const filePath of extractPorcelainPaths(rawLine)) {
      if (
        !filePath.startsWith(WIKI_DIR_PREFIX) &&
        !outOfWiki.includes(filePath)
      ) {
        outOfWiki.push(filePath);
      }
    }
  }

  return outOfWiki;
}

function extractPorcelainPaths(line: string): string[] {
  // Porcelain v1 lines are "XY <path>" or "XY <old> -> <new>": two status
  // columns plus a separating space, so the path section starts at index 3.
  const status = line.slice(0, 2);
  const pathSection = line.slice(3);
  // Rename/copy entries (X or Y is R/C) encode both paths as "old -> new".
  // Git only C-quotes paths with control chars, '"', '\', or non-ASCII bytes,
  // so an ordinary filename containing a literal " -> " stays unquoted; gating
  // the split on rename/copy status keeps such paths intact.
  const tokens =
    /[RC]/.test(status) && pathSection.includes(" -> ")
      ? pathSection.split(" -> ")
      : [pathSection];

  return tokens
    .map((token) => unquotePorcelainPath(token))
    .filter((token) => token.length > 0);
}

function unquotePorcelainPath(token: string): string {
  const trimmed = token.trim();

  if (
    !trimmed.startsWith('"') ||
    !trimmed.endsWith('"') ||
    trimmed.length < 2
  ) {
    return trimmed;
  }

  // C-style quoting: decode the common escapes. Octal byte escapes are left
  // as-is; the openwiki/ prefix check only needs the leading path segment.
  return trimmed
    .slice(1, -1)
    .replace(/\\([\\"])/g, "$1")
    .replace(/\\t/g, "\t")
    .replace(/\\n/g, "\n");
}

/**
 * Captures `git status --porcelain` at cwd, or null when there is nothing to
 * guard against (not a git repo, git missing, or the command failed).
 */
export async function captureGitPorcelain(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
      cwd,
      timeout: 10_000,
    });

    return stdout;
  } catch {
    return null;
  }
}

/** Human-facing warning text for out-of-wiki changes, or null if there are none. */
export function formatOutOfWikiWarning(unexpected: string[]): string | null {
  if (unexpected.length === 0) {
    return null;
  }

  const shown = unexpected.slice(0, OUT_OF_WIKI_WARNING_LIMIT);
  const overflow = unexpected.length - shown.length;
  const list = shown.map((filePath) => `  - ${filePath}`).join("\n");
  const suffix = overflow > 0 ? `\n  ...and ${overflow} more` : "";

  return (
    "WARNING: the CLI agent changed files outside the openwiki/ wiki directory. " +
    "OpenWiki repository runs should only write generated pages under openwiki/. " +
    `Review these unexpected changes:\n${list}${suffix}`
  );
}
