// Build-time figures for the lesson and slides: the same renderBoard + checker as the lab and film,
// so every picture is a checked state, not a drawing.
import { readFileSync } from "node:fs";
import { renderBoard, frame, badMap } from "../src/board/board.js";
import { normalizeDesign, checkPlacement } from "../src/core/legality.js";
import { overlapRemove, abacusLite } from "../src/core/repair.js";

const J = (p) => JSON.parse(readFileSync(new URL("../" + p, import.meta.url)));
const raw = J("data/fixtures/tiny_legal.json");
const cases = J("data/fixtures/cases.json").cases;
const tradeRaw = J("data/fixtures/tradeoff.json");
const design = normalizeDesign(raw);
const trade = normalizeDesign(tradeRaw);
const gold = cases.illustrative_golden.placement;
const seed = cases.overlap_seed.placement;

function fig(d, placement, extra = {}, caption = "", { check = true, fixedMode = true, vb = { w: 960, h: 470 } } = {}) {
  const report = check ? checkPlacement(d, placement, { fixedMode }) : null;
  const st = { design: d, placement, fixedMode, bad: report ? badMap(report) : undefined, ...extra };
  const verdict = report ? (report.verdict === "legal" ? "合法" : report.verdict === "illegal" ? "不合法：" + report.violations.map((v) => `${v.code} ${v.cells.join("/")}`).join("，") : "输入无效") : "";
  const label = `${caption}${verdict ? "（检查器：" + verdict + "）" : ""}`;
  const svg = renderBoard(st, { frame: frame(d, vb), label });
  return { svg, caption, verdict, ok: report ? report.verdict === "legal" : null };
}

export function figures() {
  const orm = overlapRemove(design, seed);
  const lite = abacusLite(design, seed);
  return {
    terms: fig(design, { ...gold, A: { x: 4, y: 2 } }, { focus: ["A"], labels: { A: "(4, 2)" }, show: { anchors: true, intervals: ["A"], rowLabels: true } }, "三行（底边 y = 0、2、4），每格站点宽 1；A 的坐标 (4, 2) 是左下角，占 [4, 6)。", { check: false }),
    seed: fig(design, seed, { highlightRow: 2 }, "开场布局：A、B、C 三个单元都在 (4, 2)。"),
    gold: fig(design, gold, {}, "一张合法布局：五条规则同时成立。"),
    offrow: fig(design, { ...gold, C: { x: 0, y: 3 } }, { show: { anchors: true } }, "规则一：C 的底边在 y = 3，不在任何一行的底边上。"),
    offsite: fig(design, { ...gold, F: { x: 10.5, y: 0 } }, { show: { anchors: true } }, "规则二：F 在 x = 10.5，差半格没有对齐站点。"),
    outside: fig(design, { ...gold, D: { x: 11, y: 4 } }, { show: { anchors: true, overhang: true } }, "规则三：D 宽 2 放在 x = 11，左下角在芯片里，右边多出去 1 格（固定约束关闭）。", { fixedMode: false }),
    touch: fig(design, gold, { focus: ["A", "B"], show: { intervals: ["A", "B"] } }, "规则四：A 占 [0, 2)，B 占 [2, 4)，只是相接，没有共用长度，合法。"),
    overlap1: fig(design, { ...gold, B: { x: 1, y: 0 } }, { focus: ["A", "B"], show: { intervals: ["A", "B"] } }, "规则四：B 往左挪一格到 x = 1，与 A 共用 [1, 2)，这才是重叠。"),
    fixed: fig(design, { ...gold, D: { x: 6, y: 4 } }, {}, "规则五：D 被声明为固定在 (8, 4)，挪到 (6, 4) 的空地上也违规。"),
    fixedOff: fig(design, { ...gold, D: { x: 6, y: 4 } }, {}, "同一张布局，关掉固定约束以后，检查器判为合法。", { fixedMode: false }),
    snapped: fig(design, cases.greedy_snap_float.placement, { show: { anchors: true }, highlightRow: 2 }, "把全局布局的小数坐标四舍五入：每个单元都对齐了站点、落在行上，但 A、B、C 仍然重叠。"),
    disp: fig(design, orm, { reference: { name: "开场重叠布局", placement: seed }, show: { arrows: true, ref: true } }, "位移：每个单元离参考位置的 |Δx| + |Δy|，再求和。B 挪 2，C 挪 4，总和 6。"),
    hpwl: fig(design, lite, { show: { centres: true, nets: [4], netLabel: true } }, "半周长线长（HPWL）：线网 {A, B, C, D} 的单元中心框出最小矩形，宽 + 高。"),
    orm: fig(design, orm, { reference: { name: "开场重叠布局", placement: seed }, show: { arrows: true } }, "办法一（行内依次推开）：合法，位移 6，HPWL 32。"),
    lite: fig(design, lite, { reference: { name: "开场重叠布局", placement: seed }, show: { arrows: true } }, "办法二（挪到上下两行，Abacus-lite）：合法，位移 4，HPWL 38。"),
    jump: fig(trade, tradeRaw.jump, { reference: { name: "X 掉落时", placement: tradeRaw.reference }, show: { arrows: true, ref: true } }, "X 一步跳到右边：总位移 4，最大位移 4。", { vb: { w: 960, h: 260 } }),
    shift: fig(trade, tradeRaw.shift, { reference: { name: "X 掉落时", placement: tradeRaw.reference }, show: { arrows: true, ref: true } }, "四个小单元各让 2 格：总位移 8，最大位移 2。", { vb: { w: 960, h: 260 } }),
  };
}

export function figureHtml(key, F = figures()) {
  const g = F[key];
  if (!g) throw new Error("unknown figure " + key);
  const tag = g.ok === null ? "" : `<span class="tag ${g.ok ? "ok" : "bad"}">检查器：${g.verdict}</span>`;
  return `<figure class="board-wrap small">${g.svg}<figcaption>${g.caption} ${tag}</figcaption></figure>`;
}
