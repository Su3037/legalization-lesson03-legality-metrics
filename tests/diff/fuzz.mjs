// JS <-> Python differential fuzzing. Usage: node tests/diff/fuzz.mjs [count] [seed]
// Generates designs and placements (integer, non-integer, non-unit pitch, malformed), runs the JS
// checker and repairs, runs the Python mirror on the same inputs, and compares semantic results.
// Any mismatch is saved to tests/regressions/ and the process exits 1.
import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { checkPlacement, semantic } from "../../src/core/legality.js";
import { greedySnap, overlapRemove, abacusLite, abacus } from "../../src/core/repair.js";

const N = Number(process.argv[2] || 3000);
const SEED = Number(process.argv[3] || 20261123);
let s = SEED >>> 0;
const rnd = () => ((s = (s + 0x6d2b79f5) >>> 0), (((t) => ((t = Math.imul(t ^ (t >>> 15), t | 1)), (t ^= t + Math.imul(t ^ (t >>> 7), t | 61)), ((t ^ (t >>> 14)) >>> 0) / 4294967296))(s)));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

function makeCase(i) {
  const kind = pick(["int", "int", "int", "float", "pitch", "malformed", "edge"]);
  const siteW = kind === "pitch" ? pick([0.5, 0.19, 2, 0.25]) : 1;
  const siteX0 = kind === "pitch" ? pick([0, siteW / 2, siteW]) : 0;
  const nRows = int(1, 4);
  const rowH = pick([1, 2]);
  const nSites = int(4, 14);
  const W = siteX0 + nSites * siteW;
  const rows = Array.from({ length: nRows }, (_, r) => r * rowH);
  const H = nRows * rowH;
  const nCells = int(1, 7);
  const ids = "ABCDEFGHIJ".split("").slice(0, nCells);
  const cells = ids.map((id) => ({ id, width: int(1, 3) * siteW }));
  const nets = Array.from({ length: int(0, 4) }, () => ids.filter(() => rnd() < 0.5)).filter((n) => n.length);
  const fixed = {};
  const pos = {};
  for (const c of cells) {
    let x = siteX0 + int(-1, nSites) * siteW;
    let y = pick(rows);
    if (kind === "float") {
      x = Math.round((rnd() * (W + 2) - 1) * 100) / 100;
      y = Math.round((rnd() * (H + 1) - 0.5) * 100) / 100;
    }
    if (kind === "edge" && rnd() < 0.5) x = pick([W - c.width, W - c.width + siteW, -siteW, 0, siteX0]);
    if (kind === "edge" && rnd() < 0.3) y = pick([H, -rowH, rowH / 2, H - rowH]);
    pos[c.id] = { x, y };
  }
  if (rnd() < 0.3) {
    const f = pick(ids);
    fixed[f] = rnd() < 0.7 ? { ...pos[f] } : { x: pos[f].x + siteW, y: pos[f].y };
  }
  const design = { chip: { W, H, siteW, rowH, rows, siteX0 }, cells, nets, fixed };
  if (kind === "malformed") {
    const m = pick(["nan", "inf", "missing", "unknown", "dup", "empty", "badw", "string", "netref", "rows", "null"]);
    if (m === "nan") pos[ids[0]].x = NaN;
    if (m === "inf") pos[ids[0]].y = Infinity;
    if (m === "missing") delete pos[ids[0]];
    if (m === "unknown") pos.ZZ = { x: 0, y: 0 };
    if (m === "dup") cells.push({ ...cells[0] });
    if (m === "empty") for (const k of Object.keys(pos)) delete pos[k];
    if (m === "badw") cells[0].width = pick([0, -1]);
    if (m === "string") pos[ids[0]].x = "3";
    if (m === "netref") nets.push([ids[0], "QQ"]);
    if (m === "rows") design.chip.rows = [0, rowH / 2];
    if (m === "null") pos[ids[0]] = null;
  }
  const ref = { name: "ref", placement: Object.fromEntries(Object.entries(pos).map(([k, v]) => [k, v && { x: Math.round(Number(v.x) || 0), y: v.y }])) };
  return { i, kind, design, placement: pos, fixedMode: rnd() < 0.8, reference: ref };
}

// JSON cannot carry NaN/Infinity: encode them.
const enc = (o) => JSON.stringify(o, (k, v) => (typeof v === "number" && !Number.isFinite(v) ? { __num: String(v) } : v));

const cases = Array.from({ length: N }, (_, i) => makeCase(i));
const js = cases.map((c) => {
  const r = checkPlacement(c.design, c.placement, { fixedMode: c.fixedMode, reference: c.reference });
  const out = { check: semantic(r) };
  if (r.verdict !== "invalid") {
    for (const [name, fn] of Object.entries({ snap: greedySnap, overlap: overlapRemove, lite: abacusLite, abacus })) {
      try {
        const p = fn(c.design, c.placement, { fixedMode: c.fixedMode });
        out[name] = { placement: p, check: semantic(checkPlacement(c.design, p, { fixedMode: c.fixedMode, reference: c.reference })) };
      } catch (e) {
        out[name] = { error: String(e.message).split(":")[0] };
      }
    }
  }
  return out;
});
mkdirSync("build", { recursive: true });
writeFileSync("build/fuzz-cases.json", enc(cases));
const py = JSON.parse(execFileSync("python3", ["-I", "tests/diff/run_py.py", "build/fuzz-cases.json"], { maxBuffer: 1 << 28 }).toString());
const norm = (o) => JSON.stringify(o, (k, v) => (typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v));
const bad = [];
const tally = { verdict: {}, kinds: {} };
cases.forEach((c, i) => {
  tally.verdict[js[i].check.verdict] = (tally.verdict[js[i].check.verdict] || 0) + 1;
  tally.kinds[c.kind] = (tally.kinds[c.kind] || 0) + 1;
  if (norm(js[i]) !== norm(py[i])) bad.push({ case: c, js: js[i], py: py[i] });
});
const summary = { seed: SEED, cases: N, mismatches: bad.length, ...tally, comparisons: N + js.filter((x) => x.snap).length * 4 };
console.log(JSON.stringify(summary));
writeFileSync("build/fuzz-summary.json", JSON.stringify(summary, null, 1));
if (bad.length) {
  mkdirSync("tests/regressions", { recursive: true });
  bad.slice(0, 5).forEach((b, k) => writeFileSync(`tests/regressions/fuzz-${SEED}-${k}.json`, enc(b)));
  process.exit(1);
}
