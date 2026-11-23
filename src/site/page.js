// One-page lesson bootstrap (house layout): film player, lab, challenges, quiz, slides, section nav.
import { startLab } from "../lab/lab.js";
import { startChallenges, INVENTORY } from "../lab/challenges.js";
import { buildWorld, stateAt } from "../film/timeline.js";

const E = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const ts = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const RULE = ["在行上", "对齐站点", "整个在芯片内", "同行不重叠", "固定单元不动"];

export async function startPage({ base = "./" } = {}) {
  const J = (u) => fetch(base + u).then((r) => {
    if (!r.ok) throw new Error(`${u} (HTTP ${r.status})`);
    return r.json();
  });
  wireNav();
  const labRoot = document.querySelector('[data-k="lab"]');
  const lab = await startLab(labRoot, { base });
  window.lab = lab;
  window.labReady = true;
  const chRoot = document.querySelector('[data-k="challenges"]');
  await startChallenges(chRoot, { base });
  window.challengesReady = true;
  quiz(document.querySelector('[data-k="quiz"]'));
  J("slides/out/notes.json").then((n) => slides(document.getElementById("slides"), n, base)).catch((e) => console.error(e));
  const [films, raw, cases, trade, cpsat, gcd] = await Promise.all([J("data/films/index.json"), J("data/fixtures/tiny_legal.json"), J("data/fixtures/cases.json"), J("data/fixtures/tradeoff.json"), J("data/cpsat-results.json"), J("data/gcd-placement.json")]);
  const W = buildWorld({ raw, cases: cases.cases, trade, cpsat, gcd });
  window.player = player(document.querySelector('[data-k="player"]'), { films, W, lab, base, J });
  await window.player.ready;
  if (location.hash && !location.hash.includes("state=")) document.querySelector(location.hash)?.scrollIntoView();
  if (location.hash.includes("state=")) document.getElementById("lab").scrollIntoView();
  window.appReady = true;
}

function wireNav() {
  const links = [...document.querySelectorAll(".module-nav a")];
  if (!("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (en.isIntersecting) links.forEach((a) => a.classList.toggle("active", a.hash === `#${en.target.id}`));
  }), { rootMargin: "-45% 0px -50% 0px" });
  links.forEach((a) => { const el = document.querySelector(a.hash); if (el) io.observe(el); });
}

function quiz(root) {
  // Options are shown in a fixed rotated order so the key is not always in the same place.
  root.innerHTML = INVENTORY.map((q, i) => {
    const order = q.options.map((_, k) => k).map((k, _, a) => a[(k + i * 3) % a.length]);
    return `<fieldset class="quiz-item" data-i="${i}"><legend><span>${String(i + 1).padStart(2, "0")}</span> ${E(q.q)}</legend>${order.map((k) => `<label><input type="radio" name="quiz-${i}" value="${k}"> ${E(q.options[k])}</label>`).join("")}<p class="fb" aria-live="polite"></p></fieldset>`;
  }).join("");
  root.addEventListener("change", (e) => {
    const fs = e.target.closest(".quiz-item");
    if (!fs) return;
    const q = INVENTORY[+fs.dataset.i];
    const ok = +e.target.value === q.answer;
    const fb = fs.querySelector(".fb");
    fb.className = `fb ${ok ? "ok" : "bad"}`;
    fb.textContent = `${ok ? "✓ 对。" : "✗ 再想想。"}${q.why}`;
  });
}

function slides(root, notes, base) {
  let i = 0;
  const img = root.querySelector(".slide-img");
  const show = () => {
    const n = notes[i];
    img.src = `${base}slides/out/slide-${String(n.n).padStart(2, "0")}.png`;
    img.alt = `第 ${n.n} 页：${n.title}`;
    root.querySelector(".slide-notes-text").textContent = n.notes;
    root.querySelector(".slide-page").textContent = `p${n.n} / ${notes.length} · ${n.title}`;
  };
  root.querySelector('[data-a="prev"]').addEventListener("click", () => { i = Math.max(0, i - 1); show(); });
  root.querySelector('[data-a="next"]').addEventListener("click", () => { i = Math.min(notes.length - 1, i + 1); show(); });
  show();
}

function player(root, { films, W, lab, base, J }) {
  root.innerHTML = `
  <div class="film-cards" role="tablist" aria-label="影片">${films.map((f, i) => `<button type="button" role="tab" class="film-card" data-film="${f.id}" aria-selected="${i === 0}">
    <span class="num">${String(i + 1).padStart(2, "0")} · ${E(f.label)}</span><span class="t">${E(f.title)}</span><span class="dur">${ts(f.duration)} · ${E(f.audio)}</span></button>`).join("")}</div>
  <p class="film-why" data-k="why"></p>
  <div class="player">
    <div class="video-wrap"><video id="v" data-k="video" controls preload="metadata" playsinline></video></div>
    <p class="video-error" data-k="err" hidden>这部影片没能载入。可以从下面的链接下载 MP4，或阅读文字稿。</p>
    <div class="player-tools">
      <button type="button" class="btn primary" id="to-lab" data-a="try">在实验台打开这一帧</button>
      <span id="to-lab-msg" class="muted small" aria-live="polite"></span>
      <span class="frame-info" data-k="info"></span>
    </div>
    <div class="film-nav"><nav class="chapters" data-k="chapters" aria-label="章节"></nav>
      <details class="transcript" data-k="transcript"><summary>文字稿</summary><div></div></details></div>
    <p class="small muted" data-k="dl"></p>
  </div>`;
  const $ = (k) => root.querySelector(`[data-k="${k}"]`);
  const video = $("video");
  const cache = {};
  let cur = null;
  async function load(id) {
    const f = films.find((x) => x.id === id);
    cache[id] ??= J(f.clock);
    const clock = await cache[id];
    cur = { f, clock };
    root.querySelectorAll(".film-card").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.film === id)));
    $("why").textContent = f.why;
    $("err").hidden = true;
    video.poster = base + f.poster;
    video.innerHTML = `<source src="${base + f.video}" type="video/mp4"><track kind="subtitles" srclang="zh" label="中文字幕" src="${base + f.vtt}"><track kind="chapters" srclang="zh" src="${base + f.chapters}" default>`;
    video.querySelector("source").addEventListener("error", () => { $("err").hidden = false; });
    video.load();
    // The picture already carries burned-in captions; keep the native track off unless the viewer turns it on.
    const quiet = () => { for (const tr of video.textTracks) if (tr.kind === "subtitles") tr.mode = "disabled"; };
    quiet();
    video.addEventListener("loadedmetadata", quiet, { once: true });
    root.querySelector('[data-a="try"]').hidden = f.kind === "walk";
    $("chapters").innerHTML = `<h3>章节</h3><ol>${clock.cues.map((c) => `<li><button type="button" data-seek="${c.start}" data-cue="${c.start}">${ts(c.start)} · ${E(c.title)}</button></li>`).join("")}</ol>`;
    $("transcript").querySelector("div").innerHTML = clock.cues.map((c) => `<h4><button type="button" class="link" data-seek="${c.start}">${ts(c.start)}</button> ${E(c.title)}</h4><p>${c.captions.map((x) => E(x.lines.join(""))).join(" ")}</p>`).join("");
    $("dl").innerHTML = `下载：<a href="${base + f.video}" download>MP4</a> · <a href="${base + f.vtt}" download>字幕 WebVTT</a> · <a href="${base + f.chapters}" download>章节</a>${f.credit ? ` · ${E(f.credit)}` : ""}`;
    root.querySelector("#to-lab-msg").textContent = "";
    update();
  }
  function update() {
    if (!cur) return;
    const t = video.currentTime || 0;
    let on = cur.clock.cues[0];
    for (const c of cur.clock.cues) if (c.start <= t) on = c;
    root.querySelectorAll(".chapters button").forEach((b) => b.classList.toggle("on", +b.dataset.cue === on.start));
    $("info").textContent = `${cur.f.label} · ${t.toFixed(1)} s · ${on.title}`;
  }
  ["timeupdate", "seeked", "loadedmetadata", "pause"].forEach((ev) => video.addEventListener(ev, update));
  root.addEventListener("click", (e) => {
    const card = e.target.closest(".film-card");
    if (card) return void load(card.dataset.film);
    const b = e.target.closest("[data-seek]");
    if (b) { video.currentTime = +b.dataset.seek + 0.001; update(); return; }
    if (e.target.closest('[data-a="try"]')) {
      video.pause();
      const t = video.currentTime;
      const s = stateAt(W, cur.clock, t);
      const msg = root.querySelector("#to-lab-msg");
      if (!s.board || !s.board.placement || s.design !== W.design) {
        msg.textContent = "这一帧不是 6 单元的课堂布局（标题、真实芯片或单独的一行示例），换一个时刻再试。";
        return;
      }
      const st = { time: t.toFixed(1), film: cur.f.label, placement: s.board.placement, fixedMode: s.board.fixedMode !== false };
      if (s.board.reference) st.reference = { name: s.board.reference.name, placement: s.board.reference.placement };
      if (s.panel && s.panel.kind === "rules" && s.panel.upto < 5) st.partial = RULE.slice(0, s.panel.upto).join("、");
      lab.loadFilmState(st);
      msg.textContent = "已在实验台打开。";
      document.getElementById("lab").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
  });
  const ready = load(films[0].id);
  return { video, load, ready, current: () => cur };
}
