// Parse media/script.zh.md into cues, caption units and a clock.
// Silent clock: each caption unit stays up for chars/4.5 + 0.8 s (the reading-time rule the
// teacher's earlier feedback asked for); a "‖" adds 0.8 s of picture-only time.
// Voiced clock: pass `aligned` = per-cue {start, chars:[{t0,t1}]} from forced alignment.
export const READ_CPS = 4.5;
export const MAX_LINE = 16;

const strip = (s) => s.replace(/[｜‖]/g, "").replace(/\s+/g, " ").trim();
export const visibleLen = (s) => [...s.replace(/\s/g, "")].length;

export function parseScript(md) {
  const cues = [];
  const re = /^## (c\d+) · (.+?)\n\n([\s\S]+?)\n\n\[beat: (.+?)\]/gm;
  let m;
  while ((m = re.exec(md))) {
    const [, id, title, body, beatStr] = m;
    const beats = beatStr.split(";").map((b) => {
      const mm = b.trim().match(/^(\S+) @ "(.+)"$/);
      return { name: mm[1], word: mm[2] };
    });
    // chunks between breath marks; "‖" marks a picture pause after the chunk
    const parts = body.split(/(｜|‖)/);
    const chunks = [];
    let cur = "";
    for (const p of parts) {
      if (p === "｜" || p === "‖") {
        if (cur.trim()) chunks.push({ text: cur.trim(), pause: p === "‖" });
        else if (p === "‖" && chunks.length) chunks[chunks.length - 1].pause = true;
        cur = "";
      } else cur += p;
    }
    if (cur.trim()) chunks.push({ text: cur.trim(), pause: false });
    cues.push({ id, title, text: strip(body), chunks, beats });
  }
  return cues;
}

// Pack chunks into caption units: at most 2 lines of MAX_LINE visible chars; break only at chunk
// boundaries (never inside a number, symbol or lexicon term). A pause always ends a unit.
export function captionUnits(cue) {
  const units = [];
  let lines = [];
  let line = "";
  const flush = () => {
    if (line) lines.push(line);
    if (lines.length) units.push({ lines });
    lines = [];
    line = "";
  };
  for (const ch of cue.chunks) {
    const t = ch.text;
    if (visibleLen(line + t) <= MAX_LINE) line += t;
    else {
      if (line) lines.push(line);
      line = t;
      if (lines.length === 2) {
        units.push({ lines });
        lines = [];
      }
    }
    if (ch.pause) flush();
  }
  flush();
  return units;
}

export function silentClock(cues, { lead = 1.2, tail = 2.0, gap = 0.6 } = {}) {
  let t = lead;
  const out = [];
  for (const cue of cues) {
    const units = captionUnits(cue);
    const start = t;
    const caps = [];
    for (const u of units) {
      const n = visibleLen(u.lines.join(""));
      const dur = Math.round((n / READ_CPS + 0.8) * 100) / 100;
      caps.push({ start: round(t), end: round(t + dur), lines: u.lines });
      t += dur;
    }
    t += gap;
    out.push({ id: cue.id, title: cue.title, start: round(start), end: round(t), captions: caps, beats: placeBeats(cue, caps) });
  }
  return { duration: round(t + tail), cues: out, clock: "silent-reading", rule: `chars/${READ_CPS} + 0.8 s per caption unit` };
}

// A beat fires when its word appears: interpolate inside the caption unit by character position.
export function placeBeats(cue, caps) {
  const beats = {};
  for (const b of cue.beats) {
    for (const c of caps) {
      const txt = c.lines.join("");
      const k = txt.indexOf(b.word);
      if (k >= 0) {
        beats[b.name] = round(c.start + ((c.end - c.start - 0.8) * k) / Math.max(1, txt.length));
        break;
      }
    }
    if (beats[b.name] === undefined) beats[b.name] = caps.length ? caps[0].start : 0;
  }
  return beats;
}

const round = (v) => Math.round(v * 1000) / 1000;

export function toVtt(clock) {
  const ts = (t) => {
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = (t % 60).toFixed(3).padStart(6, "0");
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s}`;
  };
  const lines = ["WEBVTT", ""];
  let n = 1;
  for (const c of clock.cues)
    for (const cap of c.captions) lines.push(String(n++), `${ts(cap.start)} --> ${ts(cap.end)}`, ...cap.lines, "");
  return lines.join("\n");
}

export function chaptersVtt(clock) {
  const ts = (t) => new Date(t * 1000).toISOString().slice(11, 23);
  return ["WEBVTT", "", ...clock.cues.flatMap((c, i) => [String(i + 1), `${ts(c.start)} --> ${ts(c.end)}`, c.title, ""])].join("\n");
}
