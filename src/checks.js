import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { inspectConfig, inspectMonitorPatch } from "./inspect.js";

export function runConfigValidate(env) {
  try {
    execFileSync("openclaw", ["config", "validate"], {
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

export async function runWorkspaceMediaAccessCheck(env) {
  if (!env.workspaceSampleFile) {
    return {
      ok: false,
      reason: "No sample workspace file found",
      sampleFile: null,
      agentId: null
    };
  }
  const webMediaModule = await import(pathToFileURL(path.join(env.distDir, env.webMediaEntry)).href);
  const localRootsModule = await import(pathToFileURL(path.join(env.distDir, env.localRootsEntry)).href);
  const loadWebMedia = webMediaModule.t;
  const getAgentScopedMediaLocalRoots = localRootsModule.n;
  const sampleAgentId = env.config.agents?.list?.find((agent) => env.workspaceSampleFile.startsWith(`${agent.workspace}/`))?.id;
  if (!sampleAgentId) {
    return {
      ok: false,
      reason: "No agent matched the sample workspace file",
      sampleFile: env.workspaceSampleFile,
      agentId: null
    };
  }
  try {
    const roots = getAgentScopedMediaLocalRoots(env.config, sampleAgentId);
    const loaded = await loadWebMedia(env.workspaceSampleFile, {
      optimizeImages: false,
      localRoots: roots
    });
    return {
      ok: true,
      sampleFile: env.workspaceSampleFile,
      agentId: sampleAgentId,
      kind: loaded.kind,
      fileName: loaded.fileName
    };
  } catch (error) {
    return {
      ok: false,
      sampleFile: env.workspaceSampleFile,
      agentId: sampleAgentId,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function runChecks(env) {
  const config = inspectConfig(env);
  const monitor = await inspectMonitorPatch(env);
  const configValidate = runConfigValidate(env);
  const workspaceMediaAccess = await runWorkspaceMediaAccessCheck(env);
  return {
    config,
    monitor,
    validation: {
      configValidate,
      workspaceMediaAccess
    }
  };
}
