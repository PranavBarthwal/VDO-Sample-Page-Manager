// Launches the production server (`next start`) using a separate build dir
// (.next-prod) so it can run alongside `next dev` (which uses .next).
// Port defaults to 3001 but honors PORT if set.
import { spawn } from "node:child_process";

const port = process.env.PORT || "3001";
const env = { ...process.env, NEXT_DIST_DIR: process.env.NEXT_DIST_DIR || ".next-prod" };

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["next", "start", "-p", port],
  { stdio: "inherit", env, shell: process.platform === "win32" }
);

child.on("exit", (code) => process.exit(code ?? 0));
