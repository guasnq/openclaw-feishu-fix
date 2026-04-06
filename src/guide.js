import { buildReport } from "./report.js";

function buildGuideLines(report) {
  const lines = [];
  lines.push(`结论: ${report.summary.ok ? "当前未检测到这两类 Feishu 关键问题。" : `检测到 ${report.summary.issueCount} 个问题。`}`);
  lines.push(`环境: OpenClaw ${report.environment.packageVersion} | ${report.environment.platform}/${report.environment.arch}`);
  lines.push(`支持状态: ${report.support.status} | Patch family: ${report.support.patchFamily}`);
  if (report.support.reasons.length > 0) {
    lines.push("兼容性说明:");
    for (const reason of report.support.reasons) {
      lines.push(`- [${reason.level}] ${reason.code}: ${reason.message}`);
    }
  }
  if (report.summary.ok) return lines;
  for (const issue of report.issues) {
    lines.push("");
    lines.push(`[${issue.severity}] ${issue.title}`);
    lines.push(`问题 ID: ${issue.id}`);
    lines.push(`类型: ${issue.category}`);
    lines.push(`说明: ${issue.summary}`);
    if (issue.guidance?.targetFiles?.length) lines.push(`建议关注文件: ${issue.guidance.targetFiles.join(" | ")}`);
    for (const instruction of issue.guidance?.instructions ?? []) {
      lines.push(`- ${instruction}`);
    }
  }
  lines.push("");
  lines.push("给用户自己的 agent 的建议用法:");
  lines.push("- 先运行 `openclaw-feishu-fix report --json`。");
  lines.push("- 让 agent 读取 issues 数组，按 targetFiles 和 instructions 执行。");
  lines.push("- 修改完成后，再运行 `openclaw-feishu-fix verify`。");
  return lines;
}

export async function runGuide({ json = false } = {}) {
  const report = await buildReport();
  const guide = {
    reportSummary: report.summary,
    environment: report.environment,
    lines: buildGuideLines(report)
  };
  if (!json) console.log(guide.lines.join("\n"));
  return guide;
}
