# Source audit

Checked on 2026-11-23. "Used for" says exactly what each source contributed; "Status" says whether
the claim was verified against the source itself in this environment.

| Source | Version | Used for | Status |
| --- | --- | --- | --- |
| Yongfu Li, `eda-learning`, `courses/learn_legalization` (Module 01-03, CC BY 4.0) | `003bcd49e3794e6cfd2680181cdbd347d673ad07` (evidence pack, SHA-256 in its `source-manifest.json`) | `tiny_legal.json` (copied verbatim to `data/fixtures/`), the overlap seed, the illustrative golden placement, greedy snap / overlap removal / Abacus-lite helpers, the centre-pin HPWL convention | Verified: our ports reproduce the pack's `verification/source-checks.json` (seed illegal, disp 0, HPWL 32; golden legal, 14, 50; overlap removal 6, 32; Abacus-lite 4, 38; snap still overlaps) — `tests/js/core.test.mjs`, `tests/py/test_core.py` |
| Same, upstream limitations | same | Behaviour we deliberately changed: upstream returns "legal" for an empty placement; upstream site check assumes unit pitch | Verified by reading the pack's `legalizationutil.py`; both are covered by our tests (`V_EMPTY`, `V_MISSING`; 0.19 pitch fixtures) |
| OpenROAD `src/dpl/src/CheckPlacement.cpp` | OpenROAD `01bba3695` (sparse clone, `/opt/openroad-src`); binary 2.0-12381-g01bba3695 | Which rules a production checker runs: placed, placed-in-rows, overlap, one-site gap, site alignment, region placement; it reports overlap from one side of each pair | Verified in source and by running `check_placement` on 18 mutants and gcd (`oracles/openroad/`) |
| DREAMPlace `dreamplace/ops/legality_check/src/legality_check.h` | `4adf954` (`/opt/dreamplace-src`) | Second production reference: `boundaryCheck`, `siteAlignmentCheck` (row and site alignment with a floating-point precision tolerance), `fenceRegionCheck`, overlap by sorted sweep | Verified in source; not executed (no GPU build here) |
| P. Spindler, U. Schlichtmann, F. M. Johannes, "Abacus: Fast legalization of standard cell circuits with minimal movement", ISPD 2008 | — | Our `abacus()` (clusters, quadratic cost, collapse, sub-rows around fixed cells, site rounding) | Algorithm description from the paper as commonly reproduced; the PDF was not fetched in this environment |
| A. B. Kahng, J. Lienig, I. L. Markov, J. Hu, *VLSI Physical Design*, Springer 2011, ch. 4 | 1st ed. | Background: GP → legalization → DP flow, displacement and HPWL definitions | From knowledge; not re-read here |
| N. K. Darav et al., "ICCAD-2017 CAD Contest in Multi-Deck Standard Cell Legalization and Benchmarks", ICCAD 2017 | — | The remark that contests score average displacement and also constrain maximum displacement | **Not verified**: `iccad-contest.org` is blocked here. The lesson marks this sentence as recalled, not checked |
| ISPD / Bookshelf benchmark files | — | Would have provided a second real design | **Not used**: `ispd.cc` is blocked; gcd from OpenROAD's own test directory was used instead |
| LEF/DEF 5.8 Language Reference | 5.8 | `ROW`, `SITE`, `COMPONENTS ... PLACED/FIXED`, orientation names used by `python/legality_metrics/defio.py` | From knowledge and from the gcd LEF/DEF files themselves |
| OpenROAD `test/gcd_nangate45.v`, Nangate45 LEF (BSD-3-Clause) | `01bba3695` | Real-design demo input | Verified by running the flow (`oracles/openroad/gcd/gcd_gp_dp.tcl`, log in `run.log`) |
| GateUltra `vlsi-course-director` (MIT; evidence pack snapshot `dca1c25`) | `dca1c25` | Ideas only: pure-state timeline, `renderAt(t)`, frame-by-frame capture. No files copied | Read in the pack |

## What the lesson claims and where it is checked

| Claim in the lesson / film | Check |
| --- | --- |
| Overlap seed: three violations, first is OVERLAP A/B | `tests/js/core.test.mjs` ("seed report"), Python mirror |
| Minimum total displacement 4, 48 optimal placements | `oracles/cpsat/results.json` (CP-SAT 9.15, solution enumeration) |
| Float start: optimum 5.4; overlap removal 8.8, Abacus-lite 5.8, Abacus 6.4 | same |
| Trade-off row: min total 4 (max 4); min max 2 (total ≥ 6) | same |
| gcd: OpenROAD and our checker agree on rules both check | `oracles/openroad/real-design.json` |
| This OpenROAD version does not check orientation | mutant M16 in `oracles/openroad/mutants-report.md` |
