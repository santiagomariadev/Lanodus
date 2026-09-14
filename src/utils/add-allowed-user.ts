import { randomBytes, pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const PBKDF2_ITERATIONS = 120000;
const PBKDF2_KEY_LENGTH = 32;

type BunPasswordApi = {
  hash: (password: string) => Promise<string>;
  verify: (password: string, hash: string) => Promise<boolean>;
};

export function getAllowedUsersFilePath(dataDir = process.env.LOCAL_SHARE_DATA_DIR) {
  return path.join(
    dataDir ? path.resolve(dataDir) : process.cwd(),
    ".allowedusers",
  );
}

export function isValidUsername(username: string) {
  return /^[a-zA-Z0-9._-]{3,32}$/.test(username);
}

export async function hashPassword(password: string) {
  const bunPasswordApi = typeof Bun !== "undefined" ? (Bun.password as BunPasswordApi | undefined) : undefined;
  if (bunPasswordApi?.hash) {
    return bunPasswordApi.hash(password);
  }

  const salt = randomBytes(16).toString("base64");
  const derived = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, "sha256");
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${salt}$${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const bunPasswordApi = typeof Bun !== "undefined" ? (Bun.password as BunPasswordApi | undefined) : undefined;
  if (bunPasswordApi?.verify) {
    try {
      return await bunPasswordApi.verify(password, storedHash);
    } catch {
      // Fall through to the Node-compatible validation below.
    }
  }

  const parts = storedHash.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") {
    return false;
  }

  const iterations = Number(parts[1]);
  const salt = parts[2];
  const encoded = parts[3];

  if (!Number.isFinite(iterations) || !salt || !encoded) {
    return false;
  }

  try {
    const expected = Buffer.from(encoded, "base64");
    const computed = pbkdf2Sync(password, salt, iterations, expected.length, "sha256");
    return timingSafeEqual(computed, expected);
  } catch {
    return false;
  }
}

export async function readAllowedUsers(dataDir = process.env.LOCAL_SHARE_DATA_DIR): Promise<string[]> {
  const usersFile = getAllowedUsersFilePath(dataDir);

  try {
    const data = await readFile(usersFile, "utf8");
    return data
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

export async function addAllowedUser(username: string, password: string, dataDir = process.env.LOCAL_SHARE_DATA_DIR) {
  if (!username || !password) {
    throw new Error("Username and password are required.");
  }

  if (!isValidUsername(username)) {
    throw new Error("Invalid username. Use 3-32 chars: letters, numbers, dot, underscore, hyphen.");
  }

  const usersFile = getAllowedUsersFilePath(dataDir);
  await mkdir(path.dirname(usersFile), { recursive: true });

  const existingLines = await readAllowedUsers(dataDir);
  const hashed = await hashPassword(password);
  const newEntry = `${username}:::${hashed}`;

  const filtered = existingLines.filter((line) => !line.startsWith(`${username}:::`));
  filtered.push(newEntry);

  await writeFile(usersFile, `${filtered.join("\n")}\n`, "utf8");

  return filtered;
}

export async function removeAllowedUser(username: string, dataDir = process.env.LOCAL_SHARE_DATA_DIR): Promise<string[]> {
  const cleanUsername = username.trim();
  if (!isValidUsername(cleanUsername)) {
    throw new Error("Invalid username.");
  }

  const usersFile = getAllowedUsersFilePath(dataDir);
  const existing = await readAllowedUsers(dataDir);
  const remaining = existing.filter((entry) => entry !== cleanUsername);

  const file = await readFile(usersFile, "utf8").catch(() => "");
  const filtered = file
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith(`${cleanUsername}:::`));

  await writeFile(usersFile, `${filtered.join("\n")}\n`, "utf8");
  return remaining;
}
