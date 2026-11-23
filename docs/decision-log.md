# Decision log

| ID | Decision | Why | Alternatives considered |
| --- | --- | --- | --- |
| D01 | Ship the film **silent with burned-in captions** (plus a clean cut with WebVTT) | No voice passed the pre-registered objective screen (`docs/voice-casting.md`); the prompt says ship silent rather than lower gates. Teacher feedback T15/T18 ("machine voice", "tts") | Kokoro f20 (CER 4.3–5.0%); edge-tts / Azure Neural (explicitly the failed baseline) |
| D02 | Validate input before geometry; invalid input is its own verdict | Upstream returns "legal" for an empty placement; a checker must not invent widths for unknown cells | Treat missing cells as violations (would mix two kinds of error) |
| D03 | Integer DBU internally (1000 per unit), rounding only within 1e-6 | Exact site checks for non-unit pitch (0.19); matches DEF practice | Float tolerance like DREAMPlace's `precision` (tolerance makes "half a site" a matter of epsilon) |
| D04 | Overlap only between cells on the **same valid row**; off-row rectangle hits are a `RECT_INTERSECT` diagnostic | A cell that is off-row is already illegal; double-reporting it as OVERLAP hides the first cause. OpenROAD reports these as overlap — documented per mutant (M02, M18) | Full-rectangle overlap like OpenROAD |
| D05 | Centre-pin HPWL in this module (lower-left in the earlier HPWL lesson) | Upstream convention; fair to cells of different widths. Shown side by side with true-pin HPWL on gcd | Lower-left pins |
| D06 | Displacement from an immutable, named reference; the lab changes it only on an explicit "set as new reference" | Misconception I6 | Reset on every edit |
| D07 | Report total, average and max displacement, and teach a sum-vs-max case | Contests score average and maximum; the two can disagree (trade-off row) | Sum only |
| D08 | Challenges graded on state with the same checker; CP-SAT confirms 48 optimal placements | Many correct answers (I7) | Compare with one stored answer |
| D09 | Real design = OpenROAD's own `gcd` test (Nangate45), GP and DP run with the installed OpenROAD binary; ORFS not used | OpenROAD's own test inputs give a real GP/DP pair with one tool install and no synthesis step; ORFS (Yosys + full flow) was not attempted | ORFS gcd (prompt's first choice) |
| D10 | ICCAD 2017 evaluator not used | `iccad-contest.org` blocked; the evaluator binary is not on GitHub | — |
| D11 | Film timeline beats from the script's silent reading clock (chars/4.5 + 0.8 s per caption), not from forced alignment | No final voice, so no alignment; the same timeline can be re-timed from alignment later (`src/film/cues.mjs`) | MFA alignment of a scratch voice |
| D12 | Chinese only | The prompt makes English optional and only after every gate passes; the voice and learner gates have not passed / not run | — |
| D13 | Stacked cells: labels fanned out across the cell and drawn after all cells; displacement arrows offset from the cell centre | Stills review: "A B C" labels were unreadable | Opaque fill (hides that cells are stacked) |
| D14 | One figure pipeline for lesson, slides and film (`renderBoard` + `checkPlacement`) | Every picture is a checked state; the badge under each figure is the checker's verdict | Hand-drawn figures |
| D15 | Matcha-baker excluded from the listening test; ZipVoice excluded from screening | Databaker data is non-commercial; ZipVoice prompt voice is an unknown speaker (consent) | — |
