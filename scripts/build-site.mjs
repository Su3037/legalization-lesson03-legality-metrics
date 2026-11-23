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
const REPO = "https://github.com/su3037/legalization-lesson03-legality-metrics";
const BRAND = '<svg viewBox="0 0 26 26" aria-hidden="true"><rect x="2.5" y="5.5" width="21" height="6" fill="none" stroke="#0f6b5c" stroke-width="1.3"/><rect x="2.5" y="14.5" width="21" height="6" fill="none" stroke="#0f6b5c" stroke-width="1.3"/><rect x="5" y="7.2" width="7" height="2.6" fill="#0f6b5c"/><rect x="12" y="7.2" width="5" height="2.6" fill="#946a17"/><rect x="8" y="16.2" width="9" height="2.6" fill="#0f6b5c" opacity=".55"/></svg>';
// Old multi-page URLs now live as sections of the one-page lesson; keep them working as redirects.
const MOVED = { "lesson/": "#lesson", "film/": "#films", "lab/": "#lab", "challenges/": "#challenges", "slides/": "#slides", "python/": "#python" };
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
let commit = "dev";
try {
  commit = execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim();
} catch {}
const topbar = (base, home) => `<header class="topbar"><div class="wrap"><a class="brand" href="${base}">${BRAND}<span class="brand-name">Legalization Lesson 03</span><span class="brand-sub">合法吗？布局合法性检查与指标</span></a>
<nav class="topnav" aria-label="页面"><a href="${home ? "" : base}#films">影片</a><a href="${home ? "" : base}#lab">实验台</a><a href="${home ? "" : base}#challenges">挑战</a><a href="${base}verify/">验证</a><a href="${REPO}">GitHub</a></nav>
<div class="lang-switch" role="group" aria-label="语言"><span aria-current="true" lang="zh-CN">中文</span></div></div></header>`;
const foot = (base) => `<footer class="footer"><div class="wrap"><p>Legalization Lesson 03 · Legality Metrics（上游 module01-03-legality-metrics）· 代码 MIT · 内容 CC BY 4.0 · 改编自 yongfu-li/eda-learning（CC BY 4.0）· 构建 ${commit}</p><p><a href="${REPO}">GitHub</a> · <a href="${base}verify/#credits">来源与许可</a></p></div></footer>`;
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
  let html = readFileSync(f, "utf8");
  const home = rel === "index.html";
  html = html
    .replace("<!--TOPBAR-->", topbar(base, true))
    .replace("<!--NAV-->", `<div id="app"><a class="skip" href="#main">跳到正文</a>${topbar(base, false)}`)
    .replace("<!--FOOT-->", home ? foot(base) : `${foot(base)}</div>`)
    .replaceAll("{{BASE}}", base)
    .replace(/<link rel="stylesheet" href="([.\/]*)assets\/site.css">/, (m, b) => (html.includes("fonts.css") ? m : `<link rel="stylesheet" href="${b}assets/fonts.css">${m}`))
    .replace(/<!--FIG:([a-zA-Z0-9]+)-->/g, (_, k) => figureHtml(k, FIGS));
  writeFileSync(dest, html);
}
for (const [p, hash] of Object.entries(MOVED)) {
  mkdirSync(join(OUT, p), { recursive: true });
  writeFileSync(join(OUT, p, "index.html"), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>已移到课程主页</title><meta http-equiv="refresh" content="0; url=../${hash}"><link rel="canonical" href="../${hash}"></head><body><p>这一部分已经合并到<a href="../${hash}">课程主页</a>。</p><script>location.replace("../" + (location.hash.includes("state=") ? location.hash : ${JSON.stringify(hash)}));</script></body></html>`);
}
cpSync("src", join(OUT, "src"), { recursive: true });
cpSync("data", join(OUT, "data"), { recursive: true });
cpSync("oracles/cpsat/results.json", join(OUT, "data/cpsat-results.json"));
for (const f of ["oracles/openroad/mutants-report.json", "oracles/openroad/real-design.json", "media/voice/screen-results.json"])
  if (existsSync(f)) cpSync(f, join(OUT, "data", f.split("/").pop()));
cpSync("media/films", join(OUT, "media/films"), { recursive: true });
cpSync("media/films/index.json", join(OUT, "data/films/index.json"));
if (existsSync("media/walk")) cpSync("media/walk", join(OUT, "media/walk"), { recursive: true });
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
