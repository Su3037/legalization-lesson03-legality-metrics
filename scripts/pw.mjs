// Load Playwright from the project or from the global install (CI installs it into the project).
import { createRequire } from "node:module";
const req = createRequire(import.meta.url);
let pw;
try {
  pw = req("playwright");
} catch {
  pw = req(req("node:child_process").execSync("npm root -g").toString().trim() + "/playwright");
}
export const { chromium } = pw;
