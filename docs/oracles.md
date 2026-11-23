# Oracles

The checker is trusted only as far as independent references agree with it. Three were used.

## 1. CP-SAT exact optimum (`oracles/cpsat/optimum.py`)

OR-Tools CP-SAT 9.15. Each movable cell chooses a row (Boolean per row) and an integer site index;
`AddNoOverlap` on optional intervals per row; fixed cells are fixed intervals; displacement is
`|Δx| + |Δy|` in DBU with tight bounds. Solved lexicographically: minimise total, then the max at that
total; separately minimise max, then the total at that max. Optimal placements at the minimum
total are enumerated (120 s limit, all finished). Output: `oracles/cpsat/results.json`.

| Instance | Min total | Max at min total | Min max | Total at min max | # optimal | Overlap removal | Abacus-lite | Abacus | Greedy snap |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Overlap seed, D fixed | 4 | 2 | 2 | 4 | 48 | 6 | 4 | 4 | illegal |
| Float start, D fixed | 5.4 | 1.5 | 1.5 | 5.4 | 1 | 8.8 | 5.8 | 6.4 | illegal |
| Trade-off row | 4 | 4 | 2 | 6 | 1 | — | — | — | — |

All 37 CP-SAT placements stored in `results.json` (optima, min-max placements and the enumerated sample) were re-checked with our checker on 2026-11-23: all legal.

## 2. OpenROAD `check_placement`

OpenROAD 2.0-12381-g01bba3695 (micromamba, litex-hub channel). `oracles/openroad/export_def.py` writes
the toy design as LEF/DEF (1 unit = 1000 DBU); each mutant is checked by both our checkers and
OpenROAD. Rules OpenROAD does not express the same way are documented per mutant (`scope_note`).

* 18 mutants (`tests/mutants/catalog.json`): **18/18 caught by JS and Python (score 100%)**; OpenROAD
  agrees on every mutant it can express. Notable scope differences: OpenROAD tests full rectangles,
  so an off-row cell also "overlaps" its neighbour (we report that as a `RECT_INTERSECT` diagnostic);
  OpenROAD reports overlap on one cell of each pair; this version does not check orientation (M16).
* gcd (Nangate45, 461 instances, 57 rows): global placement — our 347 ROW/SITE cells equal OpenROAD's
  347 site-alignment failures; OpenROAD's 237 overlap cells are a subset of our 260 overlap/rect cells
  (all 23 extra are the partner side). Detailed placement — both legal/PASS. Three injected faults —
  both report exactly `_345_` (half site), `_462_` (off row), `_669_/_706_` (overlap).

## 3. Properties, metamorphic relations, differential fuzz

* fast-check (JS, seed 20261123) and Hypothesis (Python): verdict independent of cell order; mirroring
  the die mirrors the verdict; translating every cell by a whole number of sites keeps the verdict and HPWL whenever all cells stay inside the die;
  `disp(ref, ref) = 0` and the triangle inequality; adding a net never lowers HPWL; repairs that
  succeed return legal placements.
* `tests/diff/fuzz.mjs`: 3,000 random designs/placements (seed 20261123), JS vs Python on verdict,
  violations, errors, displacement and HPWL — **0 mismatches in 13,256 comparisons**.

## Python exercise fixtures

`python/exercise/fixtures/cases.json` (24 cases) is generated from `python/legality_metrics`
(`scripts/make_py_fixtures.py`). `reference.py` passes all 24; a closed-interval mutant fails 3; a
float-comparison mutant fails 3 (the 0.19-pitch cases).
