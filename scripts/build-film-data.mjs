// Build the film clock, captions and chapters from media/script.zh.md.
//   node scripts/build-film-data.mjs [aligned.json]
// Without an alignment file the clock is the silent reading-time clock.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseScript, silentClock, toVtt, chaptersVtt } from "../src/film/cues.mjs";

const cues = parseScript(readFileSync("media/script.zh.md", "utf8"));
const clock = silentClock(cues);
clock.fps = 30;
clock.size = [1920, 1080];
mkdirSync("media/film", { recursive: true });
writeFileSync("media/film/clock.zh.json", JSON.stringify(clock, null, 1));
writeFileSync("media/film/film.zh.vtt", toVtt(clock));
writeFileSync("media/film/chapters.zh.vtt", chaptersVtt(clock));
// transcript (plain text by chapter)
writeFileSync("media/film/transcript.zh.md", ["# 文字稿：合法吗？", "", ...clock.cues.flatMap((c, i) => [`## ${i + 1}. ${c.title}（${fmt(c.start)}）`, "", cues[i].text, ""])].join("\n"));
// sample: the 30-45 s cut = c11 (aligned-but-overlapping seed, two repairs, their legality/displacement/HPWL)
const pick = ["c11"];
const sample = { cues: clock.cues.filter((c) => pick.includes(c.id)).map((c) => ({ id: c.id, start: c.start, end: c.end })) };
sample.duration = sample.cues.reduce((s, c) => s + (c.end - c.start), 0);
writeFileSync("media/film/sample.zh.json", JSON.stringify(sample, null, 1));
console.log(`film ${clock.duration}s, ${clock.cues.length} cues, sample ${sample.duration.toFixed(1)}s`);
function fmt(t) {
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}
