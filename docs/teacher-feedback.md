# Teacher feedback T01–T24 → checks for this module

The items come from the instructor's review of the earlier clustering course
(`su3037/learning-clustering`, `docs/teacher-feedback-verification.md`). Each is turned into a check
for Module 03. "Auto" = checked by a script in this repo; "Manual" = checked by reading/looking.

| # | Feedback | How this module answers it | Check | Result |
| --- | --- | --- | --- | --- |
| T01 | lab → module naming | "Module 03 · Legality Metrics" everywhere; upstream id `module01-03-legality-metrics` given once | Manual scan of headers, slides footer, film header | Pass |
| T02 | duplicated content | Centre-pin HPWL is contrasted with the earlier HPWL lesson's lower-left pins instead of re-teaching HPWL; no repeated chapters | Manual | Pass |
| T03 | slide page numbers | Every slide shows `Module 03 · p / 12`; web viewer shows the same number | Auto: `slides/build-slides.mjs` (12 PNG = 12 PDF pages, `pdfinfo`) | Pass |
| T04 | film length | 6:14 in 15 chapters with a chapter list and a 32 s sample; each chapter 15–40 s | Auto: `media/film/clock.zh.json` | Pass (length justified by 15 short chapters; open to the teacher's preference) |
| T05 | definition / problem statement | Home page card: input, output, constraints, objective, assumptions, stop condition, out of scope | Manual | Pass |
| T06 | what challenges are for | Each challenge states its target misconception (`概念 I1–I8`); lesson §10 links each misconception to its challenge | Auto: e2e renders 10 challenges | Pass |
| T07 | common mistakes | Lesson §10: wrong practice / why / counter-example (checker verdict) / fix / exercise, 8 rows | Manual; counter-examples are fixtures | Pass |
| T08 | challenge grouping | Titles `[类别] 题名`; category, difficulty and target shown as separate tags; 7 categories | Manual | Pass |
| T09 | Markdown outline | `downloads/module03-outline.md` | Auto: e2e download check | Pass |
| T10 | background with real sources | Lesson §11 references (Spindler 2008, Kahng et al. 2011, ICCAD 2017, OpenROAD, DREAMPlace, LEF/DEF); `docs/source-audit.md` says what was verified | Manual | Pass (ICCAD 2017 marked not verified online) |
| T11 | examples small → hard | Six-cell hand-checkable chip → trade-off row → 461-cell gcd | Engine + oracles | Pass |
| T12 | animation from real data | Film frames are `renderAt(t)` of the checker's state; no hand-drawn diagrams | Auto: determinism check | Pass |
| T13 | use case | Lesson §11 "用在哪里" (legalizers, OpenROAD after DP, DREAMPlace, contests) | Manual | Pass |
| T14 | reading speed | Captions ≤ 16 chars/line, ≤ 2 lines, ≤ 9 chars/s; each caption shown ≥ chars/4.5 + 0.8 s | Auto: `scripts/build-film-data.mjs` | Pass |
| T15 | machine voice | Voice pipeline with objective screen + blind test; none passed, so silent cut | `docs/voice-casting.md` | Pass for the rule (no machine voice shipped); voice itself not achieved |
| T16 | easy → hard | Challenges ordered 入门 → 练习 → 挑战 (sorted at render time) | Auto (sort) | Pass |
| T17 | "spring" analogy | Not used | Auto: grep finds no 弹簧 | Pass |
| T18 | tts | No TTS in the shipped film; edge-tts / Azure Neural never used | Manual | Pass |
| T19 | problem statement | Same as T05 | — | Pass |
| T20 | jumping between parts | Lesson anchors; film chapters + `#t=`; slides `#n`; challenge anchors `#c1`…; film frame → lab; 404 page | Auto: e2e link and download checks | Pass |
| T21 | notes under slides / aspect | Web slides: notes directly under the 16:9 slide; 375 px width, no horizontal scroll | Auto: e2e phone-width check | Pass |
| T22 | pseudocode | 11-line pseudocode; lab step-through highlights the current line | Auto: e2e "step-through highlights a pseudocode line" | Pass |
| T23 | python | `python/exercise` starter / reference / fixtures / `check.py` (PASS / INCOMPLETE / FAIL); zip download | Auto: reference PASS 24/24, starter INCOMPLETE, two mutants FAIL | Pass |
| T24 | new terms | Term cards in lesson §1 and §5 | Manual | Pass |
