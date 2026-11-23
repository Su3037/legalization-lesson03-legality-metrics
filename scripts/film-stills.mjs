// Render selected stills and check determinism: renderAt(t) must equal renderAt after jumping around
// and on a fresh page.  FILM=concise node scripts/film-stills.mjs [out-dir] [t1 t2 ...]
import { chromium } from "./pw.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const URL = process.env.FILM_URL || "http://127.0.0.1:8803/legalization-lesson03-legality-metrics/film/render.html";
const out = process.argv[2] || "build/stills";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`${URL}?film=${process.env.FILM || "concise"}`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
const clock = await page.evaluate(() => window.clock);
let times = process.argv.slice(3).map(Number);
if (!times.length) times = clock.cues.flatMap((c) => [c.start + 0.5, (c.start + c.end) / 2, c.end - 1]);
for (const t of times) {
  await page.evaluate(async (t) => { await window.renderAt(t); }, t);
  await page.locator("#stage").screenshot({ path: `${out}/t${t.toFixed(2).padStart(7, "0")}.png` });
}
// determinism
const probe = [12.3, 0.37 * clock.duration, 0.66 * clock.duration, clock.duration - 2].map((t) => Math.round(t * 10) / 10);
const a = [];
for (const t of probe) a.push(await page.evaluate(async (t) => [await window.renderAt(t), document.getElementById("stage").innerHTML], t));
await page.evaluate(async () => { await window.renderAt(2); await window.renderAt(window.clock.duration - 1); await window.renderAt(40); });
const b = [];
for (const t of probe.slice().reverse()) b.unshift(await page.evaluate(async (t) => [await window.renderAt(t), document.getElementById("stage").innerHTML], t));
const fresh = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await fresh.goto(`${URL}?film=${process.env.FILM || "concise"}`);
await fresh.waitForFunction(() => window.ready === true);
const c = [];
for (const t of probe) c.push(await fresh.evaluate(async (t) => [await window.renderAt(t), document.getElementById("stage").innerHTML], t));
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const det = { probe, repeatedEqual: same(a, b), freshEqual: same(a, c), errors };
writeFileSync(`${out}/determinism.json`, JSON.stringify(det, null, 1));
console.log(JSON.stringify({ stills: times.length, ...det, duration: clock.duration }));
await browser.close();
