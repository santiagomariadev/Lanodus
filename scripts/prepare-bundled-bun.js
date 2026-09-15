#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function resolveBunPath(targetPlatform) {
  const fromEnv = process.env.BUN_BINARY;
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }

  if (targetPlatform !== process.platform) {
    throw new Error(
      `Cross-platform bundling requires BUN_BINARY. Set it to a Bun binary built for ${targetPlatform}.`,
    );
  }

  const locator = process.platform === "win32" ? "where" : "which";
  const fromShell = execFileSync(locator, ["bun"], { encoding: "utf8" }).trim().split(/\r?\n/)[0] || "";
  if (!fromShell) {
    throw new Error("Could not find Bun binary in PATH.");
  }

  return fromShell;
}

function main() {
  const targetPlatform = process.env.TARGET_PLATFORM || process.platform;
  const targetArch = process.env.TARGET_ARCH || process.arch;
  if (!["linux", "darwin", "win32"].includes(targetPlatform)) {
    throw new Error(`Unsupported TARGET_PLATFORM: ${targetPlatform}`);
  }

  const projectRoot = path.resolve(__dirname, "..");
  const bunPath = resolveBunPath(targetPlatform);
  const targetDir = path.join(projectRoot, "bundled", "bin");
  const targetFileName = targetPlatform === "win32" ? "bun.exe" : "bun";
  const targetPath = path.join(targetDir, targetFileName);
  const stalePath = path.join(targetDir, targetFileName === "bun" ? "bun.exe" : "bun");

  fs.mkdirSync(targetDir, { recursive: true });
  if (fs.existsSync(stalePath)) {
    fs.rmSync(stalePath, { force: true });
  }
  fs.copyFileSync(bunPath, targetPath);
  if (targetPlatform !== "win32") {
    fs.chmodSync(targetPath, 0o755);
  }

  console.log(`Bundled Bun binary for ${targetPlatform}/${targetArch}: ${bunPath} -> ${targetPath}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to prepare bundled Bun runtime: ${message}`);
  process.exit(1);
}
