// Record the lab walkthrough film's pictures from the REAL lesson page (not a mock-up).
//   node scripts/record-walk.mjs      (needs the built site served: python3 scripts/serve.py 8803)
// For each step of content/films/lab.json: scroll the target into view, screenshot (before), perform the step's
// actions with real clicks / keys, screenshot again (after). Writes media/walk/NN-before.png, NN-after.png and
// media/walk/walk.json (viewport, cursor target in page pixels, number of actions).
import { chromium } from "./pw.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const BASE = process.env.SITE_URL || "http://127.0.0.1:8803/legalization-lesson03-legality-metrics/";
const film = JSON.parse(readFileSync("content/films/lab.json", "utf8"));
const VIEW = { w: 1380, h: 776 };
mkdirSync("media/walk", { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: VIEW.w, height: VIEW.h }, deviceScaleFactor: 1, reducedMotion: "reduce" });
await ctx.addInitScript(() => { try { localStorage.clear(); } catch {} });
const page = await ctx.newPage();
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.appReady === true);
await page.addStyleTag({ content: ".topbar,.module-nav{position:static!important}" });
const steps = [];
for (const [i, c] of film.cues.entries()) {
  const nn = String(i + 1).padStart(2, "0");
  const el = page.locator(c.target).first();
  if (c.scroll) await page.locator(c.scroll).evaluate((e) => e.scrollIntoView({ block: "start" }));
  else await el.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(150);
  await page.screenshot({ path: `media/walk/${nn}-before.png` });
  const box = await el.boundingBox();
  for (const [kind, sel, val] of c.actions) {
    if (kind === "click") await page.locator(sel).first().click();
    else if (kind === "select") await page.selectOption(sel, val);
    else if (kind === "check") await page.locator(sel).check();
    else if (kind === "uncheck") await page.locator(sel).uncheck();
    else if (kind === "focus") await page.locator(sel).first().focus();
    else if (kind === "key") await page.keyboard.press(sel);
    await page.waitForTimeout(80);
  }
  if (!c.scroll) await el.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(150);
  await page.screenshot({ path: `media/walk/${nn}-after.png` });
  steps.push({ title: c.title, before: `${nn}-before.png`, after: `${nn}-after.png`, viewport: VIEW, target: [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)], actions: c.actions.length });
  console.log(nn, c.title, steps.at(-1).target);
}
writeFileSync("media/walk/walk.json", JSON.stringify({ url: "su3037.github.io/legalization-lesson03-legality-metrics/#lab", recordedFrom: "the built lesson page (scripts/record-walk.mjs)", steps }, null, 1));
await browser.close();
