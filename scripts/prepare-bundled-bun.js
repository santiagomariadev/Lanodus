#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function resolveBunPath() {
  const fromEnv = process.env.BUN_BINARY;
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }

  const fromShell = execFileSync("which", ["bun"], { encoding: "utf8" }).trim();
  if (!fromShell) {
    throw new Error("Could not find Bun binary in PATH.");
  }

  return fromShell;
}

function main() {
  if (process.platform !== "linux") {
    console.log("Skipping Bun bundling: AppImage release is Linux-only.");
    return;
  }

  const projectRoot = path.resolve(__dirname, "..");
  const bunPath = resolveBunPath();
  const targetDir = path.join(projectRoot, "bundled", "bin");
  const targetPath = path.join(targetDir, "bun");

  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(bunPath, targetPath);
  fs.chmodSync(targetPath, 0o755);

  console.log(`Bundled Bun binary: ${bunPath} -> ${targetPath}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to prepare bundled Bun runtime: ${message}`);
  process.exit(1);
}
