import { addAllowedUser } from "../src/utils/add-allowed-user";

function usage() {
  console.log("Usage: bun run add-user -- <username> <password>");
}

async function main() {
  const [, , usernameArg, passwordArg] = Bun.argv;
  const username = (usernameArg || "").trim();
  const password = passwordArg || "";

  if (!username || !password) {
    usage();
    process.exit(1);
  }

  try {
    await addAllowedUser(username, password);
    console.log(`Saved credentials for '${username}' in .allowedusers`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Failed to add user");
    process.exit(1);
  }
}

main();
