// Assemble the static site into dist/ (served under /legalization-lesson03-legality-metrics/).
// Pages in site/ use <!--NAV--> and <!--FOOT--> placeholders; all links are relative.
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync, existsSync, rmSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { figures, figureHtml } from "./figures.mjs";
const FIGS = figures();

const OUT = "dist";
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const NAV = [
  ["", "首页"],
  ["lesson/", "讲解"],
  ["film/", "影片"],
  ["lab/", "实验台"],
  ["challenges/", "挑战与概念检测"],
  ["slides/", "课件"],
  ["python/", "Python 练习"],
  ["verify/", "验证与来源"],
];
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
let commit = "dev";
try {
  commit = execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim();
} catch {}
for (const f of walk("site")) {
  const rel = relative("site", f);
  const dest = join(OUT, rel);
  mkdirSync(dirname(dest), { recursive: true });
  if (!f.endsWith(".html")) {
    cpSync(f, dest);
    continue;
  }
  const depth = rel.split("/").length - 1;
  const base = depth ? "../".repeat(depth) : "./";
  const here = rel.replace(/index\.html$/, "");
  let html = readFileSync(f, "utf8");
  const nav = `<a class="skip" href="#main">跳到正文</a><div class="top"><a class="brand" href="${base}">合法吗？· Module 03 Legality Metrics</a><nav aria-label="课程导航">${NAV.map(([p, t]) => `<a href="${base}${p}"${p === here ? ' aria-current="page"' : ""}>${t}</a>`).join("")}</nav></div>`;
  const foot = `<footer class="foot">Module 03 · Legality Metrics（上游 <code>module01-03-legality-metrics</code>）· 代码 MIT · 内容 CC BY 4.0 · 改编自 yongfu-li/eda-learning（CC BY 4.0）· 构建 <code>${commit}</code> · <a href="${base}verify/#credits">来源与许可</a></footer>`;
  html = html.replace("<!--NAV-->", nav).replace("<!--FOOT-->", foot).replaceAll("{{BASE}}", base).replace(/<!--FIG:([a-zA-Z0-9]+)-->/g, (_, k) => figureHtml(k, FIGS));
  writeFileSync(dest, html);
}
cpSync("src", join(OUT, "src"), { recursive: true });
cpSync("data", join(OUT, "data"), { recursive: true });
cpSync("oracles/cpsat/results.json", join(OUT, "data/cpsat-results.json"));
for (const f of ["oracles/openroad/mutants-report.json", "oracles/openroad/real-design.json", "media/voice/screen-results.json"])
  if (existsSync(f)) cpSync(f, join(OUT, "data", f.split("/").pop()));
mkdirSync(join(OUT, "media/film"), { recursive: true });
for (const f of readdirSync("media/film")) cpSync(join("media/film", f), join(OUT, "media/film", f));
if (existsSync("media/renders")) cpSync("media/renders", join(OUT, "media/renders"), { recursive: true });
// Blind listening test: clips are served under opaque names; the key (name -> engine) stays in the repo only.
{
  const { createHash } = await import("node:crypto");
  const pool = [];
  for (const line of readFileSync("media/voice/listen-pool.txt", "utf8").split("\n")) if (line.trim() && !line.startsWith("#") && existsSync(line.trim())) pool.push(line.trim());
  mkdirSync(join(OUT, "listen/clips"), { recursive: true });
  const ids = [];
  const key = {};
  for (const f of pool) {
    const buf = readFileSync(f);
    const id = createHash("sha256").update(buf).digest("hex").slice(0, 10);
    cpSync(f, join(OUT, "listen/clips", id + f.slice(f.lastIndexOf("."))));
    ids.push(id + f.slice(f.lastIndexOf(".")));
    key[id] = f;
  }
  cpSync("media/voice/audition.zh.txt", join(OUT, "listen/audition.zh.txt"));
  writeFileSync(join(OUT, "listen/clips/manifest.json"), JSON.stringify({ clips: ids.sort(), human_reference_present: pool.some((f) => f.includes("/human/")) }));
  mkdirSync("build", { recursive: true });
  writeFileSync("media/voice/listen-key.json", JSON.stringify(key, null, 1));
}
if (existsSync("slides/out")) cpSync("slides/out", join(OUT, "slides/out"), { recursive: true });
execFileSync("python3", ["scripts/package_python.py"]);
cpSync("build/downloads", join(OUT, "downloads"), { recursive: true });
cpSync("docs/outline.zh.md", join(OUT, "downloads/module03-outline.md"));
writeFileSync(join(OUT, ".nojekyll"), "");
console.log("built", OUT, "commit", commit);
