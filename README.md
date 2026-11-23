# 合法吗？布局合法性检查与指标 · Module 03 Legality Metrics

A standalone open lesson (Chinese first) for
[yongfu-li/eda-learning issue #35](https://github.com/yongfu-li/eda-learning/issues/35), upstream module
`module01-03-legality-metrics`: decide whether a standard-cell placement is legal (five rules), then
compare legal results by displacement and centre-pin HPWL.

**Site:** https://su3037.github.io/legalization-lesson03-legality-metrics/

| Part | Where |
| --- | --- |
| Lesson (11 sections, every figure checked by the same checker) | `/lesson/` |
| Film, 6:14, 15 chapters, **silent with burned-in captions** (see below) + clean cut with WebVTT; 32 s sample | `/film/`, `media/renders/` |
| Live checker: drag/keyboard editing, step-through with pseudocode-line highlight, presets, fixed toggle, immutable displacement reference, repairs vs. CP-SAT optimum, open any film frame in the lab | `/lab/` |
| 10 challenges (each targets one misconception, graded on state, many answers accepted) + 8-item concept inventory (pre/post) | `/challenges/` |
| 12 slides with page numbers and notes, PDF | `/slides/`, `slides/out/legality-metrics-slides.pdf` |
| Python exercise: starter / reference / 24 fixtures / `check.py` → PASS · INCOMPLETE · FAIL | `/python/`, `python/exercise/` |
| Verification, gate table, credits | `/verify/`, `docs/acceptance.md` |
| Blind listening test and learner-study pages (ready, not yet run) | `/listen/`, `/study/` |

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

* **Voice:** no open voice reachable here passed the objective screen (best: Kokoro, CER 4.3–5.0% vs
  the 3% gate), so the film ships silent with captions, as the brief requires. Newer candidates need
  Hugging Face (blocked here) or a paid key. The blind listening test page is ready but has not been
  run (needs ≥ 8 native listeners and a human reference recording). See
  [`docs/voice-casting.md`](docs/voice-casting.md).
* **Learner study and animatic screening:** not run (needs real learners). Protocol and forms are ready:
  [`docs/learner-study.md`](docs/learner-study.md).
* **ICCAD 2017 evaluator:** unavailable (contest site blocked).
* **Lexicon** (`media/lexicon.zh.tsv`) awaits a native speaker's confirmation; it matters once there is
  a voice.
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
