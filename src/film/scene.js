// Scene composition for one film frame: header, shared board, side panel, caption.
import { renderBoard, frame, badMap, cellColor } from "../board/board.js";
import { PSEUDOCODE } from "../core/legality.js";

const RULES = [
  ["ROW", "在行上", "底边落在某一行的底边"],
  ["SITE", "对齐站点", "x − x0 是站点宽的整数倍"],
  ["BOUNDS", "整个在芯片内", "看整个矩形，不只看左下角"],
  ["OVERLAP", "同行不重叠", "[x, x+w) 左闭右开，相接可以"],
  ["FIXED", "固定单元不动", "只在声明固定时检查"],
];

export function renderFrame(s, opts = {}) {
  const parts = [];
  parts.push(`<header class="f-head"><span class="f-mod">Module 03 · Legality Metrics</span><span class="f-ch">${String(s.chapter).padStart(2, "0")} · ${s.title}</span></header>`);
  let boardSvg = "";
  if (s.gcd) boardSvg = gcdSvg(opts.gcd);
  else if (s.board && s.board.placement) {
    const st = { ...s.board, design: s.design, bad: s.report ? badMap(s.report) : s.board.bad, fixedMode: s.board.fixedMode };
    const fr = frame(s.design, { w: 1180, h: s.design.chip.rows.length === 1 ? 420 : 700 });
    boardSvg = renderBoard(st, { frame: fr, label: s.title });
  } else boardSvg = realChecksSvg(s.panel.stage);
  parts.push(`<main class="f-main"><div class="f-board">${boardSvg}${verdictBadge(s)}</div><aside class="f-panel">${panel(s)}</aside></main>`);
  if (opts.captions !== false && s.caption) parts.push(`<div class="f-cap">${s.caption.map((l) => `<div>${esc(l)}</div>`).join("")}</div>`);
  return parts.join("");
}

const esc = (v) => String(v).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

function verdictBadge(s) {
  if (!s.report) return "";
  const r = s.report;
  const ok = r.verdict === "legal";
  return `<div class="f-verdict ${ok ? "ok" : "bad"}">${ok ? "✓ 合法" : "✗ 不合法"}<small>${ok ? "五条规则全部成立" : r.violations.map((v) => `${v.code} ${v.cells.join("/")}`).slice(0, 3).join(" · ") + (r.violations.length > 3 ? " …" : "")}</small></div>`;
}

function panel(s) {
  const p = s.panel;
  switch (p.kind) {
    case "question":
      return `<div class="big-q">${p.text}</div><p class="muted">${p.sub}</p><p class="muted">芯片 12 × 6 · 3 行 · 6 个单元</p>`;
    case "terms":
      return `<h2>先认清楚</h2><dl class="terms">${p.items.map(([k, v, on]) => `<div class="${on ? "on" : "off"}"><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
    case "rules":
      return `<h2>合法的五条规则</h2><ol class="rules">${RULES.slice(0, 5).map(([code, zh, how], i) => {
        const n = i + 1;
        const vis = n <= p.upto;
        const off = code === "FIXED" && p.fixedOff;
        return `<li class="${vis ? "" : "hidden"} ${n === p.hl ? "hl" : ""} ${off ? "off" : ""}"><b>${zh}</b><span>${how}${off ? "（已关闭）" : ""}</span></li>`;
      }).join("")}</ol>`;
    case "checker": {
      const r = p.report;
      return `<h2>完整的检查器</h2><ol class="pseudo-f">${PSEUDOCODE.slice(0, 10).map((l, i) => `<li class="${(p.phase === 1 && i === 1) || (p.phase >= 2 && (i === 7 || i === 8)) ? "hl" : ""}"><code>${esc(l)}</code></li>`).join("")}</ol>
      ${p.phase >= 3 ? `<div class="vl"><div>第一条：<b>OVERLAP A/B</b></div><div>完整清单：${r.violations.map((v) => v.cells.join("/")).join("、")}</div></div>` : ""}`;
    }
    case "snap":
      return `<h2>取整 ≠ 合法</h2><table class="mt"><tr><th></th><th>对齐</th><th>在行上</th><th>不重叠</th></tr>
        <tr class="${p.stage >= 0 ? "" : "hidden"}"><th>小数坐标</th><td>✗</td><td>✗</td><td>?</td></tr>
        <tr class="${p.stage >= 1 ? "" : "hidden"}"><th>取整以后</th><td>✓</td><td>✓</td><td class="${p.stage >= 2 ? "bad" : ""}">${p.stage >= 2 ? "✗ A/B" : "?"}</td></tr></table>`;
    case "disp": {
      const rows = p.placement ? ["A", "B", "C", "D", "E", "F"].map((id) => [id, 0]) : [];
      return `<h2>位移</h2><div class="formula">Σ |x − x<sub>参考</sub>| + |y − y<sub>参考</sub>|</div>
        <p class="ref ${p.lock ? "locked" : ""}">参考：开场重叠布局 ${p.lock ? "🔒 不会被编辑改写" : ""}</p>
        ${p.sum ? `<table class="mt"><tr><th>B</th><td>|6 − 4| = 2</td></tr><tr><th>C</th><td>|8 − 4| = 4</td></tr><tr><th>其他</th><td>0</td></tr><tr class="tot"><th>总和</th><td>6</td></tr></table>` : ""}${rows.length ? "" : ""}`;
    }
    case "hpwl":
      return `<h2>半周长线长 HPWL</h2><p>线网 {A, B, C, D}，取每个单元的<b>中心</b></p>
        ${p.stage >= 2 ? `<div class="formula">宽 + 高 = ${p.nw} + ${p.nh} = ${p.nw + p.nh}</div><p class="muted">全部 6 个线网加起来：${p.value}</p>` : ""}
        <p class="muted">用左下角会让宽度不同的单元吃亏或占便宜</p>`;
    case "compare":
      return `<h2>两种修法</h2><table class="mt"><tr><th></th><th>位移</th><th>HPWL</th><th>合法</th></tr>
        <tr class="${p.showOrm ? "" : "hidden"}"><th>行内依次推开</th><td>6</td><td>32</td><td>✓</td></tr>
        <tr class="${p.showLite ? "" : "hidden"}"><th>挪到上下两行</th><td>4</td><td>38</td><td>✓</td></tr></table>
        ${p.verdict ? `<p class="takeaway">位移更小，线长反而更长：要说清楚比的是哪个指标。</p>` : ""}`;
    case "optimum":
      return `<h2>和精确最优比</h2>${p.stage >= 1 ? `<p>CP-SAT 求最少总位移：<b>${p.opt.min_total}</b></p>` : ""}
        ${p.stage >= 2 ? `<p>位移为 4 的合法摆法：<b>${p.n} 种</b>（正在展示第 ${p.k + 1} 种）</p>` : ""}
        ${p.stage >= 3 ? `<table class="mt"><tr><th colspan="2">从小数坐标出发</th></tr><tr><th>精确最优</th><td>${p.optF.min_total}</td></tr>
          ${Object.entries(p.optF.heuristics).filter(([, h]) => h.legal).map(([k, h]) => `<tr><th>${k.replace(" (teacher)", "（教师）").replace(" (Spindler 2008, small)", "")}</th><td>${h.total}（多 ${h.gap}）</td></tr>`).join("")}</table>` : ""}`;
    case "trade":
      return `<h2>总和与最大值</h2><table class="mt"><tr><th></th><th>总和</th><th>平均</th><th>最大</th></tr>
        <tr class="${p.jump ? "" : "hidden"}"><th>X 跳开</th><td>4</td><td>0.8</td><td class="bad">4</td></tr>
        <tr class="${p.shift ? "" : "hidden"}"><th>A–D 各让 2</th><td class="bad">8</td><td>1.6</td><td>2</td></tr></table>
        ${p.table ? `<p class="takeaway">总和小的那个，最大值反而大。</p>` : ""}`;
    case "real":
      return `<h2>真实检查器还查什么</h2><ul class="real">
        <li class="${p.stage >= 2 ? "" : "dim"}">朝向与行一致（N / FS），电源轨对齐</li>
        <li class="${p.stage >= 3 ? "" : "dim"}">限定区域、禁止放置区</li>
        <li class="${p.stage >= 3 ? "" : "dim"}">最小间距、一格空隙、填充</li>
        <li class="${p.stage >= 3 ? "" : "dim"}">多行高单元</li></ul>
        ${p.stage >= 4 ? `<p class="takeaway">gcd（Nangate45，461 个单元）：在两边都检查的规则上，OpenROAD 与本课检查器结论一致。</p>` : ""}`;
    case "recap":
      return `<h2>记住三句话</h2><ol class="recap">
        <li class="${p.n >= 1 ? "" : "hidden"}">合法 = 五条规则同时成立</li>
        <li class="${p.n >= 2 ? "" : "hidden"}">位移和线长是合法以后才比的分数</li>
        <li class="${p.n >= 3 ? "" : "hidden"}">分数再好，也救不了不合法的布局</li></ol>
        ${p.n >= 4 ? `<p class="takeaway">下一步：实验台 → 亲手修合法</p>` : ""}`;
  }
  return "";
}

function realChecksSvg(stage) {
  // Two rows with orientations N / FS and a cell in the wrong orientation; a fence box.
  return `<svg viewBox="0 0 1180 700" class="board" role="img" aria-label="真实检查项示意">
  <rect x="80" y="160" width="1020" height="140" fill="#141b28"/><rect x="80" y="300" width="1020" height="140" fill="#18202f"/>
  <text x="70" y="235" fill="#9fb0cc" font-size="22" text-anchor="end">N</text><text x="70" y="375" fill="#9fb0cc" font-size="22" text-anchor="end">FS</text>
  <line x1="80" y1="160" x2="1100" y2="160" stroke="#e66" stroke-width="4"/><text x="1110" y="166" fill="#e66" font-size="18">VDD</text>
  <line x1="80" y1="300" x2="1100" y2="300" stroke="#59f" stroke-width="4"/><text x="1110" y="306" fill="#59f" font-size="18">VSS</text>
  <line x1="80" y1="440" x2="1100" y2="440" stroke="#e66" stroke-width="4"/>
  ${stage >= 2 ? `<rect x="200" y="170" width="150" height="120" rx="6" fill="#5b9dff"/><text x="275" y="240" font-size="24" text-anchor="middle">N ✓</text>
  <rect x="420" y="310" width="150" height="120" rx="6" fill="#f2a93b" stroke="#ff5d5d" stroke-width="4" stroke-dasharray="8 5"/><text x="495" y="380" font-size="24" text-anchor="middle">N ✗</text>
  <text x="495" y="470" fill="#ff8a8a" font-size="20" text-anchor="middle">FS 行里放了 N 朝向</text>` : ""}
  ${stage >= 3 ? `<rect x="700" y="170" width="330" height="260" fill="rgba(167,139,250,.12)" stroke="#a78bfa" stroke-width="3" stroke-dasharray="10 6"/><text x="865" y="520" fill="#c4b5fd" font-size="20" text-anchor="middle">限定区域 / 禁止放置区</text>` : ""}
  </svg>`;
}

function gcdSvg(g) {
  if (!g) return "";
  const W = 1180;
  const H = 700;
  const sx = (W - 80) / g.sites;
  const sy = (H - 120) / g.rows;
  const cells = g.dp
    .map(([x, y, w, o, fx]) => `<rect x="${(40 + x * sx).toFixed(1)}" y="${(H - 60 - (y + 1) * sy).toFixed(1)}" width="${Math.max(1, w * sx - 0.6).toFixed(1)}" height="${(sy - 1).toFixed(1)}" fill="${fx ? "#6b7280" : o === "N" || o === "FN" ? "#5b9dff" : "#3cc48f"}"/>`)
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="board" role="img" aria-label="gcd 详细布局之后的真实布局">
  <rect x="40" y="60" width="${W - 80}" height="${H - 120}" fill="#141b28" stroke="#8aa0c2"/>${cells}
  <text x="40" y="40" fill="#e6edf7" font-size="22">gcd · Nangate45 · 详细布局之后 · 57 行 × 422 站点</text>
  <text x="40" y="${H - 20}" fill="#9fb0cc" font-size="18">蓝：N/FN 朝向　绿：FS/S 朝向　灰：固定的 tap 单元</text></svg>`;
}

export { cellColor };
