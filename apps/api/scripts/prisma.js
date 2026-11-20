const path = require("path");
const { spawnSync } = require("child_process");
const { config } = require("dotenv");

config({ path: path.resolve(__dirname, "../../../.env") });

const testMode = process.argv.includes("--test");
const args = process.argv.slice(2).filter((arg) => arg !== "--test");

if (testMode) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = "/loyalty_test";
  process.env.DATABASE_URL = url.toString();
}

const result = spawnSync("npx", ["prisma", ...args], {
  cwd: path.resolve(__dirname, ".."),
  stdio: "inherit",
  env: process.env,
  shell: true,
});

process.exit(result.status ?? 1);
