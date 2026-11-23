"""Write python/exercise/fixtures/cases.json: expected results come from the main checker
(python/legality_metrics), which is cross-checked against the JS checker, CP-SAT and OpenROAD."""
import json, math, sys, copy
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))
from legality_metrics.legality import check_placement, displacement, total_hpwl

raw = json.loads((ROOT / "data/fixtures/tiny_legal.json").read_text())
cases = json.loads((ROOT / "data/fixtures/cases.json").read_text())["cases"]
trade = json.loads((ROOT / "data/fixtures/tradeoff.json").read_text())
design = {k: raw[k] for k in ("chip", "cells", "nets", "fixed_macros")}
tdesign = {k: trade[k] for k in trade if k in ("chip", "cells", "nets", "fixed", "fixed_macros")}
seed = cases["overlap_seed"]["placement"]
gold = cases["illustrative_golden"]["placement"]
fine = {"chip": {"W": 3.8, "H": 2.8, "siteW": 0.19, "rowH": 1.4, "rows": [0, 1.4]},
        "cells": [{"id": "P", "width": 0.38}, {"id": "Q", "width": 0.57}, {"id": "R", "width": 0.19}],
        "nets": [["P", "Q", "R"]], "fixed_macros": []}

def mv(p, **kw):
    q = copy.deepcopy(p)
    for k, (x, y) in kw.items():
        q[k] = {"x": x, "y": y}
    return q

C = [
    ("seed: three cells stacked", design, seed, True, seed),
    ("legal golden placement", design, gold, True, seed),
    ("touching cells are legal", design, gold, True, gold),
    ("B one site left overlaps A", design, mv(gold, B=(1, 0)), True, gold),
    ("C off-row (y = 3)", design, mv(gold, C=(0, 3)), True, gold),
    ("F half a site off (x = 10.5)", design, mv(gold, F=(10.5, 0)), True, gold),
    ("D anchor inside, cell outside (fixed off)", design, mv(gold, D=(11, 4)), False, gold),
    ("B outside on the left", design, mv(gold, B=(-1, 0)), True, gold),
    ("fixed D moved to empty space", design, mv(gold, D=(6, 4)), True, gold),
    ("same placement, fixed constraint off", design, mv(gold, D=(6, 4)), False, gold),
    ("greedy snap still overlaps", design, cases["greedy_snap_float"]["placement"], True, raw["starter_float"]),
    ("overlap removal repair", design, cases["overlap_removal"]["placement"], True, seed),
    ("abacus-lite repair", design, cases["abacus_lite"]["placement"], True, seed),
    ("raw global-placement floats", design, raw["starter_float"], True, seed),
    ("off-row cells never overlap-count", design, mv(seed, A=(4, 2.5), B=(4, 2.5)), True, seed),
    ("missing cell", design, {k: v for k, v in gold.items() if k != "E"}, True, None),
    ("unknown cell", design, mv(gold, Z=(0, 0)), True, None),
    ("NaN coordinate", design, mv(gold, A=(float("nan"), 0)), True, None),
    ("empty placement", design, {}, True, None),
    ("tradeoff: jump", tdesign, trade["jump"], True, trade["reference"]),
    ("tradeoff: shift", tdesign, trade["shift"], True, trade["reference"]),
    ("0.19 site pitch, legal", fine, {"P": {"x": 0, "y": 0}, "Q": {"x": 0.38, "y": 0}, "R": {"x": 0.57, "y": 1.4}}, True, None),
    ("0.19 site pitch, Q off-site", fine, {"P": {"x": 0, "y": 0}, "Q": {"x": 0.4, "y": 0}, "R": {"x": 0.57, "y": 1.4}}, True, None),
    ("0.19 site pitch, touching at 0.95", fine, {"P": {"x": 0.57, "y": 0}, "Q": {"x": 0.95, "y": 0}, "R": {"x": 3.61, "y": 1.4}}, True, None),
]

out = []
for name, d, p, fm, ref in C:
    r = check_placement(d, p, fixed_mode=fm)
    e = {"verdict": r["verdict"]}
    if r["verdict"] == "invalid":
        e["error_codes"] = sorted({x["code"] for x in r["errors"]})
    else:
        e["violations"] = sorted([v["code"], sorted(v["cells"])] for v in r["violations"])
        e["hpwl"] = total_hpwl(d, p)["total"]
        if ref is not None:
            dd = displacement(d, p, ref)
            e["displacement"] = {k: dd[k] for k in ("total", "average", "max")}
    js = lambda o: json.loads(json.dumps(o).replace("NaN", '"NaN"'))
    out.append({"name": name, "design": d, "placement": js(p), "fixed_mode": fm, "reference": ref, "expected": e})
dst = ROOT / "python/exercise/fixtures/cases.json"
dst.write_text(json.dumps({"note": "Expected values from python/legality_metrics. 'NaN' strings are read back as float('nan').", "cases": out}, indent=1, ensure_ascii=False))
print(len(out), "cases ->", dst)
for c in out: print(" ", c["name"], c["expected"]["verdict"], c["expected"].get("violations", c["expected"].get("error_codes")))
