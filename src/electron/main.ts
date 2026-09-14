import { app, BrowserWindow, ipcMain, shell } from "electron";
import * as path from "node:path";
import * as os from "node:os";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import bonjour from "bonjour";
import { buildAdvertisedService, buildHostUrls } from "./network";

const PORT = Number(process.env.PORT || 3000);
const APP_ROOT = path.resolve(__dirname, "..", "..");
const USERS_FILE = path.join(APP_ROOT, ".allowedusers");

let serverProcess: ReturnType<typeof spawn> | null = null;
let serverReady = false;
let hostAdvertiser: { stop: () => void } | null = null;

function isValidUsername(username: string) {
  return /^[a-zA-Z0-9._-]{3,32}$/.test(username);
}

async function readAllowedUsersFromDisk(): Promise<string[]> {
  try {
    const file = await readFile(USERS_FILE, "utf8");
    return file
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(":::")[0])
      .filter((username): username is string => Boolean(username));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function createAllowedUser(username: string, password: string): Promise<string[]> {
  const cleanUsername = username.trim();
  if (!isValidUsername(cleanUsername) || !password) {
    throw new Error("Use 3-32 chars for the username and provide a password.");
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn("bun", ["run", "add-user", "--", cleanUsername, password], {
      cwd: APP_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr || `Failed to create user '${cleanUsername}'.`));
    });
  });

  return readAllowedUsersFromDisk();
}

async function removeAllowedUser(username: string): Promise<string[]> {
  const cleanUsername = username.trim();
  if (!isValidUsername(cleanUsername)) {
    throw new Error("Invalid username.");
  }

  const existing = await readAllowedUsersFromDisk();
  const remaining = existing.filter((entry) => entry !== cleanUsername);

  const file = await readFile(USERS_FILE, "utf8").catch(() => "");
  const filtered = file
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith(`${cleanUsername}:::`));

  await writeFile(USERS_FILE, `${filtered.join("\n")}${filtered.length ? "\n" : ""}`, "utf8");
  return remaining;
}

function getLocalAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (!entry.internal && entry.family === "IPv4") {
        addresses.push(entry.address);
      }
    }
  }

  return [...new Set(addresses)].sort();
}

async function isServerAlreadyRunning(): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${PORT}`, { signal: AbortSignal.timeout(1200) });
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

function waitForServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timeoutMs = 20000;

    const poll = () => {
      if (serverReady) {
        resolve();
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error("Timed out waiting for Local Share server to start."));
        return;
      }

      setTimeout(poll, 200);
    };

    poll();
  });
}

function startLocalShareServer(): Promise<void> {
  if (serverProcess) {
    return Promise.resolve();
  }

  return new Promise(async (resolve, reject) => {
    if (await isServerAlreadyRunning()) {
      serverReady = true;
      resolve();
      return;
    }
    const env = {
      ...process.env,
      PORT: String(PORT),
    };

    serverProcess = spawn("bun", ["index.ts"], {
      cwd: APP_ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let settled = false;

    const onData = (chunk: Buffer | string) => {
      const text = chunk.toString();
      if (!settled && text.includes("Local Share server listening")) {
        serverReady = true;
        settled = true;
        resolve();
      }
    };

    const onError = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    serverProcess.stdout?.on("data", onData);
    serverProcess.stderr?.on("data", onData);
    serverProcess.on("error", onError);

    serverProcess.on("exit", async (code) => {
      if (!settled && code !== 0) {
        if (await isServerAlreadyRunning()) {
          serverReady = true;
          settled = true;
          resolve();
          return;
        }

        settled = true;
        reject(new Error(`Local Share server exited with code ${code}.`));
      }
    });

    waitForServer()
      .then(() => {
        if (!settled) {
          settled = true;
          resolve();
        }
      })
      .catch((error: Error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      });
  });
}

function stopHostService() {
  if (hostAdvertiser) {
    try {
      hostAdvertiser.stop();
    } catch (error) {
      console.warn("Unable to stop bonjour host advertisement", error);
    }
    hostAdvertiser = null;
  }
}

function publishHostService() {
  stopHostService();

  const hostname = os.hostname();
  const service = buildAdvertisedService({ hostname, port: PORT });
  const mdns = bonjour();
  hostAdvertiser = mdns.publish(service);

  return {
    hostname,
    urls: buildHostUrls(hostname, getLocalAddresses(), PORT),
  };
}

function discoverHosts(): Promise<Array<{ name: string; host: string; port: number; url: string }>> {
  return new Promise((resolve) => {
    const discovered = new Map<string, { name: string; host: string; port: number; url: string }>();
    const browser = bonjour().find({ type: "_localshare._tcp" }, (service: any) => {
      const name = service.name || "Local Share";
      const host = service.hostname || service.host || "localhost";
      const port = service.port || PORT;
      const url = `http://${host}:${port}`;

      discovered.set(name, { name, host, port, url });
    });

    setTimeout(() => {
      try {
        browser.stop();
      } catch (error) {
        console.warn("Could not stop bonjour browser", error);
      }
      resolve([...discovered.values()]);
    }, 1800);
  });
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 960,
    minHeight: 700,
    title: "Local Share System",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      safeDialogs: true,
      spellcheck: false,
    },
  });

  win.setMenuBarVisibility(false);
  win.loadURL(`http://localhost:${PORT}`);

  return win;
}

app.whenReady().then(async () => {
  try {
    await startLocalShareServer();
  } catch (error) {
    console.error("Failed to start Local Share server:", error);
    app.quit();
    return;
  }

  ipcMain.handle("get-network-info", async () => ({
    hostname: os.hostname(),
    port: PORT,
    addresses: getLocalAddresses(),
    hostnames: buildHostUrls(os.hostname(), getLocalAddresses(), PORT),
  }));

  ipcMain.handle("start-host-broadcast", async () => {
    await waitForServer();
    return publishHostService();
  });

  ipcMain.handle("stop-host-broadcast", async () => {
    stopHostService();
    return true;
  });

  ipcMain.handle("discover-hosts", async () => discoverHosts());

  ipcMain.handle("list-allowed-users", async () => readAllowedUsersFromDisk());

  ipcMain.handle("create-allowed-user", async (_event, username: string, password: string) =>
    createAllowedUser(username, password),
  );

  ipcMain.handle("remove-allowed-user", async (_event, username: string) =>
    removeAllowedUser(username),
  );

  ipcMain.handle("open-external-url", async (_event, url: string) => {
    if (!url) {
      return false;
    }

    await shell.openExternal(url);
    return true;
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  stopHostService();

  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGTERM");
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});
