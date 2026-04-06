import { buildReport } from "./report.js";

function printHuman(report) {
  console.log(`Diagnosis: ${report.summary.ok ? "OK" : "ISSUES FOUND"}`);
  console.log(`OpenClaw: ${report.environment.packageVersion} on ${report.environment.platform}/${report.environment.arch}`);
  console.log(`Support: ${report.support.status} (${report.support.patchFamily})`);
  console.log(`Issues: ${report.summary.issueCount}`);
  for (const reason of report.support.reasons) {
    console.log(`- [${reason.level}] ${reason.code}: ${reason.message}`);
  }
  for (const issue of report.issues) {
    console.log(`- [${issue.severity}] ${issue.id}: ${issue.title}`);
  }
}

export async function runReport({ json = false } = {}) {
  const report = await buildReport();
  if (!json) printHuman(report);
  return report;
}
