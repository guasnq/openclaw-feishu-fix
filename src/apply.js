import path from "node:path";
import { execFileSync } from "node:child_process";
import { detectEnvironment } from "./detect.js";
import { inspectConfig, inspectMonitorPatch } from "./inspect.js";
import { backupFile, ensureDir, nowStamp, printKv, printSection, readText, toRelativeMaybe, writeJsonFile, writeText } from "./utils.js";

function applyConfigFixes(env) {
  const config = structuredClone(env.config);
  const feishu = config.channels?.feishu;
  if (!feishu) throw new Error("channels.feishu is missing in openclaw.json");
  const currentRoots = new Set(feishu.mediaLocalRoots ?? []);
  currentRoots.add("/tmp");
  for (const workspace of env.agentWorkspaces) {
    if (workspace !== path.join(env.stateDir, "workspace")) currentRoots.add(workspace);
  }
  feishu.mediaLocalRoots = Array.from(currentRoots).sort();
  for (const accountId of Object.keys(feishu.accounts ?? {})) {
    feishu.accounts[accountId] = {
      ...feishu.accounts[accountId],
      typingIndicator: false,
      streaming: false
    };
  }
  return config;
}

function insertImportIfMissing(content, helperEntry, helperExportAlias) {
  if (/import\s+\{[^}]*getAgentScopedMediaLocalRoots[^}]*\}\s+from\s+"\.\/[^"]+\.js";/.test(content)) return content;
  const importBlock = content.match(/^(?:import .*;\n)+/);
  if (!importBlock) throw new Error("Unable to locate import block in Feishu monitor bundle.");
  const importLine = `import { ${helperExportAlias} as getAgentScopedMediaLocalRoots } from "./${helperEntry}";\n`;
  return `${importBlock[0]}${importLine}${content.slice(importBlock[0].length)}`;
}

function insertScopedRootsIfMissing(content) {
  if (content.includes("const mediaLocalRoots = getAgentScopedMediaLocalRoots(cfg, agentId);")) return content;
  return content.replace(
    /(const tableMode = core\.channel\.text\.resolveMarkdownTableMode\(\{\n[\t ]*cfg,\n[\t ]*channel: "feishu"\n[\t ]*\}\);)/,
    '$1\n\tconst mediaLocalRoots = getAgentScopedMediaLocalRoots(cfg, agentId);'
  );
}

function injectMediaRootsIntoSendMedia(content) {
  if (content.includes("mediaLocalRoots")) {
    const sendBlock = content.match(/const sendMediaReplies = async \(payload\) => \{[\s\S]*?\n\t\};/);
    if (sendBlock && sendBlock[0].includes("mediaLocalRoots")) return content;
  }
  return content.replace(
    /(replyInThread: effectiveReplyInThread,\n)([\t ]*accountId)(\n[\t ]*\}\);)/,
    '$1$2,\n\t\t\t\t\tmediaLocalRoots$3'
  );
}

function applyMonitorPatch(content, helperEntry, helperExportAlias) {
  let next = content;
  next = insertImportIfMissing(next, helperEntry, helperExportAlias);
  next = insertScopedRootsIfMissing(next);
  next = injectMediaRootsIntoSendMedia(next);
  return next;
}

function runConfigValidate(env) {
  try {
    execFileSync("openclaw", ["config", "validate"], {
      cwd: env.stateDir,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8"
    });
    return true;
  } catch (error) {
    const stdout = typeof error?.stdout === "string" ? error.stdout : "";
    const stderr = typeof error?.stderr === "string" ? error.stderr : "";
    throw new Error(`openclaw config validate failed\n${stdout}${stderr}`.trim());
  }
}

function restartGateway(env) {
  try {
    execFileSync("openclaw", ["gateway", "restart"], {
      cwd: env.stateDir,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8"
    });
    return { ok: true };
  } catch (error) {
    const stdout = typeof error?.stdout === "string" ? error.stdout : "";
    const stderr = typeof error?.stderr === "string" ? error.stderr : "";
    return { ok: false, reason: `${stdout}${stderr}`.trim() || String(error) };
  }
}

function printHuman(result) {
  printSection("Apply");
  printKv("Backup root", result.backupRoot);
  printKv("Config backup", toRelativeMaybe(result.configBackup));
  printKv("Monitor backup", toRelativeMaybe(result.monitorBackup));
  printKv("Config updated", result.configUpdated ? "yes" : "no");
  printKv("Monitor patched", result.monitorPatched ? "yes" : "no");
  printKv("Config validate", result.configValidated ? "ok" : "failed");
  printKv("Gateway restart", result.gatewayRestart.ok ? "ok" : "failed");
  if (!result.gatewayRestart.ok && result.gatewayRestart.reason) {
    printKv("Gateway restart reason", result.gatewayRestart.reason);
  }
}

export async function runApply({ json = false } = {}) {
  const env = await detectEnvironment();
  if (!env.monitorFeishuFile) {
    throw new Error("Feishu monitor bundle not detected. Refusing to apply runtime patch.");
  }
  if (!env.mediaHelperEntry || !env.mediaHelperExportAlias) {
    throw new Error("Runtime helper module/export for getAgentScopedMediaLocalRoots was not detected. Refusing to patch blindly.");
  }
  const backupRoot = path.join(env.backupRoot, nowStamp());
  await ensureDir(backupRoot);

  const configBackup = await backupFile(env.configPath, backupRoot);
  const monitorBackup = await backupFile(env.monitorFeishuFile, backupRoot);

  const nextConfig = applyConfigFixes(env);
  await writeJsonFile(env.configPath, nextConfig);

  const monitorBefore = await readText(env.monitorFeishuFile);
  const monitorAfter = applyMonitorPatch(monitorBefore, env.mediaHelperEntry, env.mediaHelperExportAlias);
  await writeText(env.monitorFeishuFile, monitorAfter);

  runConfigValidate(env);
  const gatewayRestart = restartGateway(env);

  const refreshedEnv = await detectEnvironment();
  const configInspection = inspectConfig(refreshedEnv);
  const monitorInspection = await inspectMonitorPatch(refreshedEnv);
  const result = {
    backupRoot,
    configBackup,
    monitorBackup,
    configUpdated: configInspection.mediaRootsApplied && configInspection.typingReductionApplied && configInspection.streamingReductionApplied,
    monitorPatched: monitorInspection.mediaReplyPatchApplied,
    configValidated: true,
    gatewayRestart,
    environment: {
      packageVersion: refreshedEnv.packageVersion,
      configPath: refreshedEnv.configPath,
      monitorFeishuFile: refreshedEnv.monitorFeishuFile
    },
    config: configInspection,
    monitor: monitorInspection
  };
  if (!json) printHuman(result);
  return result;
}
