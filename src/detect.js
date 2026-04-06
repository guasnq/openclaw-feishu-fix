import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
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

async function resolveDistEntry(distDir, prefix) {
  const entries = await fsp.readdir(distDir);
  return entries.find((entry) => entry.startsWith(prefix) && entry.endsWith(".js"));
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
  if (!monitorFeishuFile) throw new Error(`Feishu monitor bundle not found under ${distDir}`);
  const config = readJsonFile(configPath);
  const agentWorkspaces = collectAgentWorkspaces(config);
  const localRootsEntry = await resolveDistEntry(distDir, "local-roots-");
  const webMediaEntry = await resolveDistEntry(distDir, "web-media-");
  if (!localRootsEntry || !webMediaEntry) {
    throw new Error(`Required dist modules not found under ${distDir} (local-roots/web-media).`);
  }
  return {
    stateDir,
    configPath,
    config,
    packageRoot,
    packageJsonPath,
    distDir,
    packageVersion: pkg.version,
    openclawBinary: resolveOpenClawBinary(),
    monitorFeishuFile,
    localRootsEntry,
    webMediaEntry,
    agentIds: listAgentIds(config),
    agentWorkspaces,
    feishuAccounts: listFeishuAccounts(config),
    workspaceSampleFile: findFirstWorkspaceSampleFile(agentWorkspaces),
    backupRoot: path.join(process.cwd(), ".backups")
  };
}
