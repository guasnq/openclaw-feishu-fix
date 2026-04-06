import path from "node:path";
import { readText, uniqueSorted } from "./utils.js";

export function expectedMediaRoots(env) {
  return uniqueSorted(["/tmp", ...env.agentWorkspaces.filter((workspace) => workspace !== path.join(env.stateDir, "workspace"))]);
}

export function inspectConfig(env) {
  const feishuConfig = env.config.channels?.feishu ?? {};
  const configuredMediaRoots = uniqueSorted(feishuConfig.mediaLocalRoots ?? []);
  const expectedRoots = expectedMediaRoots(env);
  const missingMediaRoots = expectedRoots.filter((root) => !configuredMediaRoots.includes(root));
  const accountEntries = Object.entries(feishuConfig.accounts ?? {});
  const accountsWithTypingEnabled = accountEntries.filter(([, account]) => account?.typingIndicator !== false).map(([accountId]) => accountId);
  const accountsWithStreamingEnabled = accountEntries.filter(([, account]) => account?.streaming !== false).map(([accountId]) => accountId);
  return {
    configuredMediaRoots,
    expectedRoots,
    missingMediaRoots,
    mediaRootsApplied: missingMediaRoots.length === 0,
    accountsWithTypingEnabled,
    typingReductionApplied: accountsWithTypingEnabled.length === 0,
    accountsWithStreamingEnabled,
    streamingReductionApplied: accountsWithStreamingEnabled.length === 0
  };
}

export async function inspectMonitorPatch(env) {
  const content = await readText(env.monitorFeishuFile);
  const importApplied = content.includes('getAgentScopedMediaLocalRoots') && content.includes('from "./local-roots-');
  const scopedRootsApplied = content.includes("const mediaLocalRoots = getAgentScopedMediaLocalRoots(cfg, agentId);");
  const sendMediaApplied = content.includes("accountId,\n\t\t\t\t\tmediaLocalRoots") || content.includes("accountId,\n\t\t\t\tmediaLocalRoots");
  const backoffGuardPresent = content.includes("const FEISHU_BACKOFF_CODES = new Set([") && content.includes("function isFeishuBackoffError(err)") && content.includes("async function addTypingIndicator(params)");
  return {
    importApplied,
    scopedRootsApplied,
    sendMediaApplied,
    mediaReplyPatchApplied: importApplied && scopedRootsApplied && sendMediaApplied,
    backoffGuardPresent
  };
}
