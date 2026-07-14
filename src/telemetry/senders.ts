import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { capture } from "./client.js";
import { DEFAULT_POSTHOG_HOST, TELEMETRY_RUN_EVENT } from "./config.js";
import { ciSentinelId, isCiEnvironment, isTelemetryDisabled } from "./gates.js";
import { getOrCreateInstallId } from "./install-id.js";
import type { RunTelemetry, TelemetryEvent } from "./types.js";

/**
 * Records a completed init/update run: the single event OpenWiki emits. The
 * setup fields (mode, provider, connectors) are only present on init, so they
 * are omitted from the payload when the caller leaves them undefined. Never
 * throws. (Chat is not recorded.)
 */
export async function recordRun(details: RunTelemetry): Promise<void> {
  await send(
    TELEMETRY_RUN_EVENT,
    {
      command: details.command,
      outcome: details.outcome,
      ...(details.errorClass ? { error_class: details.errorClass } : {}),
      ...(details.mode ? { mode: details.mode } : {}),
      ...(details.provider ? { provider: details.provider } : {}),
      ...connectorProperties(details.configuredConnectors ?? []),
    },
    { telemetryFile: details.telemetryFile },
  );
}

/**
 * Turns configured connector ids into boolean event properties, e.g.
 * `["web-search", "notion"]` -> `{ connector_web_search: true, connector_notion: true }`.
 * Only configured connectors appear; absence means "not configured".
 */
function connectorProperties(configured: string[]): Record<string, true> {
  return Object.fromEntries(
    configured.map((id) => [`connector_${id.replace(/-/g, "_")}`, true]),
  );
}

/**
 * Options `recordRun` forwards to `send`.
 */
interface SendOptions {
  /**
   * Tee target from --telemetry-file, if any.
   */
  telemetryFile?: string;
}

/**
 * Gate, resolve identity, stamp the `ci` split and person-profile flag, capture,
 * and optionally tee. Explicitly never throws.
 */
async function send(
  eventName: string,
  properties: Record<string, unknown>,
  options: SendOptions = {},
): Promise<void> {
  if (isTelemetryDisabled()) {
    await writeTelemetryFile(options.telemetryFile, {
      disabled: true,
      sent: false,
    });
    return;
  }

  try {
    const ci = isCiEnvironment();
    const distinctId = ci ? ciSentinelId() : (await getOrCreateInstallId()).id;
    const event: TelemetryEvent = {
      distinctId,
      event: eventName,
      properties: {
        ...properties,
        // Splits any metric human vs CI; also drives identity below.
        ci,
        // Human runs are identified (enables distinct-install counts and
        // retention); CI runs stay anonymous (the sentinel would otherwise
        // collapse to one meaningless, always-active person and skew both).
        $process_person_profile: !ci,
      },
    };
    const sent = await capture(event);

    await writeTelemetryFile(options.telemetryFile, {
      disabled: false,
      ci,
      host: DEFAULT_POSTHOG_HOST,
      sent,
      event,
    });
  } catch {
    // Intentionally ignored: telemetry must never break a run.
  }
}

async function writeTelemetryFile(
  filePath: string | undefined,
  record: Record<string, unknown>,
): Promise<void> {
  if (!filePath) {
    return;
  }

  try {
    const resolved = path.resolve(process.cwd(), filePath);
    await mkdir(path.dirname(resolved), { recursive: true });
    await writeFile(resolved, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `OpenWiki: could not write telemetry file "${filePath}": ${message}`,
    );
  }
}
