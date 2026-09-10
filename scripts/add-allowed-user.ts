import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const USERS_FILE = path.join(process.cwd(), ".allowedusers");

function usage() {
  console.log("Usage: bun run add-user -- <username> <password>");
}

function isValidUsername(username: string) {
  return /^[a-zA-Z0-9._-]{3,32}$/.test(username);
}

async function readExistingUsers() {
  try {
    const data = await readFile(USERS_FILE, "utf8");
    return data
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function main() {
  const [, , usernameArg, passwordArg] = Bun.argv;
  const username = (usernameArg || "").trim();
  const password = passwordArg || "";

  if (!username || !password) {
    usage();
    process.exit(1);
  }

  if (!isValidUsername(username)) {
    console.error("Invalid username. Use 3-32 chars: letters, numbers, dot, underscore, hyphen.");
    process.exit(1);
  }

  await mkdir(path.dirname(USERS_FILE), { recursive: true });

  const existingLines = await readExistingUsers();
  const hashed = await Bun.password.hash(password);
  const newEntry = `${username}:::${hashed}`;

  const filtered = existingLines.filter((line) => !line.startsWith(`${username}:::`));
  filtered.push(newEntry);

  await writeFile(USERS_FILE, `${filtered.join("\n")}\n`, "utf8");

  console.log(`Saved credentials for '${username}' in .allowedusers`);
}

main().catch((error) => {
  console.error("Failed to add user:", error);
  process.exit(1);
});
