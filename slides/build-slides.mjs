// Build the 12-slide deck: slides/out/deck.html (1920x1080 pages), slide PNGs, notes.json and
// deck.pdf (printed by Playwright). Figures come from the same checker/board code as the site.
// node slides/build-slides.mjs   (needs the global or local playwright; see scripts/pw.mjs)
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { figures } from "../scripts/figures.mjs";
import { chromium } from "../scripts/pw.mjs";

const F = figures();
const OUT = "slides/out";
mkdirSync(OUT, { recursive: true });
const fig = (k) => F[k].svg;
const tag = (k) => `<div class="chk ${F[k].ok ? "ok" : "bad"}">检查器：${F[k].verdict}</div>`;

const SLIDES = [
  { title: "合法吗？", body: `<div class="hero"><h1>合法吗？</h1><p class="sub">布局合法性检查与指标</p><p class="meta">Module 03 · Legality Metrics</p></div>${fig("seed")}`, cls: "title",
    notes: "开场：全局布局给了坐标，但 A、B、C 挤在同一个位置。今天先学判断合不合法，再学怎么比较两个合法结果。" },
  { title: "行、站点、坐标、区间", body: `${fig("terms")}<ul><li>三行，行高 2，底边 y = 0、2、4</li><li>站点宽 1；坐标是左下角</li><li>A 在 (4, 2)，占 [4, 6)：左闭右开</li></ul>`,
    notes: "先统一术语。区间左闭右开是后面判断相接与重叠的关键。" },
  { title: "规则一、二：在行上，对齐站点", body: `<div class="two"><div>${fig("offrow")}${tag("offrow")}</div><div>${fig("offsite")}${tag("offsite")}</div></div><p>底边必须是某一行的底边；x − x0 必须是站点宽的整数倍，差半格也不行。</p>`,
    notes: "规则一看 y，规则二看 x。坐标先换成整数 DBU 再比较，非整数站点宽（如 0.19）也能精确判断。" },
  { title: "规则三：整个单元在芯片内", body: `${fig("outside")}${tag("outside")}<p>看整个矩形 x + w ≤ W，不只是左下角。</p>`,
    notes: "常见误区 I2：只检查锚点。D 宽 2 放在 x = 11，锚点在内，右边伸出一格。" },
  { title: "规则四：同行不重叠，相接可以", body: `<div class="two"><div>${fig("touch")}${tag("touch")}</div><div>${fig("overlap1")}${tag("overlap1")}</div></div><p>[a.x, a.x+a.w) 与 [b.x, b.x+b.w) 相交才算重叠。</p>`,
    notes: "常见误区 I3：把相接当重叠。用闭区间实现的检查器会把合法布局判错，这是 Python 练习里专门设的陷阱。" },
  { title: "规则五：固定单元不能动", body: `<div class="two"><div>${fig("fixed")}${tag("fixed")}</div><div>${fig("fixedOff")}${tag("fixedOff")}</div></div><p>同一张布局，固定约束开与关，结论不同。</p>`,
    notes: "固定声明是输入的一部分。实验台上可以切换开关亲手对比。" },
  { title: "检查器：先查输入，再列出全部违规", body: `<ol class="code"><li>输入不完整或数值非法 → 输入无效，停止</li><li>每个单元：ROW、SITE、BOUNDS、FIXED</li><li>同一行每一对：OVERLAP（左闭右开）</li><li>合法 ⇔ 没有任何记录</li></ol><p>开场布局：第一条错误是 A/B 重叠，完整清单有三条（A/B、A/C、B/C）。</p>`,
    notes: "输入无效和不合法是两回事：缺单元、未知单元、NaN 都不做几何检查，也不编造默认宽度。" },
  { title: "取整不等于合法", body: `${fig("snapped")}${tag("snapped")}<p>取整只解决了对齐，没有解决重叠。</p>`,
    notes: "常见误区 I1。greedy snap 后每个单元都在行上、对齐站点，但仍重叠。" },
  { title: "两个指标：位移与半周长线长", body: `<div class="two"><div>${fig("disp")}<p>位移 = Σ |Δx| + |Δy|，参考布局不变</p></div><div>${fig("hpwl")}<p>HPWL：单元中心的包围盒，宽 + 高</p></div></div>`,
    notes: "参考布局一旦定下就不能随编辑改变，否则会抹掉之前的位移（误区 I6）。HPWL 用中心，宽度不同的单元才公平。" },
  { title: "两种修复，两套代价；最优不止一个", body: `<div class="two"><div>${fig("orm")}<p>行内推开：位移 6，HPWL 32</p></div><div>${fig("lite")}<p>挪到上下两行：位移 4，HPWL 38</p></div></div><p>CP-SAT 精确最优：最少总位移 4，有 48 种摆法都能做到。</p>`,
    notes: "两个都合法；位移更小的线长更长。说“更好”之前先说比哪个指标。最少是 4 而且不唯一，所以挑战按状态判分（误区 I5、I7）。" },
  { title: "总和与最大值", body: `<div class="two"><div>${fig("jump")}<p>一步跳开：总 4，最大 4</p></div><div>${fig("shift")}<p>各让 2 格：总 8，最大 2</p></div></div><p>精确求解：总和最少 4（此时最大 4）；最大值最少 2（此时总和至少 6）。</p>`,
    notes: "总和与最大值不能同时最优，所以比赛和工具常常两个都报告。" },
  { title: "真实检查器还查什么；动手", body: `<div class="two"><div><ul><li>朝向与行匹配</li><li>限定区域、禁止放置区</li><li>单元间距、边缘规则</li><li>多行高单元</li></ul><p>gcd（461 单元）：在两边都检查的规则上，本课检查器与 OpenROAD <code>check_placement</code> 一致。</p></div><div><ul><li>实验台：拖动、逐步检查、修复对比</li><li>10 个挑战，按状态判分</li><li>Python 练习：PASS / INCOMPLETE / FAIL</li></ul><p class="url">su3037.github.io/legalization-lesson03-legality-metrics</p></div></div>`,
    notes: "误区 I8：玩具检查器通过不等于签核。最后把大家引向实验台和 Python 练习。" },
];

const css = `@page{size:1920px 1080px;margin:0}*{box-sizing:border-box}body{margin:0;background:#0b0f17;font-family:"Noto Sans SC","Noto Sans CJK SC","WenQuanYi Zen Hei",sans-serif;color:#e6edf7}
.slide{width:1920px;height:1080px;padding:70px 90px 80px;position:relative;page-break-after:always;overflow:hidden;background:#0e131c}
.slide h2{font-size:58px;margin:0 0 30px;border-left:10px solid #ffd166;padding-left:22px}
.slide p,.slide li{font-size:36px;line-height:1.5}.slide ul,.slide ol{margin:10px 0}
.slide svg{width:100%;height:auto;max-height:640px;background:#0b0f17;border-radius:12px;display:block}
.slide > div > svg{max-height:600px;width:auto;max-width:100%;margin:0 auto}
.two{display:grid;grid-template-columns:1fr 1fr;gap:40px}.two svg{max-height:440px;width:100%}
.chk{display:inline-block;font-size:28px;margin-top:10px;padding:4px 16px;border-radius:30px;border:2px solid}.chk.ok{color:#3ccf8e;border-color:#3ccf8e}.chk.bad{color:#ff6b6b;border-color:#ff6b6b}
.code li{font-family:"Noto Sans Mono",monospace;background:#151c29;margin:10px 0;padding:10px 18px;border-radius:8px;list-style-position:inside}
.pn{position:absolute;right:60px;bottom:30px;font-size:26px;color:#9fb0cc}.foot{position:absolute;left:90px;bottom:30px;font-size:22px;color:#6f7f9a}
.title{display:grid;grid-template-columns:1fr 1.2fr;gap:40px;align-items:center}.title h2{display:none}.hero h1{font-size:150px;color:#ffd166;margin:0}.hero .sub{font-size:54px}.hero .meta{font-size:32px;color:#9fb0cc}
.url{font-size:30px!important;color:#8ab4ff}`;
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>合法吗？课件</title><style>${css}</style></head><body>${SLIDES.map((s, i) => `<section class="slide ${s.cls || ""}" id="s${i + 1}"><h2>${s.title}</h2>${s.cls === "title" ? s.body : `<div>${s.body}</div>`}<div class="foot">合法吗？· Legality Metrics · CC BY 4.0</div><div class="pn">Module 03 · ${i + 1} / ${SLIDES.length}</div></section>`).join("")}</body></html>`;
writeFileSync(`${OUT}/deck.html`, html);
writeFileSync(`${OUT}/notes.json`, JSON.stringify(SLIDES.map((s, i) => ({ n: i + 1, title: s.title, notes: s.notes })), null, 1));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto("file://" + process.cwd() + `/${OUT}/deck.html`);
await page.evaluate(() => document.fonts.ready);
for (let i = 1; i <= SLIDES.length; i++) await page.locator(`#s${i}`).screenshot({ path: `${OUT}/slide-${String(i).padStart(2, "0")}.png` });
await page.pdf({ path: `${OUT}/legality-metrics-slides.pdf`, width: "1920px", height: "1080px", printBackground: true });
// overflow check: no slide content may spill past its frame
const overflow = await page.evaluate(() => [...document.querySelectorAll(".slide")].map((s, i) => [i + 1, s.scrollHeight > 1081 || s.scrollWidth > 1921]).filter((x) => x[1]).map((x) => x[0]));
await browser.close();
console.log(JSON.stringify({ slides: SLIDES.length, overflow }));
