# Acceptance gates

Status as of 2026-11-23. "Pass" means the check ran and met its bar; "Fail" means it ran and did not;
"Not run" means it needs people or access this build did not have. No gate was lowered.

| Gate | Bar | Status | Evidence |
| --- | --- | --- | --- |
| Fixture rows reproduced | Teacher's seed / golden / overlap removal / Abacus-lite / snap numbers | **Pass** | `tests/js/core.test.mjs`, `tests/py/test_core.py` (19 JS + 14 Python tests) |
| JS↔Python differential fuzz, property tests | 0 mismatches | **Pass** | 3,000 cases, seed 20261123, 13,256 comparisons; fast-check + Hypothesis properties. No counterexample was found, so none was saved |
| Mutation score 100% | ≥ 12 mutants, all caught by both | **Pass** | 18/18, `oracles/openroad/mutants-report.md` |
| OpenROAD `check_placement` agreement | Same violation set on rules both implement; every mismatch explained | **Pass** | Mutants + gcd GP/DP + three injected faults, `oracles/openroad/real-design.json`; OpenROAD 2.0-12381-g01bba3695 (ORFS not used, D09) |
| ICCAD 2017 evaluator on one case | agreement or documented reason | **Not run** | Contest site blocked from this environment (D10) |
| CP-SAT optimum and heuristic gaps | table | **Pass** | `oracles/cpsat/results.json`, `docs/oracles.md` |
| Voice: objective screens | CER ≤ 3% on two ASRs, lexicon 100%, rate 3.8–4.8 | **Fail (shipped anyway, D17)** | Kokoro f20: CER 4.3–5.0% (`docs/voice-casting.md`); narrated at the author's request and disclosed as synthetic |
| Voice: blind listener test | ≥ 8 native listeners, MOS ≥ 4.0, < 30% "machine" | **Not run** | Page ready at `/listen/`; needs listeners and a human reference |
| Voice: full-film pronunciation log | native listener log | **Not run** | Needs a native listener for the 精讲 and 实验演示 takes |
| Audio loudness / true peak | −16 LUFS, −1 dBTP | **Not applicable** | Film is silent; screening clips were level-matched to ≈ −16 LUFS / −1.3 dBTP |
| Captions | ≤ 16 chars/line, ≤ 2 lines, ≤ 9 chars/s, WebVTT + burned-in | **Pass** | 76 captions, max line 16 (`scripts/build-film-data.mjs`); `film.zh.vtt`; `film.zh.captioned.mp4` |
| Film determinism | `renderAt(t)` equal after jumps and on a fresh page | **Pass** | `scripts/film-stills.mjs` → `repeatedEqual`, `freshEqual` true |
| Film encode | 1920×1080, 30 fps, H.264, decodes without errors | **Pass** | 373.9 s captioned 8.3 MB, clean 7.1 MB; sample 32.6 s; `ffmpeg -v error -f null` empty |
| Sample before full film (with chosen voice) | sample passes every voice gate first | **Superseded** | The author asked for the house four-film set with narration and music (D17, D18); see the loudness row |
| Loudness | −16 LUFS integrated, ≤ −1 dBTP | **Partial** | True peak ≤ −1.5 dBTP on all films; integrated −17 / −18.1 / −22 (score only) / −18.6 LUFS (`media/renders/*.audio.json`) |
| House style | page, films and slides match placement-lab02-hpwl | **Pass (visual review)** | Before/after screenshots in the thread; D16 |
| Learner pre/post and think-aloud | run with 3–5 learners or "not run" | **Not run** | `docs/learner-study.md`, `/study/` |
| Teacher feedback T01–T24 mapped to checks | table | **Pass** | `docs/teacher-feedback.md` |
| Slides | 10–14, page numbers, notes, PDF | **Pass** | 12 slides, `Module 03 · p / 12`, notes on `/slides/`, PDF 12 pages; overflow check 0 |
| Python package | starter / reference / fixtures / PASS·INCOMPLETE·FAIL | **Pass** | reference PASS 24/24; starter INCOMPLETE; closed-interval and float mutants FAIL |
| Clean rebuild + Actions green | CI and Pages workflows | **Pass** | `ci` workflow green; `pages` build + deploy green (Actions tab) |
| Deployed URL exercised by Playwright + axe-core | all checks pass | **Pass** | https://su3037.github.io/legalization-lesson03-legality-metrics/ — `pages` workflow, job `check-deployed` |

## Site checks

Local build (2026-11-23, `build/e2e-local.json`): every page loads with no console errors or failed
requests; axe-core (WCAG 2.1 A/AA) reports no serious or critical issue in light and dark mode on all
10 pages; no horizontal scroll at 375 px; lab flows (seed illegal with 3 violations, legal preset,
keyboard move creates overlap, fixed toggle flips the verdict, step-through highlights a pseudocode
line); 10 challenges and 8 inventory items render; film metadata loads and a frame at 262 s opens in
the lab and re-checks legal; downloads resolve.

Deployed site (2026-11-23, GitHub Actions job `check-deployed` against https://su3037.github.io/legalization-lesson03-legality-metrics/): every check above passed on the live URL, including axe-core in light and dark mode on all 10 pages, the film→lab transfer at 262 s, and all downloads (film, sample, slides PDF, Python zip, outline, captions). The first attempt only failed when saving its JSON report (missing `build/` folder); fixed in the next commit.
