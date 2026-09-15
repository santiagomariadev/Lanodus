import { app, BrowserWindow, ipcMain, nativeImage, shell } from "electron";
import * as path from "node:path";
import * as os from "node:os";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import bonjour from "bonjour";
import {
  addAllowedUser as addAllowedUserToStore,
  isValidUsername as isValidUsernameString,
  readAllowedUsers as readAllowedUsersFromStore,
  removeAllowedUser as removeAllowedUserFromStore,
} from "../utils/add-allowed-user";
import { buildAdvertisedService, buildHostUrls } from "./network";

const PORT = Number(process.env.PORT || 3000);
const APP_ROOT = app.isPackaged ? app.getAppPath() : path.resolve(__dirname, "..", "..");
const DATA_ROOT = path.join(app.getPath("userData"), "lanodus");
const CHILD_CWD = app.isPackaged ? path.dirname(process.resourcesPath || app.getPath("home")) : APP_ROOT;
const PUBLIC_DIR = app.isPackaged ? path.join(process.resourcesPath, "public") : path.join(APP_ROOT, "public");
const APP_ICON_PATH = app.isPackaged
  ? path.join(process.resourcesPath, "public", "images", "lanodus-icon-1024.png")
  : path.join(APP_ROOT, "public", "images", "lanodus-icon-1024.png");
const PACKAGED_BUN = path.join(process.resourcesPath, "bin", process.platform === "win32" ? "bun.exe" : "bun");
const SERVER_ENTRY = app.isPackaged
  ? path.join(process.resourcesPath, "dist", "index.js")
  : path.join(APP_ROOT, "src", "index.ts");

let serverProcess: ReturnType<typeof spawn> | null = null;
let serverReady = false;
let hostAdvertiser: { stop: () => void } | null = null;

function isValidUsername(username: string) {
  return isValidUsernameString(username);
}

async function readAllowedUsersFromDisk(): Promise<string[]> {
  return readAllowedUsersFromStore(DATA_ROOT);
}

async function createAllowedUser(username: string, password: string): Promise<string[]> {
  const cleanUsername = username.trim();
  if (!isValidUsername(cleanUsername) || !password) {
    throw new Error("Use 3-32 chars for the username and provide a password.");
  }

  await addAllowedUserToStore(cleanUsername, password, DATA_ROOT);
  return readAllowedUsersFromDisk();
}

async function removeAllowedUserByName(username: string): Promise<string[]> {
  const cleanUsername = username.trim();
  if (!isValidUsername(cleanUsername)) {
    throw new Error("Invalid username.");
  }

  return removeAllowedUserFromStore(cleanUsername, DATA_ROOT);
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
        reject(new Error("Timed out waiting for Lanodus server to start."));
        return;
      }

      setTimeout(poll, 200);
    };

    poll();
  });
}

function resolveServerCommand(): string {
  if (!app.isPackaged) {
    return "bun";
  }

  if (existsSync(PACKAGED_BUN)) {
    return PACKAGED_BUN;
  }

  // Fallback keeps older packages functional if Bun happens to be installed globally.
  return "bun";
}

function startLanodusServer(): Promise<void> {
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
      LANODUS_APP_ROOT: APP_ROOT,
      LANODUS_PUBLIC_DIR: PUBLIC_DIR,
      LANODUS_DATA_DIR: DATA_ROOT,
    };

    const serverCommand = resolveServerCommand();
    const serverArgs = [SERVER_ENTRY];

    serverProcess = spawn(serverCommand, serverArgs, {
      cwd: CHILD_CWD,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let settled = false;
    let childOutput = "";

    const onData = (chunk: Buffer | string) => {
      const text = chunk.toString();
      childOutput += text;
      console.log("[lanodus-server]", text.trim());
      if (!settled && text.includes("Lanodus server listening")) {
        serverReady = true;
        settled = true;
        resolve();
      }
    };

    const onError = (error: Error) => {
      if (!settled) {
        const spawnError = error as NodeJS.ErrnoException;
        if (app.isPackaged && spawnError.code === "ENOENT") {
          settled = true;
          reject(new Error("Lanodus could not start because the bundled Bun runtime is missing."));
          return;
        }
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
        reject(new Error(`Lanodus server exited with code ${code}. Output: ${childOutput.trim() || "(no output)"}`));
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
    const browser = bonjour().find({ type: "_lanodus._tcp" }, (service: any) => {
      const name = service.name || "Lanodus";
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
  const appIcon = nativeImage.createFromPath(APP_ICON_PATH);

  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 960,
    minHeight: 700,
    title: "Lanodus",
    icon: appIcon.isEmpty() ? undefined : appIcon,
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

  if (process.platform === "darwin" && !appIcon.isEmpty()) {
    app.dock.setIcon(appIcon);
  }

  win.setMenuBarVisibility(false);
  win.loadURL(`http://localhost:${PORT}`);

  return win;
}

app.whenReady().then(async () => {
  try {
    await startLanodusServer();
  } catch (error) {
    console.error("Failed to start Lanodus server:", error);
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
    removeAllowedUserByName(username),
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
