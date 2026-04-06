import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export function expandHome(input) {
  if (!input) return input;
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

export function fileExists(targetPath) {
  try {
    fs.accessSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(targetPath) {
  await fsp.mkdir(targetPath, { recursive: true });
}

export function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

export function readJsonFile(targetPath) {
  return JSON.parse(fs.readFileSync(targetPath, "utf8"));
}

export async function writeJsonFile(targetPath, value) {
  await fsp.writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function safeExec(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "";
  }
}

export async function backupFile(sourcePath, backupRoot) {
  const relativeName = sourcePath.replace(/^\//, "").replaceAll("/", "__");
  const backupPath = path.join(backupRoot, relativeName);
  await ensureDir(path.dirname(backupPath));
  await fsp.copyFile(sourcePath, backupPath);
  return backupPath;
}

export function firstExistingPath(paths) {
  for (const candidate of paths) {
    if (candidate && fileExists(candidate)) return candidate;
  }
}

export async function readText(targetPath) {
  return await fsp.readFile(targetPath, "utf8");
}

export async function writeText(targetPath, content) {
  await fsp.writeFile(targetPath, content, "utf8");
}

export function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function formatStatus(ok) {
  return ok ? "OK" : "MISSING";
}

export function printSection(title) {
  console.log(`\n${title}`);
}

export function printKv(key, value) {
  console.log(`${key}: ${value}`);
}

export function toRelativeMaybe(targetPath, cwd = process.cwd()) {
  const relative = path.relative(cwd, targetPath);
  if (!relative || relative.startsWith("..")) return targetPath;
  return relative;
}
