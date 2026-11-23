// Shared SVG board: one pure function from state to SVG markup.
// Used by the live lab, the film renderer and the slide figures, so all three draw the same thing.
// World coordinates are chip units with y up; the SVG has y down.

export const COLORS = {
  A: "#5b9dff",
  B: "#f2a93b",
  C: "#3cc48f",
  D: "#a78bfa",
  E: "#f472b6",
  F: "#38c5de",
  X: "#f87171",
};
const FALLBACK = ["#7dd3fc", "#fcd34d", "#86efac", "#c4b5fd", "#f9a8d4", "#5eead4"];
export const cellColor = (id, i = 0) => COLORS[id] || FALLBACK[i % FALLBACK.length];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const f = (v) => (Math.round(v * 100) / 100).toString();

// Layout: map world -> view box. `pad` leaves room for labels and overhang.
export function frame(design, vb = { w: 960, h: 520 }, pad = { l: 64, r: 64, t: 40, b: 56 }) {
  const { W, H } = design.chip;
  const extraX = 1.2; // allow cells to hang outside by ~1 unit
  const s = Math.min((vb.w - pad.l - pad.r) / (W + 2 * extraX), (vb.h - pad.t - pad.b) / (H + 1.2));
  const ox = pad.l + extraX * s + (vb.w - pad.l - pad.r - (W + 2 * extraX) * s) / 2;
  const oy = vb.h - pad.b - 0.6 * s;
  return { s, X: (x) => ox + x * s, Y: (y) => oy - y * s, vb };
}

// state: {
//   design, placement, reference?: {name, placement}, fixedMode, selected, focus: [ids],
//   bad: {id: [codes]}, show: {sites, anchors, ref, arrows, centres, nets: [netIndex] | "all", intervals: [ids], rowLabels},
//   ghost: {id:{x,y}} (snapshot outlines), labels: {id: text}, highlightRow: y, dim: [ids], opacity: {id: a}
// }
export function renderBoard(state, opts = {}) {
  const d = state.design;
  const fr = opts.frame || frame(d, opts.vb);
  const { X, Y, s, vb } = fr;
  const { W, H, rows, rowH, siteW = 1, siteX0 = 0 } = d.chip;
  const show = { sites: true, anchors: false, ref: false, arrows: false, centres: false, nets: [], intervals: [], rowLabels: true, ...(state.show || {}) };
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vb.w} ${vb.h}" class="board" role="${opts.interactive ? "group" : "img"}" aria-label="${esc(opts.label || "布局图")}">`);
  out.push(`<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,.35)" stroke-width="2"/></pattern>
<marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#ffd166"/></marker></defs>`);
  // rows
  rows.forEach((ry, i) => {
    const hl = state.highlightRow !== undefined && Math.abs(state.highlightRow - ry) < 1e-9;
    out.push(`<rect x="${f(X(0))}" y="${f(Y(ry + rowH))}" width="${f(W * s)}" height="${f(rowH * s)}" fill="${hl ? "rgba(255,209,102,.16)" : i % 2 ? "#18202f" : "#141b28"}"/>`);
    if (show.rowLabels) out.push(`<text x="${f(X(0) - 10)}" y="${f(Y(ry + rowH / 2) + 5)}" class="lbl" text-anchor="end">y=${f(ry)}</text>`);
  });
  // sites
  if (show.sites) {
    const n = Math.round((W - siteX0) / siteW);
    for (let k = 0; k <= n; k++) {
      const x = siteX0 + k * siteW;
      out.push(`<line x1="${f(X(x))}" y1="${f(Y(0))}" x2="${f(X(x))}" y2="${f(Y(H))}" stroke="rgba(160,180,210,.16)" stroke-width="1"/>`);
      if (show.siteNumbers !== false && (n <= 16 || k % 2 === 0)) out.push(`<text x="${f(X(x))}" y="${f(Y(0) + 18)}" class="tick" text-anchor="middle">${f(x)}</text>`);
    }
  }
  // chip outline
  out.push(`<rect x="${f(X(0))}" y="${f(Y(H))}" width="${f(W * s)}" height="${f(H * s)}" fill="none" stroke="#8aa0c2" stroke-width="2"/>`);
  const width = Object.fromEntries(d.cells.map((c) => [c.id, c.width]));
  const height = Object.fromEntries(d.cells.map((c) => [c.id, c.height ?? rowH]));
  // reference ghosts
  const ref = state.reference && state.reference.placement;
  if (show.ref && ref) {
    for (const c of d.cells) {
      const p = ref[c.id];
      if (!p) continue;
      out.push(`<rect x="${f(X(p.x))}" y="${f(Y(p.y + height[c.id]))}" width="${f(width[c.id] * s)}" height="${f(height[c.id] * s)}" fill="none" stroke="${cellColor(c.id)}" stroke-dasharray="5 4" stroke-width="1.5" opacity=".7"/>`);
    }
  }
  if (state.ghost) {
    for (const [id, p] of Object.entries(state.ghost)) {
      if (!width[id]) continue;
      out.push(`<rect x="${f(X(p.x))}" y="${f(Y(p.y + height[id]))}" width="${f(width[id] * s)}" height="${f(height[id] * s)}" fill="${cellColor(id)}" opacity=".18" stroke="${cellColor(id)}" stroke-dasharray="3 3"/>`);
    }
  }
  // cells (stacked duplicates offset slightly so the eye sees there are several)
  const stackCount = {};
  const P = state.placement || {};
  const stackTotal = {};
  for (const c of d.cells) {
    const q = P[c.id];
    if (q && Number.isFinite(q.x) && Number.isFinite(q.y)) stackTotal[`${q.x},${q.y}`] = (stackTotal[`${q.x},${q.y}`] || 0) + 1;
  }
  const late = []; // labels drawn after every cell so a stacked cell never hides another's name
  d.cells.forEach((c, i) => {
    const p = P[c.id];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    const key = `${p.x},${p.y}`;
    const k = (stackCount[key] = (stackCount[key] || 0) + 1) - 1;
    const off = state.spreadStack === false ? 0 : k * 7;
    const w = width[c.id] * s;
    const h = height[c.id] * s;
    const x = X(p.x) + off;
    const y = Y(p.y + height[c.id]) + off;
    const bad = state.bad && state.bad[c.id];
    const focus = !state.focus || state.focus.includes(c.id);
    const op = state.opacity && state.opacity[c.id] !== undefined ? state.opacity[c.id] : focus ? 1 : 0.35;
    const fixed = state.fixedMode !== false && d.fixed && d.fixed[c.id];
    const sel = state.selected === c.id;
    out.push(`<g class="cell" data-id="${esc(c.id)}" opacity="${op}" tabindex="${opts.interactive ? 0 : -1}" role="${opts.interactive ? "button" : "img"}" aria-label="单元 ${esc(c.id)}，x=${f(p.x)}，y=${f(p.y)}${bad ? "，违规：" + bad.join("、") : ""}">`);
    out.push(`<rect x="${f(x + 1.5)}" y="${f(y + 1.5)}" width="${f(Math.max(1, w - 3))}" height="${f(Math.max(1, h - 3))}" rx="4" fill="${cellColor(c.id, i)}" fill-opacity="${k ? 0.55 : 0.82}" stroke="${bad ? "#ff5d5d" : sel ? "#ffffff" : "rgba(0,0,0,.35)"}" stroke-width="${bad || sel ? 3 : 1}" ${bad ? 'stroke-dasharray="7 4"' : ""}/>`);
    if (fixed) out.push(`<rect x="${f(x + 1.5)}" y="${f(y + 1.5)}" width="${f(w - 3)}" height="${f(h - 3)}" rx="4" fill="url(#hatch)"/>`);
    const fs = Math.max(14, Math.min(28, s * 0.55));
    const nStack = stackTotal[key] || 1;
    const lx = nStack > 1 ? X(p.x) + (w * (k + 0.5)) / nStack : x + w / 2;
    late.push(`<text x="${f(lx)}" y="${f(y + h / 2 + fs * 0.35)}" class="cid" font-size="${f(fs)}" opacity="${op}" text-anchor="middle" aria-hidden="true">${esc(c.id)}${fixed ? " 🔒" : ""}</text>`);
    if (bad) out.push(`<text x="${f(x + w - 6)}" y="${f(y + 16)}" class="badge" text-anchor="end">✗</text>`);
    if (state.labels && state.labels[c.id]) out.push(`<text x="${f(x + w / 2)}" y="${f(y - 8)}" class="clabel" text-anchor="middle">${esc(state.labels[c.id])}</text>`);
    if (show.anchors) out.push(`<circle cx="${f(X(p.x) + off)}" cy="${f(Y(p.y) + off)}" r="6" fill="#ffd166" stroke="#0b0f17" stroke-width="2"/>`);
    out.push(`</g>`);
  });
  out.push(...late);
  // overhang shading (outside the chip)
  for (const c of d.cells) {
    const p = P[c.id];
    if (!p || !show.overhang) continue;
    const x0 = p.x;
    const x1 = p.x + width[c.id];
    if (x1 > W) out.push(`<rect x="${f(X(W))}" y="${f(Y(p.y + height[c.id]))}" width="${f((x1 - W) * s)}" height="${f(height[c.id] * s)}" fill="rgba(255,93,93,.35)" stroke="#ff5d5d"/>`);
    if (x0 < 0) out.push(`<rect x="${f(X(x0))}" y="${f(Y(p.y + height[c.id]))}" width="${f(-x0 * s)}" height="${f(height[c.id] * s)}" fill="rgba(255,93,93,.35)" stroke="#ff5d5d"/>`);
  }
  // intervals [x, x+w) drawn under the row
  for (const id of show.intervals || []) {
    const p = P[id];
    if (!p) continue;
    const yy = Y(p.y) + 28 + (show.intervals.indexOf(id) % 2) * 16;
    const xa = X(p.x);
    const xb = X(p.x + width[id]);
    out.push(`<g class="interval"><line x1="${f(xa)}" y1="${f(yy)}" x2="${f(xb)}" y2="${f(yy)}" stroke="${cellColor(id)}" stroke-width="4"/>
<circle cx="${f(xa)}" cy="${f(yy)}" r="6" fill="${cellColor(id)}"/><circle cx="${f(xb)}" cy="${f(yy)}" r="6" fill="#0b0f17" stroke="${cellColor(id)}" stroke-width="3"/>
<text x="${f((xa + xb) / 2)}" y="${f(yy + 22)}" class="lbl" text-anchor="middle">[${f(p.x)}, ${f(p.x + width[id])})</text></g>`);
  }
  // displacement arrows (Manhattan: horizontal then vertical)
  if (show.arrows && ref) {
    for (const c of d.cells) {
      const a = ref[c.id];
      const b = P[c.id];
      if (!a || !b || (a.x === b.x && a.y === b.y)) continue;
      // run the path a little off the cell centre so it never strikes through the cell name
      const cx0 = X(a.x + width[c.id] / 2) + (a.x === b.x ? s * 0.28 : 0);
      const cy0 = Y(a.y + height[c.id] / 2) + s * 0.32;
      const cx1 = X(b.x + width[c.id] / 2) + s * 0.28;
      const cy1 = Y(b.y + height[c.id] / 2) + (a.y === b.y ? s * 0.32 : 0);
      out.push(`<path d="M${f(cx0)},${f(cy0)} L${f(cx1)},${f(cy0)} L${f(cx1)},${f(cy1)}" fill="none" stroke="#ffd166" stroke-width="3" marker-end="url(#arr)"/>`);
      const dd = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      // distance label sits on the path, 70% of the way along, on a dark pill so it stays legible
      const horiz = Math.abs(cx1 - cx0) >= Math.abs(cy1 - cy0);
      const lx = horiz ? cx0 + (cx1 - cx0) * 0.7 : cx1 + 20;
      const ly = horiz ? cy0 + 26 : cy0 + (cy1 - cy0) * 0.7 + 7;
      out.push(`<rect x="${f(lx - 15)}" y="${f(ly - 19)}" width="30" height="26" rx="13" fill="#0b0f17" opacity=".85"/><text x="${f(lx)}" y="${f(ly)}" class="arrlbl" font-size="20" text-anchor="middle">${f(dd)}</text>`);
    }
  }
  // nets: centre pins + bounding boxes
  const nets = show.nets === "all" ? d.nets.map((_, i) => i) : show.nets || [];
  for (const ni of nets) {
    const net = d.nets[ni];
    if (!net) continue;
    const pts = net.filter((id) => P[id]).map((id) => [P[id].x + width[id] / 2, P[id].y + height[id] / 2]);
    if (pts.length < 1) continue;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    const col = state.netColor || "#ffd166";
    out.push(`<rect x="${f(X(x0))}" y="${f(Y(y1))}" width="${f(Math.max(2, (x1 - x0) * s))}" height="${f(Math.max(2, (y1 - y0) * s))}" fill="rgba(255,209,102,.08)" stroke="${col}" stroke-width="2.5" stroke-dasharray="8 5"/>`);
    if (show.netLabel) out.push(`<text x="${f(X(x1) + 6)}" y="${f(Y(y1) + 16)}" class="arrlbl">${f(x1 - x0)} + ${f(y1 - y0)} = ${f(x1 - x0 + y1 - y0)}</text>`);
  }
  if (show.centres) {
    for (const c of d.cells) {
      const p = P[c.id];
      if (!p) continue;
      out.push(`<circle cx="${f(X(p.x + width[c.id] / 2))}" cy="${f(Y(p.y + height[c.id] / 2))}" r="5" fill="#fff" stroke="#0b0f17" stroke-width="2"/>`);
    }
  }
  for (const a of state.annotations || []) {
    if (a.type === "text") out.push(`<text x="${f(X(a.x))}" y="${f(Y(a.y))}" class="${a.cls || "note"}" text-anchor="${a.anchor || "middle"}">${esc(a.text)}</text>`);
    if (a.type === "box") out.push(`<rect x="${f(X(a.x0))}" y="${f(Y(a.y1))}" width="${f((a.x1 - a.x0) * s)}" height="${f((a.y1 - a.y0) * s)}" fill="${a.fill || "none"}" stroke="${a.stroke || "#ff5d5d"}" stroke-width="3" ${a.dash ? 'stroke-dasharray="6 4"' : ""}/>`);
  }
  out.push(`<style>.lbl{fill:#9fb0cc;font:15px system-ui,"Noto Sans SC",sans-serif}.tick{fill:#6f7f9c;font:13px system-ui,sans-serif}.cid{fill:#0b0f17;font-weight:700;font-family:system-ui,"Noto Sans SC",sans-serif}.badge{fill:#ff5d5d;font:700 18px system-ui}.clabel{fill:#e6edf7;font:600 15px system-ui,"Noto Sans SC",sans-serif}.arrlbl{fill:#ffd166;font:700 16px system-ui,sans-serif}.note{fill:#e6edf7;font:600 18px system-ui,"Noto Sans SC",sans-serif}.warn{fill:#ff8a8a;font:700 18px system-ui,"Noto Sans SC",sans-serif}</style>`);
  out.push(`</svg>`);
  return out.join("");
}

// Inverse mapping for pointer input (lab only).
export function toWorld(fr, svgX, svgY) {
  const X0 = fr.X(0);
  const Y0 = fr.Y(0);
  return { x: (svgX - X0) / fr.s, y: (Y0 - svgY) / fr.s };
}

export function badMap(report) {
  const bad = {};
  for (const v of report.violations || []) for (const id of v.cells) (bad[id] = bad[id] || []).push(v.code);
  for (const e of report.errors || []) for (const id of e.cells) (bad[id] = bad[id] || []).push(e.code);
  return bad;
}
