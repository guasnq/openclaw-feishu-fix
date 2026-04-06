import { buildReport } from "./report.js";
import { formatStatus, printKv, printSection } from "./utils.js";

function printHuman(report) {
  printSection("Environment");
  printKv("OpenClaw version", report.environment.packageVersion);
  printKv("OpenClaw root", report.environment.packageRoot);
  printKv("Install mode", report.environment.installMode);
  printKv("Binary", report.environment.openclawBinary ?? "not found");
  printKv("Config", report.environment.configPath);
  printKv("Feishu monitor bundle", report.environment.monitorFeishuFile);
  printKv("Platform", `${report.environment.platform}/${report.environment.arch}`);

  printSection("Config");
  printKv("Media roots", `${formatStatus(report.checks.config.mediaRootsApplied)} (${report.checks.config.configuredMediaRoots.length} configured)`);
  if (report.checks.config.missingMediaRoots.length > 0) printKv("Missing media roots", report.checks.config.missingMediaRoots.join(", "));
  printKv("Typing reduction", `${formatStatus(report.checks.config.typingReductionApplied)}${report.checks.config.accountsWithTypingEnabled.length ? ` (${report.checks.config.accountsWithTypingEnabled.join(", ")})` : ""}`);
  printKv("Streaming reduction", `${formatStatus(report.checks.config.streamingReductionApplied)}${report.checks.config.accountsWithStreamingEnabled.length ? ` (${report.checks.config.accountsWithStreamingEnabled.join(", ")})` : ""}`);

  printSection("Runtime Patch");
  printKv("Feishu media reply patch", formatStatus(report.checks.monitor.mediaReplyPatchApplied));
  printKv("Feishu backoff guard", formatStatus(report.checks.monitor.backoffGuardPresent));

  printSection("Summary");
  printKv("Support status", report.support.status);
  printKv("Patch family", report.support.patchFamily);
  printKv("Diagnosis", report.summary.ok ? "OK" : "ISSUES FOUND");
  printKv("Issue count", report.summary.issueCount);
  for (const reason of report.support.reasons) {
    printKv(reason.code, `[${reason.level}] ${reason.message}`);
  }
  for (const issue of report.issues) {
    printKv(issue.id, `[${issue.severity}] ${issue.title}`);
  }
}

export async function runDoctor({ json = false } = {}) {
  const report = await buildReport();
  if (!json) printHuman(report);
  return report;
}
