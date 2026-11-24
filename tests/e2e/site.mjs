// End-to-end check of the built or deployed site.
// SITE_URL=https://su3037.github.io/legalization-lesson03-legality-metrics/ node tests/e2e/site.mjs [out.json]
// Exercises the one-page lesson and the auxiliary pages: four films, the live checker, challenges, quiz,
// film-to-lab transfer, old-URL redirects, downloads, and runs axe-core.
import { chromium } from "../../scripts/pw.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";

const BASE = (process.env.SITE_URL || "http://127.0.0.1:8803/legalization-lesson03-legality-metrics/").replace(/\/?$/, "/");
const axeSrc = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const PAGES = ["", "verify/", "listen/", "study/"];
const results = { base: BASE, at: new Date().toISOString(), pages: {}, checks: {} };
const browser = await chromium.launch(process.env.BROWSER_PROXY ? {proxy:{server:process.env.BROWSER_PROXY}} : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
let failed = 0;
const ok = (name, cond, detail = "") => {
  results.checks[name] = { pass: !!cond, detail };
  if (!cond) failed++;
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

for (const [scheme, p] of [...PAGES.map((p) => ["light", p]), ...PAGES.map((p) => ["dark", p])]) {
  const page = await ctx.newPage();
  await page.emulateMedia({ colorScheme: scheme });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  page.on("response", (r) => r.status() >= 400 && errs.push(`${r.status()} ${r.url()}`));
  await page.goto(BASE + p, { waitUntil: "networkidle" });
  if (!p) await page.waitForFunction(() => window.appReady === true || window.appError, null, { timeout: 30000 });
  await page.waitForTimeout(400);
  await page.addScriptTag({ content: axeSrc });
  const axe = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0]?.target?.join(" ") }));
  });
  const serious = axe.filter((v) => v.impact === "serious" || v.impact === "critical");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  results.pages[`${scheme} ${p || "/"}`] = { errors: errs, axe, overflow };
  if (scheme === "light") ok(`page ${p || "/"} loads without errors`, errs.length === 0, errs.slice(0, 3).join(" | "));
  ok(`page ${p || "/"} (${scheme}) axe: no serious/critical`, serious.length === 0, serious.map((v) => `${v.id}×${v.n} (${v.sample})`).join("; "));
  await page.close();
}

// phone width: no horizontal scroll on the main pages
{
  const ph = await browser.newContext({ viewport: { width: 375, height: 800 }, deviceScaleFactor: 1 });
  const page = await ph.newPage();
  const bad = [];
  for (const p of ["", "verify/", "study/"]) {
    await page.goto(BASE + p, { waitUntil: "networkidle" });
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) bad.push(p || "/");
  }
  ok("phone width 375px: no horizontal page scroll", bad.length === 0, bad.join(", "));
  await ph.close();
}

// live checker (section 05 of the one page)
{
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.appReady === true);
  await page.waitForTimeout(200);
  const v0 = await page.locator("#verdict").innerText();
  ok("lab: overlap seed is illegal with 3 violations", /不合法/.test(v0) && /3 条违规/.test(v0), v0.replace(/\n/g, " "));
  await page.selectOption("#preset", "legal");
  const v1 = await page.locator("#verdict").innerText();
  ok("lab: legal preset is legal", /✓ 合法/.test(v1), v1.replace(/\n/g, " "));
  await page.locator('#board .cell[data-id="B"]').focus();
  await page.keyboard.press("ArrowLeft");
  if (!(await page.locator("#snap").isChecked())) await page.keyboard.press("ArrowLeft");
  const v2 = await page.locator("#verdict").innerText();
  ok("lab: keyboard move B left makes OVERLAP A/B", /不合法/.test(v2), v2.replace(/\n/g, " "));
  await page.selectOption("#preset", "fixedmoved");
  const v3 = await page.locator("#verdict").innerText();
  await page.locator("#fixed").uncheck();
  const v4 = await page.locator("#verdict").innerText();
  ok("lab: fixed toggle flips the verdict", /✗ 不合法/.test(v3) && /✓ 合法/.test(v4), `${v3.split("\n")[0]} → ${v4.split("\n")[0]}`);
  await page.locator("#fixed").check();
  await page.locator("#stepbtn").click();
  await page.locator("#stepbtn").click();
  ok("lab: step-through highlights a pseudocode line", (await page.locator("#pseudo li.on").count()) === 1);
  // challenges and quiz
  ok("challenges: 10 challenges rendered", (await page.locator("article.challenge").count()) === 10);
  const q = page.locator(".quiz-item");
  ok("quiz: 8 self-check items", (await q.count()) === 8, String(await q.count()));
  await q.first().locator('input[value="1"]').check();
  const fb = await q.first().locator(".fb").innerText();
  ok("quiz: correct answer gets an explanation", /✓/.test(fb), fb);
  // slides viewer
  await page.locator('#slides [data-a="next"]').click();
  ok("slides: viewer pages with notes", /p2 \/ 12/.test(await page.locator("#slides .slide-page").innerText()) && (await page.locator("#slides .slide-notes-text").innerText()).length > 5);
  // four films: each loads with metadata
  const cards = page.locator(".film-card");
  ok("films: four film cards", (await cards.count()) === 4);
  // Film selection awaits its clock JSON before changing the media source.
  // Wait for both the selected tab and new metadata, rather than reading the previous film.
  const selectFilm = async (i) => {
    const id = await cards.nth(i).getAttribute("data-film");
    await cards.nth(i).click();
    await page.waitForFunction(id => {
      const selected = document.querySelector('.film-card[aria-selected="true"]');
      return selected?.dataset.film === id && document.getElementById("v").readyState >= 1;
    }, id);
  };
  for (let i = 0; i < 4; i++) {
    await selectFilm(i);
    const dur = await page.evaluate(() => new Promise((res) => { const v = document.getElementById("v"); if (v.readyState >= 1) res(v.duration); else v.addEventListener("loadedmetadata", () => res(v.duration), { once: true }); }));
    const label = await cards.nth(i).locator(".num").innerText();
    ok(`film ${label}: video metadata loads`, dur > 100, `duration ${dur}`);
  }
  // film -> lab: the 精讲 film near the end of its two-repairs chapter
  await selectFilm(1);
  const t = await page.evaluate(async () => { const c = await (await fetch("media/films/concise.clock.zh.json")).json(); const cue = c.cues.find((x) => x.id === "c11"); return cue.end - 1; });
  await page.evaluate((t) => new Promise((res) => { const v = document.getElementById("v"); const go = () => { v.addEventListener("seeked", res, { once: true }); v.currentTime = t; }; if (v.readyState >= 1) go(); else v.addEventListener("loadedmetadata", go, { once: true }); }), t);
  await page.locator("#to-lab").click();
  await page.waitForTimeout(300);
  const note = await page.locator("#film-note").innerText();
  const vv = await page.locator("#verdict").innerText();
  ok("film→lab: frame opens in the lab and is re-checked", /来自《精讲》/.test(note) && /✓ 合法/.test(vv), `${note.slice(0, 40)} / ${vv.split("\n")[0]}`);
  await page.close();
}

// old multi-page URLs redirect into the one page
{
  const page = await ctx.newPage();
  await page.goto(BASE + "lab/", { waitUntil: "networkidle" });
  ok("redirect: lab/ lands on the one-page #lab", page.url().endsWith("/#lab"), page.url());
  await page.close();
}

// downloads exist
{
  const page = await ctx.newPage();
  for (const f of ["slides/out/legality-metrics-slides.pdf", "downloads/module03-python-exercise.zip", "downloads/module03-outline.md", ...["story", "concise", "advanced", "lab"].flatMap((f) => [`media/renders/${f}.zh.mp4`, `media/films/${f}.zh.vtt`])]) {
    const r = await page.request.get(BASE + f);
    ok(`download ${f}`, r.ok(), String(r.status()));
  }
  await page.close();
}
await browser.close();
results.failed = failed;
if (process.argv[2]) { mkdirSync(dirname(process.argv[2]), { recursive: true }); writeFileSync(process.argv[2], JSON.stringify(results, null, 1)); }
console.log(failed ? `${failed} check(s) failed` : "all site checks passed");
process.exit(failed ? 1 : 0);
