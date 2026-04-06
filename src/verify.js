import { detectEnvironment } from "./detect.js";
import { runChecks } from "./checks.js";
import { formatStatus, printKv, printSection } from "./utils.js";

function describePresence(enabledAccounts) {
  return enabledAccounts.length > 0 ? `enabled (${enabledAccounts.join(", ")})` : "disabled";
}

function printHuman(result) {
  printSection("Verify");
  printKv("Config media roots", formatStatus(result.checks.config.mediaRootsApplied));
  printKv("Typing indicator", describePresence(result.checks.config.accountsWithTypingEnabled));
  printKv("Streaming", describePresence(result.checks.config.accountsWithStreamingEnabled));
  printKv("Media reply patch", formatStatus(result.checks.monitor.mediaReplyPatchApplied));
  printKv("Backoff guard", formatStatus(result.checks.monitor.backoffGuardPresent));
  printKv("Config validate", formatStatus(result.validation.configValidate.ok));
  printKv("Workspace media load", formatStatus(result.validation.workspaceMediaAccess.ok));
  if (!result.validation.workspaceMediaAccess.ok && result.validation.workspaceMediaAccess.reason) {
    printKv("Media load reason", result.validation.workspaceMediaAccess.reason);
  }
}

export async function runVerify({ json = false } = {}) {
  const env = await detectEnvironment();
  const checks = await runChecks(env);
  const validation = checks.validation;
  const ok = checks.config.mediaRootsApplied && checks.monitor.mediaReplyPatchApplied && validation.configValidate.ok && validation.workspaceMediaAccess.ok;
  const result = {
    ok,
    environment: {
      packageVersion: env.packageVersion,
      configPath: env.configPath,
      monitorFeishuFile: env.monitorFeishuFile
    },
    checks,
    validation
  };
  if (!json) printHuman(result);
  return result;
}
