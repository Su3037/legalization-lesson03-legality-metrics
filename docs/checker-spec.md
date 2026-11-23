# Checker specification (v1)

Written before the code. Both implementations — `src/core/legality.js` (browser) and
`python/legality_metrics/legality.py` (download) — follow this file. Where they disagree with it,
the code is wrong.

## 1. Inputs

```text
design = {
  chip:  { W, H, siteW, rowH, rows: [y0, y1, ...], siteX0 = 0, dbu = 1000 },
  cells: [ { id, width, height = rowH }, ... ],     # order = report order
  nets:  [ [id, id, ...], ... ],
  fixed: { id: {x, y}, ... }                       # optional lock declarations
}
placement = { id: {x, y}, ... }                    # lower-left corners
reference = { name, placement }                    # immutable, for displacement
options   = { fixedMode: true|false, includeFixedInDisplacement: true }
```

* Coordinates are **lower-left corners**, x to the right, y up, in chip units (the toy uses one
  site width as the unit).
* `dbu` is the number of database units per chip unit (DEF style). Every coordinate and size is
  converted to an integer number of database units before any rule runs:
  `v_dbu = round(v * dbu)` when `|v * dbu - round(v * dbu)| <= 1e-6`. A value that is not on the
  database grid stays fractional and can never be site-aligned. This makes non-unit pitch exact:
  with `siteW = 0.19` and `dbu = 1000` the pitch is 190 DBU and `x = 0.38` is 380 DBU, which is
  2 sites.
* Internally a legal cell has an integer **site index** `k = (x_dbu - siteX0_dbu) / siteW_dbu` and an
  integer **row index** `r` with `y_dbu = rows_dbu[r]`.

## 2. Validation (runs first; any error ⇒ verdict `invalid`, geometry is not checked)

| Code | Condition |
| --- | --- |
| `V_BAD_CHIP` | `W`, `H`, `siteW`, `rowH`, `dbu` missing, non-finite or ≤ 0; `rows` empty |
| `V_BAD_ROWS` | a row bottom is non-finite, duplicated, or rows overlap (`rows[i+1] - rows[i] < rowH`) |
| `V_DUP_ID` | the same id appears twice in `cells` |
| `V_BAD_SIZE` | a cell width/height is non-finite or ≤ 0 |
| `V_HEIGHT` | a cell height differs from `rowH` (this checker is single-height only) |
| `V_EMPTY` | the placement has no entries |
| `V_MISSING` | a declared cell has no position |
| `V_UNKNOWN` | the placement names a cell that is not declared (no default width is invented) |
| `V_NONFINITE` | a position has a missing, non-numeric, NaN or infinite x or y |
| `V_NET_REF` | a net names an undeclared cell |
| `V_FIXED_REF` | a fixed declaration names an undeclared cell or has a non-finite coordinate |

An empty or incomplete placement can therefore never be `legal` just because no rule was visited.

## 3. The five rules (only on valid input)

Rules are evaluated for every cell, in declaration order, and all violations are collected.

| Code | Rule | Exact test (integers in DBU) |
| --- | --- | --- |
| `ROW` | on a row | `y_dbu ∈ rows_dbu` |
| `SITE` | on a site | `(x_dbu - siteX0_dbu) mod siteW_dbu == 0` (and `x_dbu` is an integer) |
| `BOUNDS` | whole cell inside the chip | `x ≥ 0`, `x + w ≤ W`, `y ≥ 0`, `y + h ≤ H` — the full extent, not only the anchor |
| `FIXED` | a locked cell has not moved | only when `fixedMode`: `(x, y) == fixed[id]` |
| `OVERLAP` | no two cells share area | for two cells on the **same valid row**: half-open intervals `[x, x+w)` intersect, i.e. `a.x < b.x + b.w && b.x < a.x + a.w`. Touching edges (`a.x + a.w == b.x`) are legal. |

Notes

* `OVERLAP` is the single-row simplification used by the source course. It is exact for valid
  single-height rows. Cells that are off-row are already illegal by `ROW`; their rectangle
  intersections with other cells are reported separately as `diagnostics` (code `RECT_INTERSECT`),
  never as `OVERLAP`, and never change the verdict.
* Violation order is deterministic: per-cell rules for cell 1 (`ROW`, `SITE`, `BOUNDS`, `FIXED`),
  then cell 2, …; then `OVERLAP` pairs sorted by row, then by the declaration index of the first
  and second cell. `first` is `violations[0]`.

## 4. Report

```text
{
  verdict: "legal" | "illegal" | "invalid",
  legal: boolean,                       # verdict == "legal"
  errors: [ {code, cells, message} ],   # validation
  violations: [ {code, cells, evidence, message} ],
  first: violation | error | null,
  counts: {ROW, SITE, BOUNDS, FIXED, OVERLAP},
  diagnostics: [ ... ],
  metrics: { displacement, hpwl }       # computed whenever input is valid, even if illegal
}
```

`evidence` carries the numbers that decided the rule (e.g. `{y: 3, rows: [0,2,4]}`,
`{interval_a: [4,6], interval_b: [4,6], row: 2}`). Messages exist in Chinese and English; tests
compare codes, cells and numbers, never message strings.

## 5. Metrics (diagnostics, never a verdict)

* **Displacement** from a named, immutable reference placement:
  `d(c) = |x_c - xref_c| + |y_c - yref_c|`; report `total = Σ d`, `average = total / n`,
  `max = max d`, the per-cell list and the reference name. `n` counts the cells included; by
  default every declared cell is included (a correctly locked cell contributes 0). The reference is
  never reset by an edit.
* **HPWL** with **cell-centre pins** (this module's convention, unlike the lower-left pins of the
  earlier HPWL lesson): `pin_c = (x_c + w_c/2, y_c + h_c/2)`;
  `HPWL(net) = max x − min x + max y − min y`; total = sum over nets. A one-pin net has HPWL 0.
* Metrics are shown for illegal placements as diagnostics, labelled illegal. A lower HPWL or
  displacement never turns an illegal verdict into a legal one.

## 6. Conventions that change the numbers (taught explicitly)

| Choice | This module | Alternative shown in the lesson |
| --- | --- | --- |
| Geometry/displacement anchor | lower-left | centre (same displacement for fixed sizes) |
| HPWL pins | cell centres | lower-left points; real LEF pin offsets (real design demo) |
| Displacement norm | Manhattan sum | average, maximum (contest style), squared Euclidean (Abacus objective) |
| Fixed cells in displacement | included (contribute 0) | excluded |
| Units | chip units (sites) | DEF database units (2000 per µm in Nangate45) |
