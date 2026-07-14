export { recordRun } from "./senders.js";
export { firstRunNoticePending } from "./install-id.js";
export {
  FIRST_RUN_NOTICE_BODY,
  FIRST_RUN_NOTICE_OPT_OUT,
  FIRST_RUN_NOTICE_VERIFY,
} from "./config.js";
export { classifyError } from "./errors.js";
export { isCiEnvironment, isTelemetryDisabled } from "./gates.js";
export type {
  RunTelemetry,
  TelemetryContext,
  TelemetryErrorClass,
  TelemetryExecution,
  TelemetryMode,
} from "./types.js";
