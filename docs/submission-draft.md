# Draft comment for yongfu-li/eda-learning issue #35 (NOT POSTED)

> Draft only. Do not post until the author decides to. Check the URLs and the "not done" list first.

---

Hi Prof. Li, here is a standalone draft of **Legalization – Lesson 03 (Module 03 · Legality Metrics,
`module01-03-legality-metrics`)** for review.

**Site (Chinese):** https://su3037.github.io/legalization-lesson03-legality-metrics/
**Repository:** https://github.com/su3037/legalization-lesson03-legality-metrics

What it covers:

- The five legality rules (on a row, on a site, whole cell inside the die, no overlap within a row with
  half-open intervals so touching is legal, fixed cells unmoved), with input validation first (missing,
  unknown or non-finite cells give "invalid", not "legal"). Metrics: displacement (total / average /
  max) from a named, fixed reference, and centre-pin HPWL.
- A live checker with step-through and pseudocode-line highlighting, a fixed-cell toggle, and repair
  comparisons (greedy snap, overlap removal, Abacus-lite, a small Abacus, and the exact optimum).
- Four short films (a music-cut overview, a narrated explanation, a captioned deep-dive, and a narrated
  walkthrough of the live checker); any frame can be opened in the live checker. 12 slides (PDF),
  10 challenges graded on the resulting placement, an 8-item concept inventory, and a Python exercise
  that reports PASS / INCOMPLETE / FAIL.

How it was checked:

- JS and Python checkers agree on 3,000 random inputs; 18 seeded single-fault mutants are all caught.
- CP-SAT gives the exact minimum: the opening example needs 4 units of displacement and 48 different
  placements reach it (so the challenges accept many answers).
- OpenROAD `check_placement` agrees on every case it can express, including OpenROAD's `gcd` design
  before and after detailed placement and a copy with three injected faults.

Known limits: the narration is an open-source synthetic voice (Kokoro). It is labelled as synthetic and
misses our own clarity target (4–5% character error against a 3% goal), so the captions and transcripts
are the reference. A blind listening test and a small learner study are prepared but not run.

The lesson adapts your Module 01-03 material (CC BY 4.0) with attribution; new code is MIT and new
content CC BY 4.0. Feedback on scope, length and wording is very welcome.
