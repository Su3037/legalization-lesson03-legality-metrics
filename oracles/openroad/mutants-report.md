| # | Mutant | Expected | JS | Python | OpenROAD check_placement | Agrees | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M01 | half-site x shift | illegal SITE:F | ✓ | ✓ | Site aligned:F | yes |  |
| M02 | y between rows | illegal ROW:C | ✓ | ✓ | Overlap:C,E, Site aligned:C | yes | OpenROAD tests the full rectangle, so the off-row C also hits E above it; our checker reports the same pair as a RECT_INTERSECT diagnostic, not as OVERLAP |
| M03 | right edge one unit outside (anchor inside) | illegal BOUNDS:F | ✓ | ✓ | Placed in rows:F | yes |  |
| M04 | wide cell crosses right edge | illegal BOUNDS:B | ✓ | ✓ | Placed in rows:B | yes |  |
| M05 | touching edges (must pass) | legal  | ✓ | ✓ | (clean) | yes |  |
| M06 | one site of overlap | illegal OVERLAP:A/B | ✓ | ✓ | Overlap:A,B | yes |  |
| M07 | full containment | illegal OVERLAP:C/E | ✓ | ✓ | Overlap:C,E | yes |  |
| M08 | moved fixed cell | illegal FIXED:D | ✓ | ✓ | (clean) | yes | check_placement has no reference placement, so it cannot know D moved (scope difference) |
| M09 | duplicate id | invalid V_DUP_ID:A | ✓ | ✓ | OpenROAD error: [ERROR ODB-0385] Attempt to create instance with duplicate name: A | n/a | the DEF reader rejects or merges the duplicate before the checker runs |
| M10 | missing cell | invalid V_MISSING:F | ✓ | ✓ | Overlap:A,F, Placed:F | yes | UNPLACED F sits at (0,0) inside OpenROAD, so it also collides with A; our checker stops at validation |
| M11 | NaN coordinate | invalid V_NONFINITE:A | ✓ | ✓ | not expressible in DEF | n/a | DEF coordinates are integers; NaN cannot be written |
| M12 | empty placement | invalid V_EMPTY: | ✓ | ✓ | Overlap:A,B,C,D,E,F, Placed:A,B,C,D,E,F | yes | every cell UNPLACED; same artefact as M10 |
| M13 | left edge outside | illegal BOUNDS:A | ✓ | ✓ | Placed in rows:A | yes |  |
| M14 | above the top row | illegal ROW:E, BOUNDS:E | ✓ | ✓ | Placed in rows:E | yes |  |
| M15 | unknown cell | invalid V_UNKNOWN:Z | ✓ | ✓ | not expressible in DEF | n/a | a DEF component needs a declared master; an undeclared cell cannot be written |
| M16 | wrong orientation (DEF only) | legal  | ✓ | ✓ | (clean) | yes | orientation is outside the toy model; this OpenROAD version's check_placement does not check it either (see docs/oracles.md) |
| M17 | one DBU over the die edge | illegal SITE:F, BOUNDS:F | ✓ | ✓ | Placed in rows:F, Site aligned:F | yes |  |
| M18 | overlap on an off-row pair (diagnostic only) | illegal ROW:E | ✓ | ✓ | Overlap:C,E, Site aligned:E | yes | OpenROAD reports the C/E rectangle hit as Overlap; ours reports it as a RECT_INTERSECT diagnostic |

Mutation score (caught by both JS and Python): 18/18 = 100%
