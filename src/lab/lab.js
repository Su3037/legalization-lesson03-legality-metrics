// Live checker (实验台). Uses the same core and board as the film.
import { checkPlacement, traceCheck, normalizeDesign, PSEUDOCODE, clonePlacement, message } from "../core/legality.js";
import { greedySnap, overlapRemove, abacusLite, abacus } from "../core/repair.js";
import { renderBoard, frame, toWorld, badMap } from "../board/board.js";

const $ = (s, r = document) => r.querySelector(s);
const RULE_ZH = { ROW: "在行上", SITE: "对齐站点", BOUNDS: "整个单元在芯片内", FIXED: "固定单元未动", OVERLAP: "同行不重叠", VALID: "输入完整有效", VERDICT: "结论", METRICS: "指标" };

export async function startLab(root, { base = "../" } = {}) {
  const raw = await (await fetch(base + "data/fixtures/tiny_legal.json")).json();
  const cases = (await (await fetch(base + "data/fixtures/cases.json")).json()).cases;
  let optimum = null;
  try {
    optimum = await (await fetch(base + "data/cpsat-results.json")).json();
  } catch {}
  const design = normalizeDesign(raw);
  const seed = cases.overlap_seed.placement;
  const presets = {
    overlap: { zh: "重叠（开场布局）", p: seed },
    legal: { zh: "合法（示意布局）", p: cases.illustrative_golden.placement },
    offsite: { zh: "没对齐站点", p: { ...cases.illustrative_golden.placement, F: { x: 10.5, y: 0 } } },
    offrow: { zh: "不在行上", p: { ...cases.illustrative_golden.placement, C: { x: 0, y: 3 } } },
    outside: { zh: "出界（锚点在内）", p: { ...cases.illustrative_golden.placement, B: { x: 11, y: 0 } } },
    fixedmoved: { zh: "固定单元被移动", p: { ...cases.illustrative_golden.placement, D: { x: 6, y: 4 } } },
    float: { zh: "全局布局小数坐标", p: raw.starter_float },
  };
  const S = {
    placement: clonePlacement(seed),
    reference: { name: "开场重叠布局", placement: clonePlacement(seed) },
    fixedMode: true,
    snap: false,
    selected: "A",
    history: [],
    trace: null,
    step: -1,
    selectedViolation: null,
    snapshot: null,
    filmPartial: null,
  };

  root.innerHTML = `
  <div class="lab-grid">
    <section class="lab-board" aria-label="布局画板">
      <div class="toolbar" role="toolbar" aria-label="布局操作">
        <label>预设 <select id="preset">${Object.entries(presets).map(([k, v]) => `<option value="${k}">${v.zh}</option>`).join("")}</select></label>
        <label class="sw"><input type="checkbox" id="snap"> 吸附到站点和行</label>
        <label class="sw"><input type="checkbox" id="fixed" checked> D 是固定单元</label>
        <button id="undo" type="button">撤销</button>
        <button id="reset" type="button">重置</button>
      </div>
      <div id="film-note" class="note-box" hidden></div>
      <div id="board" class="board-wrap"></div>
      <div class="edit-row">
        <label>单元 <select id="cell">${design.cells.map((c) => `<option>${c.id}</option>`).join("")}</select></label>
        <label>x <input id="ex" type="number" step="0.5" inputmode="decimal"></label>
        <label>y <input id="ey" type="number" step="1" inputmode="decimal"></label>
        <button id="apply" type="button">设置坐标</button>
        <span class="hint">拖动单元，或选中后用方向键移动（吸附关闭时 ← → 每次 0.5）</span>
      </div>
      <div class="refbar">位移参考：<b id="refname"></b>（不会因为编辑而改变）
        <button id="setref" type="button" class="ghost">把当前布局设为新参考…</button>
      </div>
    </section>
    <section class="lab-side">
      <div class="verdict" id="verdict" aria-live="polite"></div>
      <div class="metrics" id="metrics"></div>
      <div class="check-buttons">
        <button id="checkall" type="button" class="primary">完整检查</button>
        <button id="stepbtn" type="button">逐步检查 ▶</button>
        <button id="stepreset" type="button" class="ghost">清除逐步</button>
      </div>
      <p class="partial" id="partial"></p>
      <ol class="pseudo" id="pseudo">${PSEUDOCODE.map((l, i) => `<li data-line="${i}"><code>${l.replace(/</g, "&lt;")}</code></li>`).join("")}</ol>
      <h3>违规清单</h3>
      <ul class="vlist" id="vlist"></ul>
      <h3>修复演示（结果交给检查器重新判定）</h3>
      <div class="repairs">
        <button type="button" data-repair="snap">只取整</button>
        <button type="button" data-repair="overlap">行内依次推开</button>
        <button type="button" data-repair="lite">Abacus-lite（教师 helper）</button>
        <button type="button" data-repair="abacus">Abacus（小型忠实实现）</button>
        <button type="button" data-repair="optimum">精确最优之一（CP-SAT）</button>
      </div>
      <div id="delta" class="delta"></div>
      <details><summary>导入 / 导出 JSON</summary>
        <textarea id="io" rows="6" spellcheck="false" aria-label="布局 JSON"></textarea>
        <div><button id="export" type="button">导出当前</button> <button id="import" type="button">导入并检查</button></div>
        <p class="hint">导入时不吸附、不修正：即使固定单元的坐标不对，也会照原样交给检查器。</p>
      </details>
    </section>
  </div>`;

  const fr = frame(design, { w: 960, h: 520 });
  const push = () => {
    S.history.push(JSON.stringify({ p: S.placement, f: S.fixedMode }));
    if (S.history.length > 200) S.history.shift();
  };
  const report = () => checkPlacement(design, S.placement, { fixedMode: S.fixedMode, reference: S.reference });

  function draw() {
    const r = report();
    const step = S.trace && S.step >= 0 ? S.trace.steps[S.step] : null;
    const bad = step ? {} : badMap(r);
    let focus = null;
    let show = { anchors: true, ref: true, arrows: true, intervals: [] };
    if (step && step.cells.length) {
      focus = step.cells;
      if (!step.pass) for (const id of step.cells) bad[id] = [step.rule];
      if (step.rule === "OVERLAP") show.intervals = step.cells;
    }
    if (S.selectedViolation) {
      focus = S.selectedViolation.cells;
      if (S.selectedViolation.code === "OVERLAP") show.intervals = S.selectedViolation.cells;
    }
    if (S.selectedViolation && S.selectedViolation.code === "BOUNDS") show.overhang = true;
    $("#board", root).innerHTML = renderBoard(
      { design, placement: S.placement, reference: S.reference, fixedMode: S.fixedMode, selected: S.selected, bad, focus, show, ghost: S.snapshot },
      { frame: fr, interactive: true, label: "实验台布局：可拖动单元" },
    );
    // verdict: complete report vs. partial step-through progress are shown separately
    const v = $("#verdict", root);
    const cls = r.verdict === "legal" ? "ok" : r.verdict === "invalid" ? "inv" : "bad";
    const word = r.verdict === "legal" ? "✓ 合法" : r.verdict === "invalid" ? "⚠ 输入无效" : "✗ 不合法";
    v.className = "verdict " + cls;
    v.innerHTML = `<span class="big">${word}</span><span class="sub">完整检查：${r.verdict === "invalid" ? r.errors.length + " 个输入错误" : r.violations.length + " 条违规"}${r.first ? "；第一条：" + (r.first.message || r.first.code) + "（" + r.first.cells.join("、") + "）" : ""}</span>`;
    const m = r.metrics;
    $("#metrics", root).innerHTML = m
      ? `<table><tr><th>位移总和</th><td>${m.displacement.total}</td><th>平均</th><td>${m.displacement.average}</td><th>最大</th><td>${m.displacement.max}</td></tr>
         <tr><th>HPWL（中心）</th><td>${m.hpwl.total}</td><td colspan="4" class="hint">${r.legal ? "合法布局的分数" : "诊断数值：布局不合法，分数不能当成绩"}</td></tr></table>`
      : `<p class="hint">输入无效时不计算指标。</p>`;
    $("#refname", root).textContent = S.reference.name;
    $("#vlist", root).innerHTML = (r.verdict === "invalid" ? r.errors : r.violations)
      .map((x, i) => `<li><button type="button" data-v="${i}" class="vbtn ${S.selectedViolation && S.selectedViolation.i === i ? "on" : ""}"><b>${x.code}</b> ${x.cells.join("、")}：${x.message}${x.evidence ? " <small>" + evidenceText(x) + "</small>" : ""}</button></li>`)
      .join("") || "<li class=ok>没有违规</li>";
    root.querySelectorAll(".vbtn").forEach((b) =>
      b.addEventListener("click", () => {
        const i = +b.dataset.v;
        const list = r.verdict === "invalid" ? r.errors : r.violations;
        S.selectedViolation = S.selectedViolation && S.selectedViolation.i === i ? null : { ...list[i], i };
        S.step = -1;
        S.trace = null;
        draw();
      }),
    );
    root.querySelectorAll("#pseudo li").forEach((li) => li.classList.toggle("on", !!step && +li.dataset.line === step.line));
    $("#partial", root).textContent = step
      ? `逐步检查 ${S.step + 1} / ${S.trace.steps.length}：${RULE_ZH[step.rule]} ${step.cells.join("、")} → ${step.pass ? "通过" : "不通过"}（这是检查过程中的一步，不是最终结论）`
      : S.filmPartial || "";
    const c = S.placement[S.selected];
    if (c && document.activeElement !== $("#ex", root)) $("#ex", root).value = c.x;
    if (c && document.activeElement !== $("#ey", root)) $("#ey", root).value = c.y;
    $("#cell", root).value = S.selected;
    $("#fixed", root).checked = S.fixedMode;
    $("#snap", root).checked = S.snap;
    bindDrag();
  }

  function evidenceText(x) {
    const e = x.evidence;
    if (x.code === "OVERLAP") return `第 y=${e.row} 行：[${e.interval_a}) 与 [${e.interval_b}) 共用 ${e.shared}`;
    if (x.code === "SITE") return `x=${e.x}，离站点格线 ${(+e.sites % 1).toFixed(2)} 格`;
    if (x.code === "ROW") return `y=${e.y}，行底边是 ${e.rows.join("、")}`;
    if (x.code === "BOUNDS") return `占 x ${e.extent[0]}–${e.extent[2]}、y ${e.extent[1]}–${e.extent[3]}，芯片 0–${e.chip[2]} × 0–${e.chip[3]}`;
    if (x.code === "FIXED") return `现在 (${e.at})，应在 (${e.locked})`;
    return "";
  }

  function move(id, x, y, record = true) {
    if (S.fixedMode && design.fixed[id]) {
      flash(`D 是固定单元，拖动被锁定。要研究“固定单元被移动”，可以关掉固定约束，或用预设/导入。`);
      return;
    }
    if (record) push();
    if (S.snap) {
      const p = greedySnap({ ...design, fixed: {} }, { ...S.placement, [id]: { x, y } }, { fixedMode: false })[id];
      x = p.x;
      y = p.y;
    }
    S.placement = { ...S.placement, [id]: { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 } };
    S.trace = null;
    S.step = -1;
    S.snapshot = null;
    S.filmPartial = null;
    draw();
  }
  const flash = (t) => {
    const n = $("#film-note", root);
    n.hidden = false;
    n.textContent = t;
    clearTimeout(flash.t);
    flash.t = setTimeout(() => (n.hidden = true), 6000);
  };

  let drag = null;
  function bindDrag() {
    const svg = $("#board svg", root);
    svg.querySelectorAll(".cell").forEach((g) => {
      g.addEventListener("pointerdown", (ev) => {
        const id = g.dataset.id;
        S.selected = id;
        const pt = svgPoint(svg, ev);
        const w = toWorld(fr, pt.x, pt.y);
        drag = { id, dx: w.x - S.placement[id].x, dy: w.y - S.placement[id].y, started: false };
        g.setPointerCapture(ev.pointerId);
      });
      g.addEventListener("pointermove", (ev) => {
        if (!drag) return;
        const pt = svgPoint(svg, ev);
        const w = toWorld(fr, pt.x, pt.y);
        const x = Math.round((w.x - drag.dx) * 2) / 2;
        const y = Math.round((w.y - drag.dy) * 2) / 2;
        const p = S.placement[drag.id];
        if (x !== p.x || y !== p.y) {
          move(drag.id, x, y, !drag.started);
          drag.started = true;
        }
      });
      g.addEventListener("pointerup", () => {
        drag = null;
        draw();
      });
      g.addEventListener("keydown", (ev) => keyMove(ev, g.dataset.id));
      g.addEventListener("focus", () => {
        if (S.selected !== g.dataset.id) {
          S.selected = g.dataset.id;
          $("#cell", root).value = S.selected;
        }
      });
    });
  }
  function keyMove(ev, id) {
    const p = S.placement[id];
    const dx = S.snap ? 1 : 0.5;
    const map = { ArrowLeft: [-dx, 0], ArrowRight: [dx, 0], ArrowUp: [0, S.snap ? 2 : 1], ArrowDown: [0, S.snap ? -2 : -1] };
    if (!map[ev.key]) return;
    ev.preventDefault();
    move(id, p.x + map[ev.key][0], p.y + map[ev.key][1]);
    const g = $(`#board .cell[data-id="${id}"]`, root);
    if (g) g.focus();
  }
  const svgPoint = (svg, ev) => {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };

  $("#preset", root).addEventListener("change", (e) => {
    push();
    S.placement = clonePlacement(presets[e.target.value].p);
    S.trace = null;
    S.step = -1;
    S.selectedViolation = null;
    S.snapshot = null;
    draw();
  });
  $("#snap", root).addEventListener("change", (e) => ((S.snap = e.target.checked), draw()));
  $("#fixed", root).addEventListener("change", (e) => {
    push();
    S.fixedMode = e.target.checked;
    S.trace = null;
    S.step = -1;
    flash(S.fixedMode ? "固定约束打开：D 必须在 (8, 4)，FIXED 规则生效。" : "固定约束关闭：D 变成普通单元，问题变了，检查器不再检查 FIXED。");
    draw();
  });
  $("#undo", root).addEventListener("click", () => {
    const h = S.history.pop();
    if (!h) return;
    const o = JSON.parse(h);
    S.placement = o.p;
    S.fixedMode = o.f;
    S.trace = null;
    S.step = -1;
    draw();
  });
  $("#reset", root).addEventListener("click", () => {
    push();
    S.placement = clonePlacement(seed);
    S.fixedMode = true;
    S.trace = null;
    S.step = -1;
    S.selectedViolation = null;
    S.snapshot = null;
    draw();
  });
  $("#cell", root).addEventListener("change", (e) => ((S.selected = e.target.value), draw()));
  $("#apply", root).addEventListener("click", () => {
    const x = parseFloat($("#ex", root).value);
    const y = parseFloat($("#ey", root).value);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return flash("请输入数字坐标。");
    move(S.selected, x, y);
  });
  $("#setref", root).addEventListener("click", () => {
    const name = prompt("给新参考布局起个名字（位移会从它重新算起）：", "我的布局");
    if (!name) return;
    S.reference = { name, placement: clonePlacement(S.placement) };
    draw();
  });
  $("#checkall", root).addEventListener("click", () => {
    S.trace = null;
    S.step = -1;
    S.filmPartial = null;
    draw();
    $("#verdict", root).focus?.();
  });
  $("#stepbtn", root).addEventListener("click", () => {
    if (!S.trace) {
      S.trace = traceCheck(design, S.placement, { fixedMode: S.fixedMode, reference: S.reference });
      S.step = 0;
    } else S.step = Math.min(S.trace.steps.length - 1, S.step + 1);
    S.selectedViolation = null;
    draw();
  });
  $("#stepreset", root).addEventListener("click", () => ((S.trace = null), (S.step = -1), draw()));
  root.querySelectorAll("[data-repair]").forEach((b) =>
    b.addEventListener("click", () => {
      const before = report();
      const k = b.dataset.repair;
      let p;
      try {
        if (k === "optimum") {
          const inst = optimum && optimum.instances.find((i) => i.name.includes("overlap seed") && i.fixed_D === S.fixedMode);
          if (!inst || S.reference.name !== "开场重叠布局") return flash("精确最优只为“开场重叠布局”这个参考预先算好（见 oracles/cpsat）。");
          p = inst.optimum_placement;
        } else p = { snap: greedySnap, overlap: overlapRemove, lite: abacusLite, abacus }[k](design, S.placement, { fixedMode: S.fixedMode });
      } catch (e) {
        return flash("这个方法在当前布局上失败了：" + e.message);
      }
      push();
      S.snapshot = clonePlacement(S.placement);
      S.placement = clonePlacement(p);
      S.trace = null;
      S.step = -1;
      draw();
      const after = report();
      const dm = (r) => (r.metrics ? r.metrics : null);
      $("#delta", root).innerHTML = `<table><tr><th></th><th>修复前</th><th>修复后</th></tr>
        <tr><th>结论</th><td>${before.verdict}</td><td>${after.verdict}</td></tr>
        <tr><th>位移（相对“${S.reference.name}”）</th><td>${dm(before) ? dm(before).displacement.total : "—"}</td><td>${dm(after) ? dm(after).displacement.total : "—"}</td></tr>
        <tr><th>最大位移</th><td>${dm(before) ? dm(before).displacement.max : "—"}</td><td>${dm(after) ? dm(after).displacement.max : "—"}</td></tr>
        <tr><th>HPWL</th><td>${dm(before) ? dm(before).hpwl.total : "—"}</td><td>${dm(after) ? dm(after).hpwl.total : "—"}</td></tr></table>
        <p class="hint">虚线色块是修复前的位置。${k === "snap" ? "只取整：对齐了，却可能仍然重叠。" : ""}${k === "optimum" ? "最少位移的合法布局不止一种，这只是其中之一。" : ""}</p>`;
    }),
  );
  $("#export", root).addEventListener("click", () => ($("#io", root).value = JSON.stringify({ placement: S.placement, fixedMode: S.fixedMode, reference: S.reference }, null, 1)));
  $("#import", root).addEventListener("click", () => {
    let o;
    try {
      o = JSON.parse($("#io", root).value);
    } catch (e) {
      return flash("不是合法的 JSON：" + e.message);
    }
    push();
    S.placement = o.placement || o;
    if (typeof o.fixedMode === "boolean") S.fixedMode = o.fixedMode;
    if (o.reference && o.reference.placement) S.reference = o.reference;
    S.trace = null;
    S.step = -1;
    draw();
  });

  // Film-to-lab transfer: #state=<base64 JSON> carries the exact frame state.
  const m = location.hash.match(/state=([^&]+)/);
  if (m) {
    try {
      const st = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
      S.placement = st.placement;
      S.fixedMode = st.fixedMode !== false;
      if (st.reference) S.reference = st.reference;
      if (st.selectedViolation) S.selectedViolation = st.selectedViolation;
      if (st.snapshot) S.snapshot = st.snapshot;
      S.filmPartial = st.partial
        ? `来自影片 ${st.time}s：影片当时只检查到“${st.partial}”。上面的结论是实验台对同一布局重新做的完整检查。`
        : `来自影片 ${st.time}s 的画面：坐标、固定约束和位移参考都原样带过来了。`;
      const n = $("#film-note", root);
      n.hidden = false;
      n.textContent = S.filmPartial;
    } catch (e) {
      flash("影片状态无法读取：" + e.message);
    }
  }
  draw();
  return { state: S, draw, message };
}
