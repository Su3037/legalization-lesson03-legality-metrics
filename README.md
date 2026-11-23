# 合法吗？布局合法性检查与指标 · Module 03 Legality Metrics

A standalone open lesson (Chinese first) for
[yongfu-li/eda-learning issue #35](https://github.com/yongfu-li/eda-learning/issues/35), upstream module
`module01-03-legality-metrics`: decide whether a standard-cell placement is legal (five rules), then
compare legal results by displacement and centre-pin HPWL.

**Site:** https://su3037.github.io/legalization-lesson03-legality-metrics/

The site follows the author's course house style (same as `placement-lab02-hpwl` and `learning-clustering`):
one page, warm paper and ink, numbered sections, dark cinema bands for the films and the lab, Newsreader /
Noto Serif SC / Noto Sans SC / JetBrains Mono (bundled, OFL).

| Section | What |
| --- | --- |
| 01 目标与问题 | outcomes; input / output / constraints / goal / assumptions / stop |
| 02 影片 | four films: **科普** 3:09 cut to *We Never (Remix)*; **精讲** 4:34 Kokoro narration + original score; **进阶** 3:23 captions + score; **实验演示** 1:54 narrated walkthrough recorded from the real lab. Chapters, transcript, “open this frame in the lab” |
| 03 讲解 | 03.1–03.9: terms, five rules, checker, rounding, metrics, conventions, repairs vs CP-SAT, sum vs max, real checkers; every figure checked by the same checker |
| 04 课件 | 12 slides with notes, PDF (`slides/out/legality-metrics-slides.pdf`) |
| 05 实验台 | live checker: drag/keyboard, step-through with pseudocode highlight, presets, fixed toggle, immutable reference, repairs vs CP-SAT optimum |
| 06 挑战 | 10 challenges, each targets one misconception, graded on state |
| 07 自测 | 8 self-check questions with explanations (the pre/post study form is on `/study/`) |
| 08 Python | starter / reference / 24 fixtures / `check.py` → PASS · INCOMPLETE · FAIL |
| 09 易错点 | eight misconceptions with checker counterexamples; limits of the lesson |
| 10 复现与来源 | reproduction, oracles, sources, music and voice credits |

Auxiliary pages: `/verify/` (gate table, voice and loudness, credits), `/listen/` (blind listening test, ready),
`/study/` (learner study, ready). The old URLs `/lesson/`, `/film/`, `/lab/`, `/challenges/`, `/slides/`,
`/python/` redirect to their sections.

## The checker

Spec: [`docs/checker-spec.md`](docs/checker-spec.md). Implementations: `src/core/legality.js` (browser)
and `python/legality_metrics/legality.py` (Python), identical on 3,000 random cases. Input is
validated first (missing/unknown/duplicate cells, non-finite values, bad sizes or rows → `invalid`);
then ROW, SITE, BOUNDS (whole rectangle), FIXED, OVERLAP (same row, half-open `[x, x+w)`, touching is
legal). Coordinates are compared as integer DBU, so a 0.19 site pitch is exact. The report has the
first failure **and** the full list, with evidence numbers; metrics are total/average/max
displacement from a named immutable reference and centre-pin HPWL.

## Independent oracles ([`docs/oracles.md`](docs/oracles.md))

* **CP-SAT** exact optimum: the opening overlap needs at least 4 units of displacement, reached by 48
  different placements; overlap removal 6, Abacus-lite 4, a faithful small Abacus 4; greedy snap is
  illegal. From the float start: optimum 5.4 vs 8.8 / 5.8 / 6.4.
* **OpenROAD `check_placement`** (2.0-12381): 18/18 mutants caught by both implementations (score 100%);
  OpenROAD agrees on every mutant it can express. On OpenROAD's `gcd` (461 cells) GP is illegal in
  both tools (identical 347-cell site set), DP is legal in both, three injected faults are found
  exactly by both.
* **Properties + differential fuzz**: fast-check and Hypothesis metamorphic properties; JS vs Python on
  3,000 random inputs, 0 mismatches.

## What did not pass or was not run

* **Voice:** the 精讲 and 实验演示 films are narrated by **Kokoro** (multi-lang v1.1, speaker 20, Apache-2.0),
  synthesized one whole paragraph per chapter with the course pronunciation lexicon. It does **not** pass the
  pre-registered objective screen (CER 4.3–5.0% on three ASR models vs the 3% gate); it ships because the author
  asked for narrated films, and the page, the verify page and every end card say it is synthetic. Captions and
  transcripts are the reference. The blind listening test page is ready as the upgrade path (needs ≥ 8 native
  listeners and a human reference). See [`docs/voice-casting.md`](docs/voice-casting.md).
* **Loudness:** true peak ≤ −1.5 dBTP on every film; integrated −17 to −18.6 LUFS, 1–2.6 dB under the −16 LUFS target
  (the score-only 进阶 film is −22 LUFS).
* **Learner study and animatic screening:** not run (needs real learners). Protocol and forms are ready:
  [`docs/learner-study.md`](docs/learner-study.md).
* **ICCAD 2017 evaluator:** unavailable (contest site blocked).
* **Lexicon** (`media/lexicon.zh.tsv`) awaits a native speaker's confirmation.
* English edition: not made (only after every gate passes).

## Reproduce

See [`docs/REPRODUCIBILITY.md`](docs/REPRODUCIBILITY.md). Quick start:

```bash
npm ci && pip install pytest hypothesis
npm test && python3 -m pytest -q tests/py && node tests/diff/fuzz.mjs
node scripts/build-site.mjs && python3 scripts/serve.py   # http://127.0.0.1:8803/legalization-lesson03-legality-metrics/
```

## Docs

[`checker-spec`](docs/checker-spec.md) · [`source-audit`](docs/source-audit.md) ·
[`oracles`](docs/oracles.md) · [`voice-casting`](docs/voice-casting.md) ·
[`learner-study`](docs/learner-study.md) · [`decision-log`](docs/decision-log.md) ·
[`REPRODUCIBILITY`](docs/REPRODUCIBILITY.md) · [`acceptance`](docs/acceptance.md) ·
[`teacher-feedback`](docs/teacher-feedback.md) · [`handoff-state`](docs/handoff-state.md) ·
[`submission-draft`](docs/submission-draft.md)

## Licence

Code MIT ([`LICENSE`](LICENSE)); content CC BY 4.0. Adapted from Yongfu Li's *eda-learning* (CC BY 4.0);
details and third-party notices in [`NOTICE.md`](NOTICE.md).
