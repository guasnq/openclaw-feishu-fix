import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { expandHome, fileExists, firstExistingPath, readJsonFile, safeExec, uniqueSorted } from "./utils.js";

function resolveStateDir() {
  return expandHome(process.env.OPENCLAW_STATE_DIR || "~/.openclaw");
}

function resolveConfigPath(stateDir) {
  return path.join(stateDir, "openclaw.json");
}

function resolveGlobalPackageRoot() {
  const npmRoot = safeExec("npm", ["root", "-g"]);
  const pnpmRoot = safeExec("pnpm", ["root", "-g"]);
  const candidates = [
    process.env.OPENCLAW_PACKAGE_ROOT,
    npmRoot ? path.join(npmRoot, "openclaw") : "",
    pnpmRoot ? path.join(pnpmRoot, "openclaw") : "",
    "/opt/homebrew/lib/node_modules/openclaw",
    "/usr/local/lib/node_modules/openclaw",
    path.join(process.env.APPDATA ?? "", "npm", "node_modules", "openclaw"),
    path.join(process.env.ProgramFiles ?? "", "nodejs", "node_modules", "openclaw")
  ].filter(Boolean);
  return firstExistingPath(candidates.map((candidate) => path.join(candidate, "package.json")))?.replace(/\/package\.json$/, "");
}

function resolveOpenClawBinary() {
  const command = process.platform === "win32" ? "where" : "which";
  return safeExec(command, ["openclaw"]);
}

async function resolveMonitorFeishuFile(distDir) {
  const entries = await fsp.readdir(distDir);
  const monitorFiles = entries.filter((entry) => entry.startsWith("monitor-") && entry.endsWith(".js"));
  for (const entry of monitorFiles) {
    const fullPath = path.join(distDir, entry);
    const content = await fsp.readFile(fullPath, "utf8");
    if (content.includes("const sendMediaReplies = async (payload) => {") && content.includes("sendMediaFeishu({")) {
      return fullPath;
    }
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scoreMediaHelperCandidate(entry, content) {
  let score = 0;
  if (entry.startsWith("local-roots-")) score += 50;
  if (entry.startsWith("local-file-access-")) score += 40;
  if (entry.startsWith("web-media-")) score += 30;
  if (content.includes("function getAgentScopedMediaLocalRoots(")) score += 20;
  if (content.includes("getAgentScopedMediaLocalRootsForSources")) score += 10;
  return score;
}

function scoreWebMediaCandidate(entry, content) {
  let score = 0;
  if (entry.startsWith("web-media-")) score += 50;
  if (content.includes("async function loadWebMedia(")) score += 20;
  if (content.includes("async function loadWebMediaInternal(")) score += 10;
  return score;
}

function resolveExportAlias(content, symbolName) {
  const match = content.match(new RegExp(`\\b${escapeRegExp(symbolName)}\\s+as\\s+([A-Za-z_$][\\w$]*)`));
  return match?.[1] ?? null;
}

async function detectDistCapabilities(distDir) {
  const entries = (await fsp.readdir(distDir)).filter((entry) => entry.endsWith(".js"));
  const metadata = [];
  for (const entry of entries) {
    const fullPath = path.join(distDir, entry);
    const content = await fsp.readFile(fullPath, "utf8");
    metadata.push({ entry, fullPath, content });
  }
  const mediaHelperCandidates = metadata
    .filter(({ content }) => content.includes("getAgentScopedMediaLocalRoots"))
    .sort((a, b) => scoreMediaHelperCandidate(b.entry, b.content) - scoreMediaHelperCandidate(a.entry, a.content));
  const webMediaCandidates = metadata
    .filter(({ content }) => content.includes("loadWebMedia"))
    .sort((a, b) => scoreWebMediaCandidate(b.entry, b.content) - scoreWebMediaCandidate(a.entry, a.content));
  const mediaHelper = mediaHelperCandidates[0];
  const webMedia = webMediaCandidates[0];
  return {
    mediaHelperEntry: mediaHelper?.entry ?? null,
    mediaHelperExportAlias: mediaHelper ? resolveExportAlias(mediaHelper.content, "getAgentScopedMediaLocalRoots") : null,
    webMediaEntry: webMedia?.entry ?? null,
    webMediaExportAlias: webMedia ? resolveExportAlias(webMedia.content, "loadWebMedia") : null
  };
}

function collectAgentWorkspaces(config) {
  const workspaces = [];
  const defaultsWorkspace = config.agents?.defaults?.workspace;
  if (typeof defaultsWorkspace === "string" && path.isAbsolute(defaultsWorkspace)) workspaces.push(defaultsWorkspace);
  for (const agent of config.agents?.list ?? []) {
    if (typeof agent.workspace === "string" && path.isAbsolute(agent.workspace)) workspaces.push(agent.workspace);
  }
  return uniqueSorted(workspaces);
}

function listFeishuAccounts(config) {
  return Object.keys(config.channels?.feishu?.accounts ?? {});
}

function listAgentIds(config) {
  return (config.agents?.list ?? []).map((agent) => agent.id);
}

function findFirstWorkspaceSampleFile(workspaces) {
  for (const workspace of workspaces) {
    if (!workspace.includes("/workspace-")) continue;
    if (!fileExists(workspace)) continue;
    const stack = [workspace];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;
      let entries = [];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }
        if (/\.(md|png|jpg|jpeg|pdf)$/i.test(entry.name)) return fullPath;
      }
    }
  }
}

export async function detectEnvironment() {
  const stateDir = resolveStateDir();
  const configPath = resolveConfigPath(stateDir);
  if (!fileExists(configPath)) throw new Error(`OpenClaw config not found: ${configPath}`);
  const packageRoot = resolveGlobalPackageRoot();
  if (!packageRoot) throw new Error("OpenClaw package root not found. Supported search paths: npm root -g, /opt/homebrew, /usr/local.");
  const packageJsonPath = path.join(packageRoot, "package.json");
  const pkg = readJsonFile(packageJsonPath);
  const distDir = path.join(packageRoot, "dist");
  const monitorFeishuFile = await resolveMonitorFeishuFile(distDir);
  const config = readJsonFile(configPath);
  const agentWorkspaces = collectAgentWorkspaces(config);
  const distCapabilities = await detectDistCapabilities(distDir);
  return {
    stateDir,
    configPath,
    config,
    packageRoot,
    packageJsonPath,
    distDir,
    packageVersion: pkg.version,
    openclawBinary: resolveOpenClawBinary(),
    monitorFeishuFile: monitorFeishuFile ?? null,
    mediaHelperEntry: distCapabilities.mediaHelperEntry,
    mediaHelperExportAlias: distCapabilities.mediaHelperExportAlias,
    webMediaEntry: distCapabilities.webMediaEntry,
    webMediaExportAlias: distCapabilities.webMediaExportAlias,
    agentIds: listAgentIds(config),
    agentWorkspaces,
    feishuAccounts: listFeishuAccounts(config),
    workspaceSampleFile: findFirstWorkspaceSampleFile(agentWorkspaces),
    backupRoot: path.join(process.cwd(), ".backups")
  };
}
