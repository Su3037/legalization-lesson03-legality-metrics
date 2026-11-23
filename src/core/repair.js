// Small repair demonstrations, measured by the checker. Mirror of python/legality_metrics/repair.py.
// greedySnap / overlapRemove / abacusLite: ports of the teacher's teaching helpers
// (yongfu-li/eda-learning @ 003bcd4, CC BY 4.0), modified to honour a non-unit site pitch.
// abacusLite is NOT the published Abacus. `abacus` is a small faithful implementation of
// Spindler, Schlichtmann & Johannes, ISPD 2008 (unit weights, quadratic movement, sub-rows).
import { normalizeDesign } from "./legality.js";

const r9 = (v) => Math.round(v * 1e9) / 1e9;

function ctx(design) {
  const d = normalizeDesign(design);
  const c = d.chip;
  const wid = Object.fromEntries(d.cells.map((x) => [x.id, x.width]));
  return { d, sw: c.siteW, x0: c.siteX0, rows: c.rows, W: c.W, wid };
}

function snapSite(x, w, sw, x0, W) {
  let k = Math.floor((x - x0) / sw + 0.5);
  const kmax = Math.floor((W - w - x0) / sw + 1e-9);
  k = Math.max(0, Math.min(kmax, k));
  return r9(x0 + k * sw);
}

const nearestRow = (y, rows) =>
  rows.slice().sort((a, b) => Math.abs(y - a) - Math.abs(y - b) || a - b)[0];
const ov = (a0, a1, b0, b1) => a0 < b1 - 1e-9 && b0 < a1 - 1e-9;
const byXThenId = (p) => (a, b) => p[a].x - p[b].x || (a < b ? -1 : a > b ? 1 : 0);

export function greedySnap(design, placement, { fixedMode = true } = {}) {
  const { d, sw, x0, rows, W, wid } = ctx(design);
  const out = {};
  for (const c of d.cells) {
    if (fixedMode && d.fixed[c.id]) {
      out[c.id] = { ...d.fixed[c.id] };
      continue;
    }
    const p = placement[c.id];
    out[c.id] = { x: snapSite(p.x, wid[c.id], sw, x0, W), y: nearestRow(p.y, rows) };
  }
  return out;
}

export function overlapRemove(design, placement, { fixedMode = true } = {}) {
  const { d, sw, x0, rows, W, wid } = ctx(design);
  const fixed = fixedMode ? d.fixed : {};
  const snapped = greedySnap(design, placement, { fixedMode });
  const out = Object.fromEntries(Object.entries(snapped).map(([k, v]) => [k, { ...v }]));
  for (const ry of rows) {
    const ids = d.cells.map((c) => c.id).filter((id) => !fixed[id] && snapped[id].y === ry);
    ids.sort(byXThenId(snapped));
    let blocked = Object.keys(fixed)
      .filter((f) => Math.abs(fixed[f].y - ry) < 1e-9)
      .map((f) => [fixed[f].x, fixed[f].x + wid[f]])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let cursor = x0;
    for (const id of ids) {
      const w = wid[id];
      let x = Math.max(cursor, snapped[id].x);
      let moved = true;
      while (moved) {
        moved = false;
        for (const [b0, b1] of blocked) {
          if (ov(x, x + w, b0, b1)) {
            x = b1;
            moved = true;
          }
        }
      }
      if (x + w > W + 1e-9) x = snapSite(W - w, w, sw, x0, W);
      out[id] = { x: r9(x), y: ry };
      cursor = x + w;
      blocked = [...blocked, [x, x + w]].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    }
  }
  return out;
}

export function abacusLite(design, placement, { fixedMode = true } = {}) {
  const { d, sw, x0, rows, W, wid } = ctx(design);
  const fixed = fixedMode ? d.fixed : {};
  const order = d.cells.map((c) => c.id).filter((id) => !fixed[id]).sort(byXThenId(placement));
  const placed = Object.fromEntries(Object.keys(fixed).map((f) => [f, { ...fixed[f] }]));
  for (const id of order) {
    const w = wid[id];
    const o = placement[id];
    let best = null;
    let bestCost = Infinity;
    for (const ry of rows) {
      const occ = Object.entries(placed)
        .filter(([, p]) => Math.abs(p.y - ry) < 1e-9)
        .map(([k, p]) => [p.x, p.x + wid[k]])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const prefer = snapSite(o.x, w, sw, x0, W);
      const tryPlace = (start) => {
        let xx = start;
        for (let g = 0; g < Math.floor(W / sw) + 2; g++) {
          const hit = occ.find(([a, b]) => ov(xx, xx + w, a, b));
          if (!hit) return xx + w <= W + 1e-9 ? xx : null;
          xx = hit[1];
        }
        return null;
      };
      let cand = tryPlace(prefer);
      if (cand === null) cand = tryPlace(x0);
      if (cand === null) continue;
      const cost = Math.abs(cand - o.x) + Math.abs(ry - o.y);
      if (cost < bestCost - 1e-12 || (Math.abs(cost - bestCost) <= 1e-12 && (best === null || cand < best.x))) {
        bestCost = cost;
        best = { x: r9(cand), y: ry };
      }
    }
    if (!best) best = { x: snapSite(o.x, w, sw, x0, W), y: nearestRow(o.y, rows) };
    placed[id] = best;
  }
  const snapped = greedySnap(design, placement, { fixedMode });
  return Object.fromEntries(d.cells.map((c) => [c.id, placed[c.id] || snapped[c.id]]));
}

function subrows(ry, fixed, wid, x0, W) {
  const blocks = Object.keys(fixed)
    .filter((k) => Math.abs(fixed[k].y - ry) < 1e-9)
    .map((k) => [fixed[k].x, fixed[k].x + wid[k]])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = [];
  let start = x0;
  for (const [b0, b1] of blocks) {
    if (b0 > start + 1e-9) out.push([start, b0]);
    start = Math.max(start, b1);
  }
  if (W > start + 1e-9) out.push([start, W]);
  return out;
}

function placeRow(clusters, id, xp, w, lo, hi, sw, x0) {
  const clamp = (v, cw) => Math.min(Math.max(v, lo), hi - cw);
  const collapse = (cs) => {
    const c = cs[cs.length - 1];
    c.x = clamp(c.q / c.e, c.w);
    c.x = x0 + Math.floor((c.x - x0) / sw + 0.5) * sw;
    c.x = clamp(c.x, c.w);
    if (cs.length > 1) {
      const p = cs[cs.length - 2];
      if (p.x + p.w > c.x + 1e-9) {
        p.cells.push(...c.cells);
        p.e += c.e;
        p.q += c.q - c.e * p.w;
        p.w += c.w;
        cs.pop();
        collapse(cs);
      }
    }
  };
  const last = clusters[clusters.length - 1];
  if (!last || last.x + last.w <= clamp(xp, w) + 1e-9) {
    clusters.push({ cells: [id], e: 1, q: xp, w, x: clamp(xp, w) });
  } else {
    last.cells.push(id);
    last.q += xp - last.w;
    last.e += 1;
    last.w += w;
  }
  collapse(clusters);
  return clusters;
}

function positions(clusters, wid) {
  const pos = {};
  for (const c of clusters) {
    let x = c.x;
    for (const id of c.cells) {
      pos[id] = r9(x);
      x += wid[id];
    }
  }
  return pos;
}

const copyClusters = (cs) => cs.map((c) => ({ ...c, cells: c.cells.slice() }));

export function abacus(design, placement, { fixedMode = true } = {}) {
  const { d, sw, x0, rows, W, wid } = ctx(design);
  const fixed = fixedMode ? d.fixed : {};
  const srs = [];
  for (const ry of rows) for (const [lo, hi] of subrows(ry, fixed, wid, x0, W)) srs.push({ y: ry, lo, hi, clusters: [], used: 0 });
  const order = d.cells.map((c) => c.id).filter((id) => !fixed[id]).sort(byXThenId(placement));
  const out = Object.fromEntries(Object.keys(fixed).map((f) => [f, { ...fixed[f] }]));
  for (const id of order) {
    const { x: xp, y: yp } = placement[id];
    const w = wid[id];
    let best = null;
    const cand = srs.slice().sort((a, b) => Math.abs(a.y - yp) - Math.abs(b.y - yp) || a.y - b.y || a.lo - b.lo);
    for (const sr of cand) {
      if (best && (sr.y - yp) ** 2 >= best.cost - 1e-12) continue;
      if (sr.used + w > sr.hi - sr.lo + 1e-9) continue;
      const trial = placeRow(copyClusters(sr.clusters), id, xp, w, sr.lo, sr.hi, sw, x0);
      const x = positions(trial, wid)[id];
      const cost = (x - xp) ** 2 + (sr.y - yp) ** 2;
      if (!best || cost < best.cost - 1e-12) best = { cost, sr };
    }
    if (!best) throw new Error(`abacus: no sub-row can hold ${id}`);
    best.sr.clusters = placeRow(best.sr.clusters, id, xp, w, best.sr.lo, best.sr.hi, sw, x0);
    best.sr.used += w;
  }
  for (const sr of srs) for (const [id, x] of Object.entries(positions(sr.clusters, wid))) out[id] = { x, y: sr.y };
  return Object.fromEntries(d.cells.map((c) => [c.id, out[c.id]]));
}
