// Legality checker and metrics for single-height row placement.
// Spec: docs/checker-spec.md. Mirror: python/legality_metrics/legality.py.
// Pure functions only: no DOM, no randomness, no clock.

export const RULES = ["ROW", "SITE", "BOUNDS", "FIXED", "OVERLAP"];

const MSG = {
  V_BAD_CHIP: ["芯片参数无效", "invalid chip parameters"],
  V_BAD_ROWS: ["行定义无效", "invalid row definition"],
  V_DUP_ID: ["单元编号重复", "duplicate cell id"],
  V_BAD_SIZE: ["单元尺寸无效", "invalid cell size"],
  V_HEIGHT: ["单元高度不等于行高", "cell height differs from row height"],
  V_EMPTY: ["布局为空", "empty placement"],
  V_MISSING: ["缺少单元坐标", "missing cell position"],
  V_UNKNOWN: ["出现未声明的单元", "undeclared cell in placement"],
  V_NONFINITE: ["坐标不是有限数", "coordinate is not a finite number"],
  V_NET_REF: ["线网引用了未声明的单元", "net references an undeclared cell"],
  V_FIXED_REF: ["固定声明无效", "invalid fixed-cell declaration"],
  ROW: ["不在任何一行的底边上", "not on a row bottom"],
  SITE: ["没有对齐站点", "not aligned to a site"],
  BOUNDS: ["单元有一部分在芯片外", "part of the cell is outside the chip"],
  FIXED: ["固定单元被移动了", "fixed cell has moved"],
  OVERLAP: ["同一行内区间重叠", "intervals overlap on the same row"],
};

export function message(code, lang = "zh") {
  const m = MSG[code];
  return m ? m[lang === "en" ? 1 : 0] : code;
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// Convert a chip-unit value to database units. Returns an integer when the value is on the
// DBU grid (within float noise), otherwise the exact fractional product.
export function toDbu(v, dbu) {
  const p = v * dbu;
  const r = Math.round(p);
  return Math.abs(p - r) <= 1e-6 ? r : p;
}

export function normalizeDesign(design) {
  const chip = design.chip || {};
  const rowH = chip.rowH;
  const cells = (design.cells || []).map((c) => ({
    id: c.id,
    width: c.width,
    height: c.height === undefined ? rowH : c.height,
  }));
  return {
    chip: {
      W: chip.W,
      H: chip.H,
      siteW: chip.siteW === undefined ? 1 : chip.siteW,
      rowH,
      rows: Array.isArray(chip.rows) ? chip.rows.slice() : [],
      siteX0: chip.siteX0 === undefined ? 0 : chip.siteX0,
      dbu: chip.dbu === undefined ? 1000 : chip.dbu,
    },
    cells,
    nets: (design.nets || []).map((n) => n.slice()),
    fixed: design.fixed
      ? { ...design.fixed }
      : Object.fromEntries((design.fixed_macros || []).map((m) => [m.id, { x: m.x, y: m.y }])),
  };
}

// The teacher's JSON stores locks in `fixed_macros`; accept both forms.
export function designFromTeacherJson(raw) {
  const fixed = {};
  for (const m of raw.fixed_macros || []) fixed[m.id] = { x: m.x, y: m.y };
  return normalizeDesign({
    chip: { ...raw.chip },
    cells: raw.cells.map((c) => ({ id: c.id, width: c.width, height: c.height })),
    nets: raw.nets,
    fixed,
  });
}

function validate(d, placement) {
  const errors = [];
  const err = (code, cells, extra = {}) =>
    errors.push({ code, cells, message: message(code), ...extra });
  const { chip } = d;
  for (const k of ["W", "H", "siteW", "rowH", "dbu"]) {
    if (!isNum(chip[k]) || chip[k] <= 0) err("V_BAD_CHIP", [], { field: k, value: chip[k] });
  }
  if (!isNum(chip.siteX0)) err("V_BAD_CHIP", [], { field: "siteX0", value: chip.siteX0 });
  if (!chip.rows.length) err("V_BAD_CHIP", [], { field: "rows", value: [] });
  if (errors.length) return errors;
  const rows = chip.rows;
  if (!rows.every(isNum)) err("V_BAD_ROWS", [], { rows });
  else {
    const s = rows.slice().sort((a, b) => a - b);
    for (let i = 1; i < s.length; i++) {
      if (s[i] === s[i - 1]) err("V_BAD_ROWS", [], { rows, reason: "duplicate" });
      else if (s[i] - s[i - 1] < chip.rowH - 1e-9) err("V_BAD_ROWS", [], { rows, reason: "rows overlap" });
    }
  }
  const seen = new Set();
  for (const c of d.cells) {
    if (seen.has(c.id)) err("V_DUP_ID", [c.id]);
    seen.add(c.id);
    if (!isNum(c.width) || c.width <= 0 || !isNum(c.height) || c.height <= 0)
      err("V_BAD_SIZE", [c.id], { width: c.width, height: c.height });
    else if (Math.abs(c.height - chip.rowH) > 1e-9) err("V_HEIGHT", [c.id], { height: c.height, rowH: chip.rowH });
  }
  const p = placement && typeof placement === "object" ? placement : {};
  const keys = Object.keys(p);
  if (!keys.length) err("V_EMPTY", []);
  for (const c of d.cells) if (keys.length && !(c.id in p)) err("V_MISSING", [c.id]);
  for (const k of keys.slice().sort()) if (!seen.has(k)) err("V_UNKNOWN", [k]);
  for (const c of d.cells) {
    const q = p[c.id];
    if (q === undefined) continue;
    if (!q || !isNum(q.x) || !isNum(q.y)) err("V_NONFINITE", [c.id], { x: q && q.x, y: q && q.y });
  }
  d.nets.forEach((net, i) => {
    for (const id of net) if (!seen.has(id)) err("V_NET_REF", [id], { net: i });
  });
  for (const [id, f] of Object.entries(d.fixed)) {
    if (!seen.has(id) || !f || !isNum(f.x) || !isNum(f.y)) err("V_FIXED_REF", [id]);
  }
  return errors;
}

// Geometry of one cell in DBU.
function geom(d, c, q) {
  const u = d.chip.dbu;
  return {
    id: c.id,
    x: toDbu(q.x, u),
    y: toDbu(q.y, u),
    w: toDbu(c.width, u),
    h: toDbu(c.height, u),
  };
}

export function checkPlacement(design, placement, options = {}) {
  const d = normalizeDesign(design);
  const opts = { fixedMode: true, includeFixedInDisplacement: true, reference: null, ...options };
  const errors = validate(d, placement);
  if (errors.length) {
    return {
      verdict: "invalid",
      legal: false,
      errors,
      violations: [],
      first: errors[0],
      counts: Object.fromEntries(RULES.map((r) => [r, 0])),
      diagnostics: [],
      metrics: null,
    };
  }
  const { chip } = d;
  const u = chip.dbu;
  const rowsD = chip.rows.map((y) => toDbu(y, u));
  const siteW = toDbu(chip.siteW, u);
  const x0 = toDbu(chip.siteX0, u);
  const W = toDbu(chip.W, u);
  const H = toDbu(chip.H, u);
  const violations = [];
  const g = d.cells.map((c) => geom(d, c, placement[c.id]));
  const fromDbu = (v) => v / u;

  g.forEach((cg, i) => {
    const c = d.cells[i];
    const q = placement[c.id];
    const rowIdx = Number.isInteger(cg.y) ? rowsD.indexOf(cg.y) : -1;
    cg.row = rowIdx;
    if (rowIdx < 0)
      violations.push({ code: "ROW", cells: [c.id], evidence: { y: q.y, rows: chip.rows.slice() }, message: message("ROW") });
    const offset = cg.x - x0;
    const aligned = Number.isInteger(cg.x) && offset % siteW === 0;
    if (!aligned)
      violations.push({
        code: "SITE",
        cells: [c.id],
        evidence: { x: q.x, siteX0: chip.siteX0, siteW: chip.siteW, sites: offset / siteW },
        message: message("SITE"),
      });
    const out = [];
    if (cg.x < 0) out.push("left");
    if (cg.x + cg.w > W) out.push("right");
    if (cg.y < 0) out.push("bottom");
    if (cg.y + cg.h > H) out.push("top");
    if (out.length)
      violations.push({
        code: "BOUNDS",
        cells: [c.id],
        evidence: { sides: out, extent: [q.x, q.y, fromDbu(cg.x + cg.w), fromDbu(cg.y + cg.h)], chip: [0, 0, chip.W, chip.H] },
        message: message("BOUNDS"),
      });
    if (opts.fixedMode && d.fixed[c.id]) {
      const f = d.fixed[c.id];
      if (toDbu(f.x, u) !== cg.x || toDbu(f.y, u) !== cg.y)
        violations.push({ code: "FIXED", cells: [c.id], evidence: { at: [q.x, q.y], locked: [f.x, f.y] }, message: message("FIXED") });
    }
  });

  const pairs = [];
  const diagnostics = [];
  for (let i = 0; i < g.length; i++) {
    for (let j = i + 1; j < g.length; j++) {
      const a = g[i];
      const b = g[j];
      const xHit = a.x < b.x + b.w && b.x < a.x + a.w;
      if (a.row >= 0 && b.row >= 0) {
        if (a.row === b.row && xHit) pairs.push([a.row, i, j]);
      } else if (xHit && a.y < b.y + b.h && b.y < a.y + a.h) {
        diagnostics.push({ code: "RECT_INTERSECT", cells: [a.id, b.id] });
      }
    }
  }
  pairs.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
  for (const [r, i, j] of pairs) {
    const a = g[i];
    const b = g[j];
    violations.push({
      code: "OVERLAP",
      cells: [a.id, b.id],
      evidence: {
        row: chip.rows[r],
        interval_a: [fromDbu(a.x), fromDbu(a.x + a.w)],
        interval_b: [fromDbu(b.x), fromDbu(b.x + b.w)],
        shared: fromDbu(Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)),
      },
      message: message("OVERLAP"),
    });
  }
  // keep per-cell rules in declaration order (already), overlap after
  const counts = Object.fromEntries(RULES.map((r) => [r, 0]));
  for (const v of violations) counts[v.code]++;
  const metrics = computeMetrics(d, placement, opts);
  return {
    verdict: violations.length ? "illegal" : "legal",
    legal: violations.length === 0,
    errors: [],
    violations,
    first: violations[0] || null,
    counts,
    diagnostics,
    metrics,
  };
}

export function displacement(design, placement, reference, options = {}) {
  const d = normalizeDesign(design);
  const include = options.includeFixedInDisplacement !== false;
  const per = [];
  for (const c of d.cells) {
    if (!include && d.fixed[c.id]) continue;
    const p = placement[c.id];
    const r = reference.placement ? reference.placement[c.id] : reference[c.id];
    if (!p || !r) continue;
    per.push({ id: c.id, d: Math.abs(p.x - r.x) + Math.abs(p.y - r.y) });
  }
  const total = per.reduce((s, e) => s + e.d, 0);
  return {
    reference: reference.name || "reference",
    total: round9(total),
    average: per.length ? round9(total / per.length) : 0,
    max: per.length ? round9(Math.max(...per.map((e) => e.d))) : 0,
    n: per.length,
    perCell: per.map((e) => ({ id: e.id, d: round9(e.d) })),
  };
}

export function netHpwl(design, placement, net) {
  const d = normalizeDesign(design);
  const size = new Map(d.cells.map((c) => [c.id, c]));
  const xs = [];
  const ys = [];
  for (const id of net) {
    const p = placement[id];
    const c = size.get(id);
    if (!p || !c) continue;
    xs.push(p.x + c.width / 2);
    ys.push(p.y + c.height / 2);
  }
  if (!xs.length) return 0;
  return round9(Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys));
}

export function totalHpwl(design, placement) {
  const d = normalizeDesign(design);
  const perNet = d.nets.map((n) => netHpwl(d, placement, n));
  return { total: round9(perNet.reduce((s, v) => s + v, 0)), perNet, pins: "cell-centre" };
}

function computeMetrics(d, placement, opts) {
  const hp = totalHpwl(d, placement);
  const disp = opts.reference ? displacement(d, placement, opts.reference, opts) : null;
  return { hpwl: hp, displacement: disp };
}

function round9(v) {
  return Math.round(v * 1e9) / 1e9;
}

export function clonePlacement(p) {
  const o = {};
  for (const [k, v] of Object.entries(p)) o[k] = { x: v.x, y: v.y };
  return o;
}

// Short summary used by tests and the differential fuzzer: everything semantic, no wording.
export function semantic(report) {
  return {
    verdict: report.verdict,
    errors: report.errors.map((e) => [e.code, e.cells]),
    violations: report.violations.map((v) => [v.code, v.cells]),
    hpwl: report.metrics ? report.metrics.hpwl.total : null,
    disp: report.metrics && report.metrics.displacement ? report.metrics.displacement.total : null,
  };
}

// Pseudocode shown next to the step-through (line numbers are referenced by traceCheck).
export const PSEUDOCODE = [
  "输入：芯片、单元、线网、固定声明；布局；参考布局",
  "若输入不完整或有非法数值 → 输入无效，停止",
  "对每个单元 c：",
  "  若 c.y 不是任何一行的底边 → 记 ROW",
  "  若 (c.x − x0) 不是站点宽的整数倍 → 记 SITE",
  "  若 c 的整个矩形不在芯片内 → 记 BOUNDS",
  "  若 c 是固定单元且坐标变了 → 记 FIXED",
  "对同一行里的每一对单元 (a, b)：",
  "  若 [a.x, a.x+a.w) 与 [b.x, b.x+b.w) 相交 → 记 OVERLAP",
  "合法 ⇔ 一条记录都没有；第一条记录 = 最先发现的错误",
  "位移 = Σ |x−x参考| + |y−y参考|；HPWL = Σ 线网中心包围盒的宽 + 高",
];

// Step-by-step trace of the same checks, for teaching. Each step: {line, rule, cells, pass, evidence}.
// The failing steps, in order, are exactly checkPlacement(...).violations (tested).
export function traceCheck(design, placement, options = {}) {
  const report = checkPlacement(design, placement, options);
  const steps = [{ line: 1, rule: "VALID", cells: [], pass: report.verdict !== "invalid", evidence: { errors: report.errors.map((e) => e.code) } }];
  if (report.verdict === "invalid") {
    steps.push({ line: 9, rule: "VERDICT", cells: [], pass: false, evidence: { verdict: "invalid" } });
    return { steps, report };
  }
  const d = normalizeDesign(design);
  const fixedMode = options.fixedMode !== false;
  const byKey = new Map(report.violations.map((v) => [v.code + ":" + v.cells.join("/"), v]));
  const line = { ROW: 3, SITE: 4, BOUNDS: 5, FIXED: 6 };
  for (const c of d.cells) {
    for (const rule of ["ROW", "SITE", "BOUNDS", "FIXED"]) {
      if (rule === "FIXED" && !(fixedMode && d.fixed[c.id])) continue;
      const v = byKey.get(rule + ":" + c.id);
      steps.push({ line: line[rule], rule, cells: [c.id], pass: !v, evidence: v ? v.evidence : null });
    }
  }
  const u = d.chip.dbu;
  const rowsD = d.chip.rows.map((y) => toDbu(y, u));
  const rowOf = (id) => {
    const y = toDbu(placement[id].y, u);
    return Number.isInteger(y) ? rowsD.indexOf(y) : -1;
  };
  const pairs = [];
  for (let i = 0; i < d.cells.length; i++)
    for (let j = i + 1; j < d.cells.length; j++) {
      const a = d.cells[i].id;
      const b = d.cells[j].id;
      const ra = rowOf(a);
      if (ra >= 0 && ra === rowOf(b)) pairs.push([ra, i, j, a, b]);
    }
  pairs.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2]);
  for (const [r, , , a, b] of pairs) {
    const v = byKey.get("OVERLAP:" + a + "/" + b);
    steps.push({ line: 8, rule: "OVERLAP", cells: [a, b], pass: !v, evidence: v ? v.evidence : { row: d.chip.rows[r] } });
  }
  steps.push({ line: 9, rule: "VERDICT", cells: [], pass: report.legal, evidence: { verdict: report.verdict, violations: report.violations.length } });
  steps.push({ line: 10, rule: "METRICS", cells: [], pass: true, evidence: { hpwl: report.metrics.hpwl.total, displacement: report.metrics.displacement } });
  return { steps, report };
}
