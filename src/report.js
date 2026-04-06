import os from "node:os";
import path from "node:path";
import { runChecks } from "./checks.js";
import { detectEnvironment } from "./detect.js";

function buildInstallMode(env) {
  if (env.packageRoot.includes(path.join("Cellar", "openclaw")) || env.packageRoot.includes("/opt/homebrew/")) return "homebrew";
  if (env.packageRoot.includes(path.join("node_modules", "openclaw"))) return "node-global";
  if (env.packageRoot.includes(".pnpm")) return "pnpm-global";
  return "unknown";
}

function compareVersionPrefix(version, prefix) {
  return typeof version === "string" && version.startsWith(prefix);
}

function buildSupport(env, checks) {
  const capabilities = {
    inspectConfig: Boolean(env.configPath),
    inspectRuntimeBundle: Boolean(env.monitorFeishuFile),
    verifyWorkspaceMediaAccess: Boolean(env.webMediaEntry && env.localRootsEntry && env.workspaceSampleFile),
    suggestConfigFixes: true,
    suggestRuntimeFixes: Boolean(env.monitorFeishuFile),
    autoApplyConfigFixes: true,
    autoApplyRuntimeFixes: Boolean(env.monitorFeishuFile)
  };
  const reasons = [];
  if (!compareVersionPrefix(env.packageVersion, "2026.4.")) {
    reasons.push({
      code: "runtime_family_unconfirmed",
      level: "warn",
      message: `当前 runtime patch 主要按 2026.4.x 的 bundle 结构验证；当前版本是 ${env.packageVersion}。`
    });
  }
  if (!env.monitorFeishuFile) {
    reasons.push({
      code: "feishu_monitor_bundle_not_found",
      level: "error",
      message: "未识别到 Feishu monitor bundle，无法做 runtime 级诊断。"
    });
  }
  if (!env.workspaceSampleFile) {
    reasons.push({
      code: "workspace_sample_missing",
      level: "warn",
      message: "未找到 workspace 样本文件，workspace 媒体加载验证会降级。"
    });
  }
  if (!checks.validation.configValidate.ok) {
    reasons.push({
      code: "config_invalid",
      level: "error",
      message: "当前 openclaw.json 未通过 validate，所有后续修改都应该先修配置。"
    });
  }
  let status = "supported";
  if (reasons.some((reason) => reason.level === "error")) status = "partial";
  if (!capabilities.inspectConfig) status = "unsupported";
  return {
    status,
    capabilities,
    reasons,
    patchFamily: compareVersionPrefix(env.packageVersion, "2026.4.") ? "openclaw-2026.4.x" : "unknown"
  };
}

function makeIssue(id, params) {
  return {
    id,
    title: params.title,
    severity: params.severity,
    category: params.category,
    detected: params.detected,
    summary: params.summary,
    evidence: params.evidence,
    guidance: params.guidance
  };
}

function buildIssues(env, checks) {
  const issues = [];
  if (!checks.config.mediaRootsApplied) {
    issues.push(makeIssue("feishu_media_local_roots_missing", {
      title: "Feishu mediaLocalRoots 未覆盖所有 agent workspace",
      severity: "high",
      category: "config",
      detected: true,
      summary: "本地文件/图片通过 Feishu 聊天直发时，部分 agent workspace 不在允许目录内。",
      evidence: {
        configPath: env.configPath,
        missingMediaRoots: checks.config.missingMediaRoots
      },
      guidance: {
        strategy: "config_update",
        targetFiles: [env.configPath],
        instructions: [
          "检查 channels.feishu.mediaLocalRoots。",
          "把 /tmp 和各 agent 的 workspace 绝对路径补进去。",
          "不要放开整个 ~/.openclaw 或系统根目录。"
        ]
      }
    }));
  }
  if (!checks.monitor.mediaReplyPatchApplied) {
    issues.push(makeIssue("feishu_media_reply_runtime_gap", {
      title: "Feishu reply 链路没有把 agent-scoped media roots 传给 sendMediaFeishu",
      severity: "critical",
      category: "runtime",
      detected: true,
      summary: "即便配置里有 mediaLocalRoots，Feishu 回复链路仍可能把 workspace 文件误判为不允许发送。",
      evidence: {
        monitorFeishuFile: env.monitorFeishuFile,
        importApplied: checks.monitor.importApplied,
        scopedRootsApplied: checks.monitor.scopedRootsApplied,
        sendMediaApplied: checks.monitor.sendMediaApplied
      },
      guidance: {
        strategy: "runtime_patch",
        targetFiles: [env.monitorFeishuFile],
        instructions: [
          "找到 Feishu reply dispatcher 中的 sendMediaReplies。",
          "在该 dispatcher 作用域里先计算 getAgentScopedMediaLocalRoots(cfg, agentId)。",
          "调用 sendMediaFeishu(...) 时，把 mediaLocalRoots 透传进去。",
          "改完后重启 gateway，并用 workspace 内真实附件做一次发送验证。"
        ]
      }
    }));
  }
  if (!checks.validation.workspaceMediaAccess.ok) {
    issues.push(makeIssue("feishu_workspace_media_access_failed", {
      title: "workspace 样本文件无法通过 OpenClaw 媒体加载验证",
      severity: "high",
      category: "verification",
      detected: true,
      summary: "当前环境下，至少有一个 workspace 内样本文件仍无法按预期进入 Feishu 媒体发送链路。",
      evidence: checks.validation.workspaceMediaAccess,
      guidance: {
        strategy: "verify_and_trace",
        targetFiles: [env.configPath, env.monitorFeishuFile],
        instructions: [
          "先确认样本文件真实存在。",
          "再检查 mediaLocalRoots 和 Feishu reply runtime patch 是否都已生效。",
          "如果仍失败，沿 gateway.err.log 追 LocalMediaAccessError 的具体路径。"
        ]
      }
    }));
  }
  if (!checks.config.typingReductionApplied) {
    issues.push(makeIssue("feishu_typing_indicator_noise", {
      title: "Feishu typingIndicator 仍开启，可能导致高频 API 调用",
      severity: "medium",
      category: "config",
      detected: true,
      summary: "持续的 typing keepalive 会额外增加 Feishu API 调用压力。",
      evidence: {
        configPath: env.configPath,
        accountsWithTypingEnabled: checks.config.accountsWithTypingEnabled
      },
      guidance: {
        strategy: "config_update",
        targetFiles: [env.configPath],
        instructions: [
          "在每个 channels.feishu.accounts.<accountId> 下显式写 typingIndicator: false。",
          "如果确实需要 typing，再单独评估频率和 quota 风险。"
        ]
      }
    }));
  }
  if (!checks.config.streamingReductionApplied) {
    issues.push(makeIssue("feishu_streaming_noise", {
      title: "Feishu streaming 仍开启，可能增加消息更新和 API 噪音",
      severity: "medium",
      category: "config",
      detected: true,
      summary: "Streaming/card 增量更新会提高 Feishu 消息修改频率。",
      evidence: {
        configPath: env.configPath,
        accountsWithStreamingEnabled: checks.config.accountsWithStreamingEnabled
      },
      guidance: {
        strategy: "config_update",
        targetFiles: [env.configPath],
        instructions: [
          "在每个 channels.feishu.accounts.<accountId> 下显式写 streaming: false。",
          "如果业务上强依赖 streaming，再单独做限流评估。"
        ]
      }
    }));
  }
  if (!checks.monitor.backoffGuardPresent) {
    issues.push(makeIssue("feishu_backoff_guard_missing", {
      title: "Feishu typing/backoff guard 缺失",
      severity: "medium",
      category: "runtime",
      detected: true,
      summary: "遇到 429 或 Feishu backoff code 时，运行时可能没有及时停掉高频调用。",
      evidence: {
        monitorFeishuFile: env.monitorFeishuFile
      },
      guidance: {
        strategy: "runtime_patch",
        targetFiles: [env.monitorFeishuFile],
        instructions: [
          "检查 Feishu typing 相关逻辑是否识别 429、99991400、99991403。",
          "确保遇到 backoff 响应时会抛出可识别错误并停止 keepalive。"
        ]
      }
    }));
  }
  if (!checks.validation.configValidate.ok) {
    issues.push(makeIssue("openclaw_config_invalid", {
      title: "OpenClaw 配置校验失败",
      severity: "critical",
      category: "verification",
      detected: true,
      summary: "当前 openclaw.json 本身不合法，任何后续修改都应该先修配置合法性。",
      evidence: checks.validation.configValidate,
      guidance: {
        strategy: "fix_before_anything_else",
        targetFiles: [env.configPath],
        instructions: [
          "先运行 openclaw config validate。",
          "根据报错修复 openclaw.json 语法或字段结构。",
          "配置不通过时，不要继续做 runtime patch。"
        ]
      }
    }));
  }
  return issues;
}

export async function buildReport() {
  const env = await detectEnvironment();
  const checks = await runChecks(env);
  const issues = buildIssues(env, checks);
  const support = buildSupport(env, checks);
  const report = {
    schemaVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    supported: support.status !== "unsupported",
    support,
    summary: {
      ok: issues.length === 0,
      issueCount: issues.length,
      criticalCount: issues.filter((issue) => issue.severity === "critical").length,
      highCount: issues.filter((issue) => issue.severity === "high").length
    },
    environment: {
      platform: process.platform,
      arch: process.arch,
      hostname: os.hostname(),
      nodeVersion: process.version,
      stateDir: env.stateDir,
      configPath: env.configPath,
      packageRoot: env.packageRoot,
      packageVersion: env.packageVersion,
      installMode: buildInstallMode(env),
      openclawBinary: env.openclawBinary || null,
      monitorFeishuFile: env.monitorFeishuFile,
      localRootsEntry: env.localRootsEntry,
      webMediaEntry: env.webMediaEntry,
      agentIds: env.agentIds,
      feishuAccounts: env.feishuAccounts
    },
    checks,
    issues
  };
  return report;
}
