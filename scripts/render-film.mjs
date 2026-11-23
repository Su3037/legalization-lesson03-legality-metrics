// Render the deterministic film to H.264 by calling window.renderAt(t) for every frame.
// node scripts/render-film.mjs <film id> <out.mp4> [--audio=mix.wav] [--captions=0] [--fps=30] [--from=s --to=s]
// Identical frames (same stage HTML) reuse the previous screenshot, which keeps static stretches cheap.
import { chromium } from "./pw.mjs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));
const [filmId, out] = args.filter((a) => !a.startsWith("--"));
const fps = Number(opt.fps || 30);
const BASE = process.env.FILM_URL || "http://127.0.0.1:8803/legalization-lesson03-legality-metrics/film/render.html";
mkdirSync(dirname(out), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`${BASE}?film=${encodeURIComponent(filmId)}&captions=${opt.captions === "0" ? 0 : 1}`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
const { duration, start } = await page.evaluate(() => ({ duration: window.clock.duration, start: window.clock.cues[0].start }));
const t0 = Number(opt.from ?? 0);
const t1 = Number(opt.to ?? duration);
const n = Math.round((t1 - t0) * fps);

const silent = opt.audio ? out.replace(/\.mp4$/, ".video.mp4") : out;
const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "png", "-i", "-",
  "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(fps), "-movflags", "+faststart", silent], { stdio: ["pipe", "inherit", "inherit"] });
const done = new Promise((res, rej) => ff.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg " + c)))));
const write = (buf) => new Promise((res) => (ff.stdin.write(buf) ? res() : ff.stdin.once("drain", res)));

let lastHash = null;
let lastBuf = null;
let shots = 0;
const began = Date.now();
for (let i = 0; i < n; i++) {
  const t = t0 + i / fps;
  const html = await page.evaluate(async (t) => (await window.renderAt(t), document.getElementById("stage").innerHTML), t);
  const h = createHash("sha1").update(html).digest("hex");
  if (h !== lastHash) {
    lastBuf = await page.locator("#stage").screenshot({ type: "png" });
    lastHash = h;
    shots++;
  }
  await write(lastBuf);
  if (i % (fps * 20) === 0) process.stderr.write(`  ${out}: ${t.toFixed(1)}s / ${t1.toFixed(1)}s, ${shots} unique\n`);
}
ff.stdin.end();
await done;
await browser.close();
if (opt.audio) {
  const { execFileSync } = await import("node:child_process");
  const { rmSync } = await import("node:fs");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", silent, "-ss", String(t0), "-t", String(t1 - t0), "-i", opt.audio, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out]);
  rmSync(silent);
}
console.log(JSON.stringify({ out, frames: n, unique: shots, fps, from: t0, to: t1, seconds: (Date.now() - began) / 1000, errors, start }));
