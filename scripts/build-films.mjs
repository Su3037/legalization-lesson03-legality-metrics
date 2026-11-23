// Build the four films' clocks, captions, chapters and transcripts from content/films/*.json.
//   node scripts/build-films.mjs           fails if a voiced film is missing a measured voice take
//   node scripts/build-films.mjs --jobs    writes build/voice-jobs.json (the paragraphs to synthesize) and exits
//
// Four clock kinds (house rules, same as placement-lab02-hpwl):
//   music    科普: cut to a recorded track. Each cue starts at its `at` time (seconds into the track); its caption
//            lines follow the reading rule and must end before the next cue (a violation fails the build).
//   voice    精讲: one voice take per cue, synthesized from the WHOLE paragraph (never caption by caption). The cue
//            lasts the measured take + a pause; caption boundaries inside the take snap to the take's own silences.
//   reading  进阶: no narration; every caption stays up 0.8 s + chars / 4.5.
//   walk     实验演示: recorded lab screenshots; one voiced paragraph per step, cursor and click before the voice.
// Outputs in media/films/: index.json, <id>.clock.zh.json, <id>.zh.vtt, <id>.chapters.zh.vtt, <id>.transcript.zh.md
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { parseScript } from "../src/film/cues.mjs";

export const RULE = { base: 0.8, rate: 4.5, minLine: 1.8, maxChars: 24, lead: 0.6, tail: 0.8, lastTail: 2.5 };
export const VOICE = { offset: 0.35, pause: 0.9, walkOffset: 1.5, end: 6 };
const ORDER = ["story", "concise", "advanced", "lab"];
const r3 = (v) => Math.round(v * 1000) / 1000;
const sha8 = (s) => createHash("sha256").update(s).digest("hex").slice(0, 8);
const vis = (s) => [...s].filter((c) => !/\s/.test(c));
const weight = (s) => vis(s).reduce((a, c) => a + (/[　-鿿＀-￯“”—…]/.test(c) ? 1 : 0.5), 0);
const readSec = (s) => Math.max(RULE.minLine, RULE.base + weight(s) / RULE.rate);

// Breath-marked paragraph -> caption lines (one row each, at most RULE.maxChars), breaking at ｜ and always at ‖.
export function captionLines(text) {
  const out = [];
  let line = "";
  for (const part of text.split(/(｜|‖)/)) {
    if (part === "‖") { if (line.trim()) out.push(line.trim()); line = ""; continue; }
    if (part === "｜") continue;
    const p = part.trim();
    if (!p) continue;
    if (line && weight(line + p) > RULE.maxChars) { out.push(line.trim()); line = p; } else line += p;
  }
  if (line.trim()) out.push(line.trim());
  return out;
}
export const spoken = (text) => text.replace(/[｜‖]/g, "").replace(/HPWL/g, "半周长线长").replace(/Abacus-lite/g, "Abacus light").replace(/OpenROAD/g, "Open Road").replace(/\s+/g, " ").trim();

function beatTimes(beats, caps, start) {
  const out = {};
  for (const [name, w] of Object.entries(beats)) {
    if (typeof w === "number") { out[name] = r3(start + w); continue; }
    const c = caps.find((c) => c.lines.join("").includes(w));
    if (!c) throw new Error(`beat ${name}: "${w}" not found`);
    const txt = c.lines.join("");
    out[name] = r3(c.start + ((c.end - c.start) * 0.85 * txt.indexOf(w)) / Math.max(1, txt.length));
  }
  return out;
}

function loadFilm(id) {
  const f = JSON.parse(readFileSync(`content/films/${id}.json`, "utf8"));
  if (f.source) {
    const all = parseScript(readFileSync(f.source, "utf8"));
    f.cues = f.cues.map((sid) => {
      const c = all.find((x) => x.id === sid);
      const body = readFileSync(f.source, "utf8").match(new RegExp(`## ${sid} · .+?\\n\\n([\\s\\S]+?)\\n\\n\\[beat`))[1];
      return { scene: sid, title: c.title, text: body, beats: Object.fromEntries(c.beats.map((b) => [b.name, b.word])) };
    });
  }
  return f;
}

function takeFor(film, i, text) {
  const key = `${film}-${String(i + 1).padStart(2, "0")}-${sha8(spoken(text))}`;
  const meta = `media/voice/takes/${key}.json`;
  return { key, text: spoken(text), file: `media/voice/takes/${key}.m4a`, meta: existsSync(meta) ? JSON.parse(readFileSync(meta, "utf8")) : null };
}

// Caption times inside one voiced paragraph: proportional to reading weight, then snapped to the nearest silence.
function voicedCaps(lines, take, at) {
  const D = take.duration;
  const total = lines.reduce((a, l) => a + weight(l) + 1.2, 0);
  let acc = 0;
  const cuts = [0];
  for (let i = 0; i < lines.length - 1; i++) {
    acc += weight(lines[i]) + 1.2;
    let b = (D * acc) / total;
    const near = (take.gaps || []).map(([s, e]) => (s + e) / 2).filter((m) => Math.abs(m - b) < 1.0 && m > cuts[cuts.length - 1] + 0.6);
    if (near.length) b = near.reduce((x, y) => (Math.abs(y - b) < Math.abs(x - b) ? y : x));
    cuts.push(b);
  }
  cuts.push(D + 0.3);
  return lines.map((l, i) => ({ start: r3(at + cuts[i]), end: r3(at + cuts[i + 1]), lines: [l] }));
}

function buildClock(f, jobs) {
  const cues = [];
  const problems = [];
  if (f.kind === "music") {
    const track = JSON.parse(readFileSync(`content/music/${f.music}.json`, "utf8"));
    f.cues.forEach((c, i) => {
      const start = c.at;
      const next = i + 1 < f.cues.length ? f.cues[i + 1].at : track.duration;
      let t = start + (i === 0 ? 0.4 : 0.3);
      const caps = c.lines.map((l) => { const d = readSec(l); const o = { start: r3(t), end: r3(t + d), lines: [l] }; t += d; return o; });
      if (t > next - 0.15) problems.push(`${f.id} ${c.title}: lines need ${(t - start).toFixed(2)} s, cue has ${(next - start).toFixed(2)} s`);
      cues.push({ id: c.scene, title: c.title, start: r3(start), end: r3(next), captions: caps, beats: beatTimes(c.beats, caps, start) });
    });
    const hitsIn = track.onsets.filter(([t]) => t >= track.sections.roll - 0.05 && t <= track.sections.lock + 0.05);
    const top = Math.max(...hitsIn.map((o) => o[1]));
    return { kind: "music", duration: r3(track.duration), cues, problems, track: { title: track.track, artist: track.artist, hits: hitsIn.filter((o) => o[1] >= 0.8 * top).map((o) => o[0]) } };
  }
  let t = RULE.lead;
  f.cues.forEach((c, i) => {
    const start = i === 0 ? 0 : r3(t);
    const lines = captionLines(c.text);
    let caps;
    let extra = {};
    if (f.kind === "reading") {
      caps = lines.map((l) => { const d = readSec(l); const o = { start: r3(t), end: r3(t + d), lines: [l] }; t += d; return o; });
      t += RULE.tail;
    } else {
      const take = takeFor(f.id, i, c.text);
      jobs.push(take);
      const at = r3((f.kind === "walk" ? start + VOICE.walkOffset : t + VOICE.offset));
      if (!take.meta) { take.missing = true; problems.push(`${f.id}: missing voice take ${take.key}`); take.meta = { duration: weight(c.text) / 4.25, gaps: [] }; extra.provisional = true; }
      caps = voicedCaps(lines, take.meta, at);
      extra = { ...extra, voice: take.file, voiceAt: at, voiceDuration: r3(take.meta.duration) };
      t = at + take.meta.duration + VOICE.pause;
    }
    const cue = { id: f.kind === "walk" ? "walk" : c.scene, title: c.title, start, end: 0, captions: caps, beats: f.kind === "walk" ? {} : beatTimes(c.beats, caps, start), ...extra };
    if (f.kind === "walk") cue.step = i;
    cues.push(cue);
  });
  // closing card: credits and where to go next
  cues.push({ id: "end", title: "片尾", start: r3(t), end: 0, captions: [], beats: {} });
  t += VOICE.end;
  for (let i = 0; i < cues.length; i++) cues[i].end = i + 1 < cues.length ? cues[i + 1].start : r3(t);
  return { kind: f.kind, duration: r3(t), cues, problems };
}

const ts = (s) => new Date(Math.round(s * 1000)).toISOString().slice(11, 23);
const vtt = (clock) => "WEBVTT\n\n" + clock.cues.flatMap((c) => c.captions.map((cap) => `${ts(cap.start)} --> ${ts(cap.end)}\n${cap.lines.join("\n")}\n`)).join("\n");
const chapters = (clock) => "WEBVTT\n\n" + clock.cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.title}\n`).join("\n");
const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

mkdirSync("media/films", { recursive: true });
const jobs = [];
const index = [];
const problems = [];
for (const id of ORDER) {
  const f = loadFilm(id);
  const clock = buildClock(f, jobs);
  problems.push(...clock.problems);
  delete clock.problems;
  const out = { id, label: f.label, title: f.title, fps: 30, size: [1920, 1080], rule: f.kind === "music" || f.kind === "reading" ? RULE : VOICE, credit: f.credit, ...clock };
  if (f.kind === "walk") out.walk = f.cues.map((c) => ({ title: c.title, target: c.target }));
  writeFileSync(`media/films/${id}.clock.zh.json`, JSON.stringify(out, null, 1));
  writeFileSync(`media/films/${id}.zh.vtt`, vtt(clock));
  writeFileSync(`media/films/${id}.chapters.zh.vtt`, chapters(clock));
  const head = { music: "配乐影片（无旁白）的字幕文字稿。", voice: "旁白文字稿（与配音一致；旁白是 Kokoro 合成声音）。", reading: "无旁白影片的字幕文字稿。", walk: "实验演示的旁白文字稿（Kokoro 合成声音）。" }[f.kind];
  writeFileSync(`media/films/${id}.transcript.zh.md`, [`# ${f.label} · ${f.title}`, "", head, "", ...clock.cues.filter((c) => c.captions.length).flatMap((c) => [`## ${c.title}（${fmt(c.start)}）`, "", c.captions.map((x) => x.lines.join("")).join(""), ""])].join("\n"));
  const audio = { music: "配乐 · 无旁白", voice: "旁白 + 配乐", reading: "字幕 + 配乐", walk: "旁白 + 配乐" }[f.kind];
  index.push({ id, kind: f.kind, label: f.label, title: f.title, why: f.why, credit: f.credit, audio, duration: clock.duration, clock: `media/films/${id}.clock.zh.json`, video: `media/renders/${id}.zh.mp4`, poster: `media/renders/${id}.zh.jpg`, vtt: `media/films/${id}.zh.vtt`, chapters: `media/films/${id}.chapters.zh.vtt`, transcript: `media/films/${id}.transcript.zh.md` });
  console.log(`${id}: ${f.kind}, ${clock.duration} s, ${clock.cues.length} cues`);
}
writeFileSync("media/films/index.json", JSON.stringify(index, null, 1));
mkdirSync("build", { recursive: true });
writeFileSync("build/voice-jobs.json", JSON.stringify(jobs.filter((j) => j.missing || process.argv.includes("--all")).map(({ key, text }) => ({ key, text })), null, 1));
if (process.argv.includes("--jobs")) process.exit(0);
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
