import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { capture } from "./client.js";
import { DEFAULT_POSTHOG_HOST, TELEMETRY_RUN_EVENT } from "./config.js";
import { getTelemetryEnv } from "./environment.js";
import { ciSentinelId, isCiEnvironment, isTelemetryDisabled } from "./gates.js";
import { getOrCreateInstallId } from "./install-id.js";
import type {
  RunTelemetry,
  TelemetryContext,
  TelemetryEvent,
  TelemetryExecution,
} from "./types.js";

/**
 * Records a completed init/update run: the single event OpenWiki emits. Each
 * configured connector rides along as a boolean `connector_<id>` property.
 * Never throws. (Chat is not recorded.)
 */
export async function recordRun(details: RunTelemetry): Promise<void> {
  await send(
    TELEMETRY_RUN_EVENT,
    {
      command: details.command,
      mode: details.mode,
      provider: details.provider,
      model_id: details.modelId,
      base_url_override: details.baseUrlOverride,
      outcome: details.outcome,
      ...(details.errorClass ? { error_class: details.errorClass } : {}),
      duration_ms: details.durationMs,
      ...connectorProperties(details.configuredConnectors),
      flags: details.flags,
    },
    { context: details.context, telemetryFile: details.telemetryFile },
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
 * Options every recorder forwards to `send`.
 */
interface SendOptions {
  /**
   * Caller-reported invocation label; overridden to "ci" in CI.
   */
  context?: TelemetryContext;

  /**
   * Tee target from --telemetry-file, if any.
   */
  telemetryFile?: string;
}

/**
 * Shared path for all recorders: gate, resolve id, stamp `execution`, capture,
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
    const env = getTelemetryEnv();
    const ci = isCiEnvironment();
    const distinctId = ci ? ciSentinelId() : (await getOrCreateInstallId()).id;
    // Caller reports interactive/print/cli; the environment overrides to "ci".
    const execution: TelemetryExecution = ci
      ? "ci"
      : (options.context ?? "cli");
    const event: TelemetryEvent = {
      distinctId,
      event: eventName,
      properties: {
        ...properties,
        // Coarse environment, stamped once here for every event.
        app_version: env.appVersion,
        os: env.os,
        arch: env.arch,
        node_version: env.nodeVersion,
        execution,
        // Human runs are identified (enables retention/lifecycle); CI runs stay
        // anonymous (the sentinel would collapse to one meaningless person, and
        // this keeps the high-volume CI stream on the cheap event tier).
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
