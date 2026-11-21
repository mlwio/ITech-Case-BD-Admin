import { spawnSync } from "node:child_process";
import { loadEnvConfig } from "@next/env";
import { applyDatabaseUrlAliases } from "../src/lib/db-urls";

loadEnvConfig(process.cwd());
applyDatabaseUrlAliases(process.env);

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: tsx scripts/with-db-env.ts <prisma-command> [arguments...]");
  process.exit(2);
}

const result = spawnSync("prisma", [command, ...args], {
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(`Unable to start Prisma CLI: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
