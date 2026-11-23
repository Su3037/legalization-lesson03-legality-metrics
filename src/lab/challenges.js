// Challenges and the concept inventory. Placement tasks are graded on the actual state with the
// same checker; any placement that meets the stated goal is accepted.
import { checkPlacement, normalizeDesign, clonePlacement } from "../core/legality.js";
import { renderBoard, frame, toWorld, badMap } from "../board/board.js";

// ---- Concept inventory: one misconception per item (used as pre-test and post-test) ----
export const INVENTORY = [
  { id: "I1", misconception: "取整 = 合法", q: "全局布局的坐标四舍五入到最近的站点和行以后，这张布局：", options: ["一定合法", "一定对齐了站点和行，但仍可能重叠", "一定不合法", "只有 HPWL 会变"], answer: 1 },
  { id: "I2", misconception: "锚点在内 = 单元在内", q: "芯片宽 12。宽 2 的单元放在 x = 11（左下角在芯片内）。它：", options: ["在芯片内，合法", "右边伸出芯片 1 格，违反边界规则", "只要对齐站点就合法", "要看它在哪一行"], answer: 1 },
  { id: "I3", misconception: "相接 = 重叠", q: "同一行里，A 占 [0, 2)，B 从 x = 2 开始。A 和 B：", options: ["重叠了 1 个点，不合法", "只是相接，没有共用长度，不算重叠", "要看两者宽度是否相同", "要再插一个空站点才合法"], answer: 1 },
  { id: "I4", misconception: "不重叠 = 合法", q: "一张布局里没有任何两个单元重叠。可以断定它合法吗？", options: ["可以", "不可以：还要在行上、对齐站点、整个在芯片内、固定单元没动，而且输入完整", "可以，只要 HPWL 也小", "不可以，因为一定还有别的重叠"], answer: 1 },
  { id: "I5", misconception: "HPWL 更小就更好", q: "布局 P 的 HPWL 是 26 但有一处重叠；布局 Q 合法、HPWL 是 32。应该交哪一个？", options: ["P，线长更短", "Q：不合法的布局分数再好也不能用", "两个都行", "取两者平均"], answer: 1 },
  { id: "I6", misconception: "位移从上一步算", q: "参考布局里 B 在 x = 4。你先把 B 挪到 6，再挪到 8。相对参考布局，B 的位移是：", options: ["2（最后一步）", "4", "6（2 + 4）", "0（已经合法）"], answer: 1 },
  { id: "I7", misconception: "某个启发式的结果 = 最优且唯一", q: "开场布局里，Abacus-lite 修复后位移是 4。关于“最少位移”，下面哪句对？", options: ["4 一定不是最少", "精确求解器确认最少就是 4，而且有不止一种摆法能做到", "最少位移的布局只有这一种", "位移越少，HPWL 一定越小"], answer: 1 },
  { id: "I8", misconception: "玩具检查器 = 签核", q: "本课的检查器通过了，真实芯片上还可能有什么问题？", options: ["没有问题了", "朝向、限定区域与禁止放置区、单元间距、多行高单元等，本课没有检查", "只可能还有重叠", "只可能 HPWL 太大"], answer: 1 },
];

export async function loadWorld(base = "../") {
  const raw = await (await fetch(base + "data/fixtures/tiny_legal.json")).json();
  const cases = (await (await fetch(base + "data/fixtures/cases.json")).json()).cases;
  const trade = await (await fetch(base + "data/fixtures/tradeoff.json")).json();
  return { raw, cases, trade, design: normalizeDesign(raw) };
}

export function challengeList(W) {
  const G = W.cases.illustrative_golden.placement;
  const seed = W.cases.overlap_seed.placement;
  const REF = { name: "开场重叠布局", placement: seed };
  const rep = (p, o = {}) => checkPlacement(W.design, p, { reference: REF, ...o });
  return [
    {
      id: "c1", category: "诊断", difficulty: "入门", target: "I4", type: "multi",
      title: "这张布局错在哪？", goal: "找出全部违规，不多也不少。",
      placement: { ...G, F: { x: 10.5, y: 0 }, C: { x: 0, y: 3 } },
      options: ["ROW：C 不在行上", "SITE：F 没对齐站点", "OVERLAP：C 和 E 重叠", "BOUNDS：F 出界", "这张布局没有重叠，所以合法"],
      answer: [0, 1],
      hints: ["没有重叠，不代表合法。逐条规则看一遍。", "C 的 y = 3 不是行底边；F 的 x = 10.5 差半格。C 和 E 的矩形相交只是诊断，不算同行重叠。"],
      explain: "两条违规：C 不在行上，F 没对齐站点。没有任何同行重叠，但布局仍不合法。",
    },
    {
      id: "c2", category: "边界", difficulty: "入门", target: "I3", type: "place", movable: ["B"],
      title: "贴住，但不重叠", goal: "把 B 放在第 y = 0 行，紧贴 A 的右边（共用一条边，不共用长度），并让整张布局合法。",
      placement: { ...G, B: { x: 5, y: 0 } },
      grade: (p) => {
        const r = rep(p);
        const touch = p.B.y === p.A.y && p.B.x === p.A.x + 2;
        return { pass: r.legal && touch, msg: !r.legal ? "现在不合法：" + r.violations.map((v) => v.code).join("、") : touch ? "对：[0,2) 和 [2,4) 只是相接。" : "合法了，但 B 没有贴住 A 的右边。" };
      },
      hints: ["区间左边算、右边不算：A 占 [0, 2)。", "B 的 x 应该等于 A 的右端 2。"],
    },
    {
      id: "c3", category: "边界", difficulty: "练习", target: "I2", type: "place", movable: ["B"],
      title: "最右边能放哪？", goal: "在 y = 0 这一行，把 B 放到能合法放下的最右位置（F 在 10 不动）。",
      placement: { ...G, B: { x: 11, y: 0 } },
      grade: (p) => {
        const r = rep(p);
        const ok = r.legal && p.B.y === 0 && p.B.x === 8;
        return { pass: ok, msg: ok ? "对：B 占 [8, 10)，刚好贴住 F。x = 11 时左下角在芯片里，右边却出界。" : r.legal ? "合法，但还能再往右。" : "不合法：" + r.violations.map((v) => v.code + " " + v.cells.join("/")).join("；") };
      },
      hints: ["检查的是整个单元，不只是左下角。", "F 占 [10, 11)，B 宽 2，B 最多到 [8, 10)。"],
    },
    {
      id: "c4", category: "取整", difficulty: "练习", target: "I1", type: "place", snap: true,
      title: "取整以后还要做什么", goal: "从全局布局的小数坐标出发（已经帮你取整），把布局修到合法。D 固定。任何合法的摆法都算对。",
      placement: { A: { x: 4, y: 2 }, B: { x: 4, y: 2 }, C: { x: 5, y: 2 }, D: { x: 8, y: 4 }, E: { x: 0, y: 4 }, F: { x: 10, y: 0 } },
      reference: { name: "全局布局（小数）", key: "starter_float" },
      grade: (p) => {
        const r = rep(p);
        return { pass: r.legal, msg: r.legal ? "合法。取整只解决了对齐，重叠要靠挪动来解决。" : "还有 " + r.violations.length + " 条违规。" };
      },
      hints: ["取整之后 A、B、C 还挤在中间一行。", "把 B、C 挪到别的空位，比如别的行。"],
    },
    {
      id: "c5", category: "指标", difficulty: "练习", target: "I5", type: "place",
      title: "线长要短，但先要合法", goal: "得到一张合法布局，并且 HPWL ≤ 32（中心算法）。D 固定。",
      placement: seed,
      grade: (p) => {
        const r = rep(p);
        const h = r.metrics ? r.metrics.hpwl.total : Infinity;
        return { pass: r.legal && h <= 32, msg: !r.legal ? `HPWL 是 ${h}，但布局不合法，这个分数不算数。` : h <= 32 ? `合法，HPWL = ${h}。` : `合法，但 HPWL = ${h} > 32。` };
      },
      hints: ["开场布局 HPWL 就是 32，可惜不合法。", "让 A、B、C 在同一行依次排开，线长几乎不变。"],
    },
    {
      id: "c6", category: "指标", difficulty: "练习", target: "I6", type: "choice",
      title: "位移从哪里算", goal: "参考布局里 B 在 x = 4。你先把 B 挪到 6，再挪到 8（同一行）。相对参考布局，B 的位移是多少？",
      options: ["2", "4", "6", "0"], answer: 1,
      hints: ["参考布局在编辑过程中不变。", "只看最后的位置和参考位置：|8 − 4|。"],
      explain: "4。位移只比较“现在”和“固定的参考”，不累加中间每一步，也不会被某一步清零。",
    },
    {
      id: "c7", category: "修复", difficulty: "挑战", target: "I7", type: "place",
      title: "最少挪多少", goal: "D 固定。把开场布局修到合法，并且总位移 = 4。答案不止一种。",
      placement: seed,
      grade: (p) => {
        const r = rep(p);
        const d = r.metrics ? r.metrics.displacement.total : null;
        return { pass: r.legal && d === 4, msg: !r.legal ? "还不合法。" : d === 4 ? "位移 4，就是精确最优。CP-SAT 一共找到 48 种位移为 4 的合法摆法，你找到的是其中一种。" : `合法，位移 ${d}。精确最优是 4。` };
      },
      hints: ["三个单元叠在一起，至少要挪走两个。", "每个被挪走的单元至少挪 2：往旁边 2 格，或换到相邻一行。"],
    },
    {
      id: "c8", category: "指标", difficulty: "挑战", target: "I7", type: "place", world: "trade",
      title: "总和小，还是最大值小", goal: "X 掉在了 A 上。修到合法，并且让最大位移 ≤ 2。",
      grade: null,
      hints: ["让 X 一步跳开，最大位移是 4。", "让 A–D 各往右让 2 格，X 留在原地。"],
    },
    {
      id: "c9", category: "输入", difficulty: "入门", target: "I4", type: "choice",
      title: "空的也合法？", goal: "把下面这个布局交给检查器：{\"A\":{\"x\":0,\"y\":0}}（只有 A，其余 5 个单元没有坐标）。结论是：",
      options: ["合法：检查到的单元都没问题", "不合法：有违规", "输入无效：缺少单元坐标，几何检查不会运行", "合法，但位移是 0"], answer: 2,
      hints: ["一条违规都没“看到”，不代表合法。", "检查器先确认输入完整。"],
      explain: "输入无效（V_MISSING）。上游 Python 版本对空布局会返回“合法”，这里先校验输入，避免这种误判。",
    },
    {
      id: "c10", category: "签核", difficulty: "挑战", target: "I8", type: "multi",
      title: "真实检查器还会查什么", goal: "下面哪些是本课检查器不检查、但真实流程会关心的？",
      options: ["单元朝向是否与行一致（N / FS）", "限定区域和禁止放置区", "同一行两个单元重叠", "单元之间的最小间距、一格空隙", "跨多行的高单元"],
      answer: [0, 1, 3, 4],
      hints: ["重叠本课已经检查了。", "其余四项都写在“真实检查器还查什么”一节里。"],
      explain: "朝向、区域、间距与一格空隙、多行高单元都不在本课的五条规则里。注意：本课用的 OpenROAD 版本的 check_placement 也不查朝向。",
    },
  ];
}

const KEY = "legality-l03-progress-v1";
function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return null;
  }
}
function saveProgress(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

export async function startChallenges(root, { base = "../" } = {}) {
  const W = await loadWorld(base);
  const list = challengeList(W);
  let progress = loadProgress();
  const persistent = progress !== null;
  progress = progress || {};
  if (!persistent) root.insertAdjacentHTML("beforebegin", `<p class="note-box">浏览器不允许保存进度：进度只保留在这次打开的页面中。</p>`);
  // easy -> hard (stable), so the page always reads 入门 → 练习 → 挑战
  const RANK = { 入门: 0, 练习: 1, 挑战: 2 };
  list.sort((a, b) => RANK[a.difficulty] - RANK[b.difficulty]);
  root.innerHTML = list.map((c, i) => `<article class="challenge" id="${c.id}" aria-labelledby="${c.id}-t">
    <header><span class="tag">${c.category}</span><span class="tag diff">${c.difficulty}</span><span class="tag inv">概念 ${c.target}</span>
    <h3 id="${c.id}-t">${i + 1}. [${c.category}] ${c.title}</h3><span class="status" data-status></span></header>
    <p>${c.goal}</p><div class="body"></div>
    <div class="actions"><button type="button" class="primary" data-submit>提交</button><button type="button" data-hint>提示</button><button type="button" data-reset>重来</button><button type="button" class="ghost" data-solution>看解析</button></div>
    <div class="feedback" aria-live="polite"></div></article>`).join("");
  for (const c of list) mount(root.querySelector("#" + c.id), c, W);

  function mark(c, el, pass) {
    const p = progress[c.id] || { tries: 0 };
    p.tries++;
    if (pass) p.done = p.done || (p.viewedSolution ? "after-solution" : "independent");
    progress[c.id] = p;
    saveProgress(progress);
    status(c, el);
  }
  function status(c, el) {
    const p = progress[c.id] || {};
    el.querySelector("[data-status]").textContent = p.done === "independent" ? "✓ 独立完成" : p.done === "after-solution" ? "✓ 看过解析后完成" : p.tries ? `尝试 ${p.tries} 次` : "";
  }

  function mount(el, c, W) {
    const body = el.querySelector(".body");
    const fb = el.querySelector(".feedback");
    let hint = 0;
    status(c, el);
    el.querySelector("[data-hint]").addEventListener("click", () => {
      fb.innerHTML = `<p class="hint">提示 ${Math.min(hint + 1, 2)}：${c.hints[Math.min(hint, 1)]}</p>`;
      hint++;
    });
    el.querySelector("[data-solution]").addEventListener("click", () => {
      progress[c.id] = { ...(progress[c.id] || { tries: 0 }), viewedSolution: true };
      saveProgress(progress);
      fb.innerHTML = `<p>解析：${c.explain || c.hints.join(" ")}</p>`;
    });
    if (c.type === "choice" || c.type === "multi") {
      body.innerHTML = `<fieldset><legend class="sr">选项</legend>${c.options.map((o, i) => `<label class="opt"><input type="${c.type === "multi" ? "checkbox" : "radio"}" name="${c.id}" value="${i}"> ${o}</label>`).join("")}</fieldset>`;
      el.querySelector("[data-reset]").addEventListener("click", () => body.querySelectorAll("input").forEach((i) => (i.checked = false)));
      el.querySelector("[data-submit]").addEventListener("click", () => {
        const sel = [...body.querySelectorAll("input:checked")].map((i) => +i.value).sort();
        const want = c.type === "multi" ? c.answer.slice().sort() : [c.answer];
        const pass = JSON.stringify(sel) === JSON.stringify(want);
        mark(c, el, pass);
        fb.innerHTML = pass ? `<p class="ok">✓ ${c.explain}</p>` : `<p class="bad">还不对。${sel.length ? "" : "先选一个。"}可以再试，或看提示。</p>`;
      });
      return;
    }
    // placement task
    const trade = c.world === "trade";
    const design = trade ? normalizeDesign(W.trade) : W.design;
    const start = trade ? W.trade.reference : c.placement;
    const ref = trade
      ? { name: "X 掉落时", placement: W.trade.reference }
      : c.reference
        ? { name: c.reference.name, placement: W.raw[c.reference.key] }
        : { name: "开场重叠布局", placement: W.cases.overlap_seed.placement };
    const grade = trade
      ? (p) => {
          const r = checkPlacement(design, p, { reference: ref });
          const m = r.metrics && r.metrics.displacement;
          return { pass: r.legal && m.max <= 2, msg: !r.legal ? "还不合法。" : m.max <= 2 ? `最大位移 ${m.max}，总和 ${m.total}。总和比“跳开”的 4 大，但每个单元都只挪了一点。` : `合法，但最大位移是 ${m.max}（总和 ${m.total}）。` };
        }
      : c.grade;
    let P = clonePlacement(start);
    const fr = frame(design, { w: 760, h: trade ? 220 : 400 });
    const movable = c.movable || design.cells.map((x) => x.id).filter((id) => !design.fixed[id]);
    let sel = movable[0];
    body.innerHTML = `<div class="board-wrap small"></div><div class="edit-row"><label>单元 <select>${movable.map((m) => `<option>${m}</option>`).join("")}</select></label>
      <label>x <input type="number" step="${c.snap ? 1 : 0.5}" class="x"></label><label>y <input type="number" step="${trade ? 2 : 1}" class="y"></label><button type="button" class="set">设置</button>
      <span class="live"></span></div>`;
    const draw = () => {
      const r = checkPlacement(design, P, { reference: ref });
      body.querySelector(".board-wrap").innerHTML = renderBoard({ design, placement: P, reference: ref, selected: sel, bad: badMap(r), show: { ref: true, arrows: true } }, { frame: fr, interactive: true, label: c.title });
      const m = r.metrics;
      body.querySelector(".live").textContent = r.verdict === "legal" ? `合法 · 位移 ${m.displacement.total}（最大 ${m.displacement.max}）· HPWL ${m.hpwl.total}` : r.verdict === "invalid" ? "输入无效" : `不合法（${r.violations.length} 条）· 位移 ${m.displacement.total} · HPWL ${m.hpwl.total}（诊断）`;
      body.querySelector(".x").value = P[sel].x;
      body.querySelector(".y").value = P[sel].y;
      const svg = body.querySelector("svg");
      svg.querySelectorAll(".cell").forEach((g) => {
        const id = g.dataset.id;
        if (!movable.includes(id)) return;
        let drag = null;
        g.addEventListener("pointerdown", (ev) => {
          sel = id;
          body.querySelector("select").value = id;
          const pt = sp(svg, ev);
          const w = toWorld(fr, pt.x, pt.y);
          drag = { dx: w.x - P[id].x, dy: w.y - P[id].y };
          g.setPointerCapture(ev.pointerId);
        });
        g.addEventListener("pointermove", (ev) => {
          if (!drag) return;
          const w = toWorld(fr, sp(svg, ev).x, sp(svg, ev).y);
          let x = Math.round(w.x - drag.dx);
          let y = Math.round((w.y - drag.dy) / design.chip.rowH) * design.chip.rowH;
          if (x !== P[id].x || y !== P[id].y) {
            P = { ...P, [id]: { x, y } };
            draw();
          }
        });
        g.addEventListener("pointerup", () => (drag = null));
        g.addEventListener("keydown", (ev) => {
          const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, design.chip.rowH], ArrowDown: [0, -design.chip.rowH] }[ev.key];
          if (!k) return;
          ev.preventDefault();
          sel = id;
          P = { ...P, [id]: { x: P[id].x + k[0], y: P[id].y + k[1] } };
          draw();
          body.querySelector(`.cell[data-id="${id}"]`).focus();
        });
      });
    };
    const sp = (svg, ev) => {
      const pt = svg.createSVGPoint();
      pt.x = ev.clientX;
      pt.y = ev.clientY;
      return pt.matrixTransform(svg.getScreenCTM().inverse());
    };
    body.querySelector("select").addEventListener("change", (e) => ((sel = e.target.value), draw()));
    body.querySelector(".set").addEventListener("click", () => {
      const x = parseFloat(body.querySelector(".x").value);
      const y = parseFloat(body.querySelector(".y").value);
      if (Number.isFinite(x) && Number.isFinite(y)) P = { ...P, [sel]: { x, y } };
      draw();
    });
    el.querySelector("[data-reset]").addEventListener("click", () => ((P = clonePlacement(start)), draw()));
    el.querySelector("[data-submit]").addEventListener("click", () => {
      const g = grade(P);
      mark(c, el, g.pass);
      fb.innerHTML = `<p class="${g.pass ? "ok" : "bad"}">${g.pass ? "✓ " : ""}${g.msg}</p>`;
    });
    draw();
  }
}

// Inventory form (pre/post). Returns answers as a downloadable JSON; nothing is sent anywhere.
export function startInventory(root, { phase = "pre" } = {}) {
  root.innerHTML = `<form class="inventory">${INVENTORY.map((it, i) => `<fieldset><legend>${i + 1}. ${it.q}</legend>${it.options.map((o, k) => `<label class="opt"><input type="radio" name="${it.id}" value="${k}" required> ${o}</label>`).join("")}
    <label class="conf">把握：<select name="${it.id}-conf"><option value="">—</option><option>1 猜的</option><option>2</option><option>3</option><option>4</option><option>5 很确定</option></select></label></fieldset>`).join("")}
    <label>参与编号（不要写姓名）<input name="pid" required pattern="[A-Za-z0-9_-]{1,20}"></label>
    <button class="primary" type="submit">完成，下载我的答案</button></form><div class="result" aria-live="polite"></div>`;
  root.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const answers = INVENTORY.map((it) => ({ item: it.id, choice: +fd.get(it.id), correct: +fd.get(it.id) === it.answer, confidence: fd.get(it.id + "-conf") || null }));
    const out = { phase, pid: fd.get("pid"), at: new Date().toISOString(), score: answers.filter((a) => a.correct).length, answers };
    const blob = new Blob([JSON.stringify(out, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `inventory-${phase}-${out.pid}.json`;
    a.textContent = `下载 ${a.download}`;
    const res = root.querySelector(".result");
    res.innerHTML = `<p>得分 ${out.score} / ${INVENTORY.length}。请把文件发给研究组织者。</p>`;
    res.appendChild(a);
    a.click();
  });
}
