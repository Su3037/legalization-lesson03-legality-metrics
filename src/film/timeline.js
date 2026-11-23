// Film timeline: a pure function from time to a frame description.
// stateAt(t) never depends on previous calls, the wall clock or randomness, so any time can be
// rendered directly (renderAt(12.3) == renderAt(2); renderAt(27); renderAt(12.3)).
import { checkPlacement, normalizeDesign } from "../core/legality.js";
import { overlapRemove, abacusLite } from "../core/repair.js";

const ease = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p));
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerpP = (a, b, p) => {
  const o = {};
  for (const k of Object.keys(b)) {
    const A = a[k] || b[k];
    o[k] = { x: A.x + (b[k].x - A.x) * p, y: A.y + (b[k].y - A.y) * p };
  }
  return o;
};
const R = (v) => Math.round(v * 1000) / 1000;

export function buildWorld(data) {
  const design = normalizeDesign(data.raw);
  const free = { ...design, fixed: {} };
  const C = data.cases;
  const seed = C.overlap_seed.placement;
  const gold = C.illustrative_golden.placement;
  const snapped = C.greedy_snap_float.placement;
  const orm = overlapRemove(design, seed);
  const lite = abacusLite(design, seed);
  const trade = normalizeDesign(data.trade);
  const inst = data.cpsat.instances;
  const optSeed = inst.find((i) => i.name.includes("overlap seed") && i.fixed_D);
  const optFloat = inst.find((i) => i.name.includes("float") && i.fixed_D);
  return { design, free, seed, gold, float: data.raw.starter_float, snapped, orm, lite, trade, tradeData: data.trade, optSeed, optFloat, gcd: data.gcd };
}

// Keyframe helper: list of [beatTimeOrNull, state]; placement moves ease over `dur` seconds.
function track(t, frames, dur = 0.9) {
  let i = 0;
  for (let k = 0; k < frames.length; k++) if (frames[k][0] <= t) i = k;
  const [t0, st] = frames[i];
  const prev = i > 0 ? frames[i - 1][1] : st;
  const p = ease(clamp01((t - t0) / dur));
  const out = { ...st };
  if (st.placement && prev.placement && st.placement !== prev.placement) out.placement = lerpP(prev.placement, st.placement, p);
  out.settled = p >= 1;
  out.kf = i;
  return out;
}

// Each scene returns { board: {...state for renderBoard}, design, panel: {...}, title }.
const SCENES = {
  c01(W, t, b) {
    const s = track(t, [
      [0, { placement: W.seed }],
      [b["zoom-middle-row"], { placement: W.seed, highlightRow: 2 }],
      [b["flash-ABC"], { placement: W.seed, highlightRow: 2, bad: { A: ["?"], B: ["?"], C: ["?"] } }],
    ]);
    return { board: { ...s, show: { anchors: false } }, panel: { kind: "question", text: "合法吗？", sub: "全局布局给出的坐标" } };
  },
  c02(W, t, b) {
    const show = { sites: t >= b.sites, anchors: t >= b["anchor-dot"], intervals: t >= b["interval-A"] ? ["A"] : [], rowLabels: true };
    return {
      board: { placement: { ...W.gold, A: { x: 4, y: 2 } }, focus: t >= b["anchor-dot"] ? ["A"] : null, show, labels: t >= b["anchor-dot"] ? { A: "(4, 2)" } : {} },
      panel: { kind: "terms", items: [["行", "高 2，底边 y = 0、2、4", t >= b.rows], ["站点", "宽 1 的格子", t >= b.sites], ["坐标", "单元左下角", t >= b["anchor-dot"]], ["区间", "[4, 6)：左闭右开", t >= b["interval-A"]]] },
    };
  },
  c03(W, t, b) {
    const offrow = { ...W.gold, C: { x: 0, y: 3 } };
    const offsite = { ...W.gold, F: { x: 10.5, y: 0 } };
    const s = track(t, [
      [0, { placement: W.gold }],
      [b.rule1 + 1.5, { placement: offrow, check: true }],
      [b.rule2 + 1.5, { placement: W.gold }],
      [b["half-site"], { placement: offsite, check: true }],
    ]);
    return { board: { ...s, show: { anchors: true } }, panel: { kind: "rules", upto: t >= b.rule2 ? 2 : 1, hl: t >= b.rule2 ? 2 : 1 } };
  },
  c04(W, t, b) {
    const s = track(t, [
      [0, { placement: W.gold, fixedMode: false }],
      [b["D-to-11"], { placement: { ...W.gold, D: { x: 11, y: 4 } }, fixedMode: false, check: true }],
    ]);
    return { board: { ...s, show: { anchors: true, overhang: t >= b.overhang } }, panel: { kind: "rules", upto: 3, hl: 3 } };
  },
  c05(W, t, b) {
    const s = track(t, [
      [0, { placement: W.gold }],
      [b.touch - 1.5, { placement: W.gold, focusAB: true }],
      [b["overlap-1"], { placement: { ...W.gold, B: { x: 1, y: 0 } }, check: true, focusAB: true }],
    ]);
    return { board: { ...s, focus: t >= b["half-open"] ? ["A", "B"] : null, show: { intervals: t >= b["half-open"] ? ["A", "B"] : [] } }, panel: { kind: "rules", upto: 4, hl: 4 } };
  },
  c06(W, t, b) {
    const s = track(t, [
      [0, { placement: W.gold, fixedMode: true }],
      [b["move-D"], { placement: { ...W.gold, D: { x: 6, y: 4 } }, fixedMode: true, check: true }],
      [b.toggle, { placement: { ...W.gold, D: { x: 6, y: 4 } }, fixedMode: false, check: true }],
    ]);
    return { board: { ...s, show: { ref: false } }, panel: { kind: "rules", upto: 5, hl: 5, fixedOff: t >= b.toggle } };
  },
  c07(W, t, b) {
    const phase = t >= b.list ? 3 : t >= b.scan ? 2 : t >= b.validate ? 1 : 0;
    return { board: { placement: W.seed, check: phase >= 2, highlightRow: phase >= 2 ? 2 : undefined }, panel: { kind: "checker", phase, report: checkPlacement(W.design, W.seed) } };
  },
  c08(W, t, b) {
    const s = track(t, [
      [0, { placement: W.gold }],
      [b["float-in"], { placement: W.float }],
      [b.snap, { placement: W.snapped }],
      [b["still-overlap"], { placement: W.snapped, check: true, highlightRow: 2 }],
    ], 1.4);
    return { board: { ...s, show: { sites: true, anchors: t >= b["float-in"] } }, panel: { kind: "snap", stage: t >= b["still-overlap"] ? 2 : t >= b.snap ? 1 : 0 } };
  },
  c09(W, t, b) {
    const s = track(t, [
      [0, { placement: W.seed }],
      [b.manhattan, { placement: W.orm }],
    ], 1.2);
    const rep = { name: "开场重叠布局", placement: W.seed };
    return { board: { ...s, reference: rep, show: { ref: t >= b["disp-title"], arrows: t >= b.manhattan } }, panel: { kind: "disp", placement: s.settled ? s.placement : null, lock: t >= b["ref-lock"], sum: t >= b.sum } };
  },
  c10(W, t, b) {
    const wid = Object.fromEntries(W.design.cells.map((c) => [c.id, c.width]));
    const pts = ["A", "B", "C", "D"].map((id) => [W.lite[id].x + wid[id] / 2, W.lite[id].y + 1]);
    const nw = Math.max(...pts.map((q) => q[0])) - Math.min(...pts.map((q) => q[0]));
    const nh = Math.max(...pts.map((q) => q[1])) - Math.min(...pts.map((q) => q[1]));
    return {
      board: { placement: W.lite, show: { centres: t >= b.centres, nets: t >= b.bbox ? [4] : [], netLabel: t >= b.wh } },
      panel: { kind: "hpwl", stage: t >= b.wh ? 2 : t >= b.centres ? 1 : 0, value: checkPlacement(W.design, W.lite).metrics.hpwl.total, nw, nh },
    };
  },
  c11(W, t, b) {
    const s = track(t, [
      [0, { placement: W.seed, check: true }],
      [b.push, { placement: W.orm, check: true, which: "orm" }],
      [b["rows-move"] - 1.2, { placement: W.seed, check: true, which: null }],
      [b["rows-move"], { placement: W.lite, check: true, which: "lite" }],
    ], 1.2);
    const rep = { name: "开场重叠布局", placement: W.seed };
    return { board: { ...s, reference: rep, ghost: t >= b.push ? W.seed : null, show: { arrows: true } }, panel: { kind: "compare", showOrm: t >= b.push + 2, showLite: t >= b["rows-move"] + 2, verdict: t >= b.compare } };
  },
  c12(W, t, b) {
    const sols = W.optSeed.optimal_placements_sample;
    const k = t >= b.many ? Math.min(sols.length - 1, Math.floor((t - b.many) / 0.9)) : 0;
    const placement = t >= b.solver ? sols[k] : W.lite;
    return { board: { placement, reference: { name: "开场重叠布局", placement: W.seed }, show: { arrows: true } }, panel: { kind: "optimum", stage: t >= b.gap ? 3 : t >= b.many ? 2 : t >= b.solver ? 1 : 0, k, n: W.optSeed.n_optimal_placements, opt: W.optSeed, optF: W.optFloat } };
  },
  c13(W, t, b) {
    const T = W.tradeData;
    const s = track(t, [
      [0, { placement: T.reference }],
      [b.jump, { placement: T.jump }],
      [b.shift - 1.0, { placement: T.reference }],
      [b.shift, { placement: T.shift }],
    ], 1.1);
    return {
      design: W.trade,
      board: { ...s, reference: { name: "X 掉落时", placement: T.reference }, show: { arrows: true, ref: true }, spreadStack: true },
      panel: { kind: "trade", jump: t >= b.jump + 1.2, shift: t >= b.shift + 1.2, table: t >= b.table },
    };
  },
  c14(W, t, b) {
    return { board: null, gcd: t >= b.gcd, panel: { kind: "real", stage: t >= b.gcd ? 4 : t >= b.fence ? 3 : t >= b.orient ? 2 : 1 } };
  },
  c15(W, t, b) {
    return { board: { placement: W.lite, check: true }, panel: { kind: "recap", n: t >= b.lab ? 4 : t >= b.recap3 ? 3 : t >= b.recap2 ? 2 : t >= b.recap1 ? 1 : 0 } };
  },
};

// The scene state for absolute film time t.
export function stateAt(W, clock, t) {
  const cues = clock.cues;
  let ci = 0;
  for (let i = 0; i < cues.length; i++) if (cues[i].start <= t) ci = i;
  const cue = cues[ci];
  const local = t; // beats are absolute times
  const sc = SCENES[cue.id](W, local, cue.beats);
  const design = sc.design || W.design;
  const b = sc.board;
  let report = null;
  if (b && b.placement) {
    const fixedMode = b.fixedMode !== false;
    if (b.check && b.settled !== false) report = checkPlacement(design, b.placement, { fixedMode });
  }
  const cap = cue.captions.find((c) => c.start <= t && t < c.end) || null;
  return {
    t: R(t),
    cue: cue.id,
    chapter: ci + 1,
    title: cue.title,
    caption: cap ? cap.lines : null,
    design,
    board: b,
    report,
    panel: sc.panel,
    gcd: sc.gcd || false,
    cueStart: cue.start,
  };
}

// Compact, documented snapshot returned by window.renderAt(t) (used by determinism tests and the
// film-to-lab transfer).
export function snapshot(s) {
  return {
    t: s.t,
    cue: s.cue,
    caption: s.caption,
    placement: s.board && s.board.placement ? Object.fromEntries(Object.entries(s.board.placement).map(([k, v]) => [k, { x: R(v.x), y: R(v.y) }])) : null,
    fixedMode: s.board ? s.board.fixedMode !== false : true,
    reference: s.board && s.board.reference ? s.board.reference.name : null,
    verdict: s.report ? s.report.verdict : null,
    violations: s.report ? s.report.violations.map((v) => v.code + ":" + v.cells.join("/")) : [],
    design: s.design === undefined ? null : s.design.cells.map((c) => c.id).join(""),
  };
}
