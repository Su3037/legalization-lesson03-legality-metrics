"""Run every mutant through the JS checker, the Python checker and OpenROAD check_placement.

  python3 tests/mutants/run_mutants.py [--openroad /path/to/openroad]
Writes oracles/openroad/mutants-report.json and .md. Exit 1 if any implementation misses a mutant.
"""
import argparse
import copy
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))
sys.path.insert(0, str(ROOT / "oracles/openroad"))
from legality_metrics.legality import check_placement, semantic  # noqa: E402
from export_def import lef, defn  # noqa: E402

OR_CATS = {"Placement_failures": "Placed", "Placed_failures": "Placed", "In_rows_failures": "Placed in rows", "Overlap_failures": "Overlap",
           "Site_alignment_failures": "Site aligned", "One_site_gap_failures": "One site gap",
           "Region_placement_failures": "Region placement"}


def build(m, design, base):
    p = copy.deepcopy(base)
    d = copy.deepcopy(design)
    for k, v in m.get("set", {}).items():
        p[k] = {"x": float("nan") if v["x"] == "NaN" else v["x"], "y": v["y"]}
    if "delete" in m:
        del p[m["delete"]]
    if m.get("empty"):
        p = {}
    if "extra" in m:
        p.update(m["extra"])
    if "dup" in m:
        d["cells"] = d["cells"] + [next(c for c in d["cells"] if c["id"] == m["dup"])]
    return d, p


def codes(sem):
    return [f"{c}:{'/'.join(cells)}" for c, cells in (sem["errors"] or sem["violations"])]


def run_openroad(exe, design, p, m, tmp):
    if m.get("openroad") in ("not expressible",):
        return None, "not expressible in DEF"
    tmp = Path(tmp)
    (tmp / "t.lef").write_text(lef(design))
    (tmp / "t.def").write_text(defn(design, p, orient=m.get("orient"), dup=m.get("dup")))
    rep = tmp / "r.json"
    if rep.exists():
        rep.unlink()
    (tmp / "t.tcl").write_text(f"read_lef {tmp/'t.lef'}\nread_def {tmp/'t.def'}\n"
                               f"if {{[catch {{check_placement -verbose -report_file_name {rep}}} e]}} {{puts \"RESULT FAIL\"}} else {{puts \"RESULT PASS\"}}\n")
    r = subprocess.run([exe, "-exit", "-no_init", str(tmp / "t.tcl")], capture_output=True, text=True, timeout=120)
    log = r.stdout + r.stderr
    if "RESULT" not in log:
        return None, "OpenROAD error: " + next((l for l in log.splitlines() if "ERROR" in l), log[-200:]).strip()
    found = []
    if rep.exists():
        for cat in json.loads(rep.read_text()).get("DRC", []):
            name = OR_CATS.get(cat["name"], cat["name"])
            cells = sorted({s["name"] for v in cat["violations"] for s in v.get("sources", [])})
            if cells:
                found.append(f"{name}:{','.join(cells)}")
    return sorted(found), ("PASS" if "RESULT PASS" in log else "FAIL")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--openroad", default=None)
    a = ap.parse_args()
    cat = json.loads((ROOT / "tests/mutants/catalog.json").read_text())
    raw = json.loads((ROOT / "data/fixtures/tiny_legal.json").read_text())
    design = {"chip": raw["chip"], "cells": raw["cells"], "nets": raw["nets"], "fixed": {"D": {"x": 8, "y": 4}}}
    base = json.loads((ROOT / "data/fixtures/cases.json").read_text())["cases"][cat["base"]]["placement"]
    built = [build(m, design, base) for m in cat["mutants"]]
    with tempfile.TemporaryDirectory() as t:
        items = [{"design": d, "placement": {k: {"x": "NaN" if v["x"] != v["x"] else v["x"], "y": v["y"]} for k, v in p.items()}}
                 for d, p in built]
        (Path(t) / "items.json").write_text(json.dumps(items))
        js = json.loads(subprocess.run(["node", str(ROOT / "tests/mutants/js_eval.mjs"), str(Path(t) / "items.json")],
                                       capture_output=True, text=True, check=True).stdout)
        rows, caught_both = [], 0
        for m, (d, p), jsr in zip(cat["mutants"], built, js):
            pyr = semantic(check_placement(d, p))
            exp = m["expect"]
            ok_js = jsr["verdict"] == exp["verdict"] and codes(jsr) == exp["codes"]
            ok_py = pyr["verdict"] == exp["verdict"] and codes(pyr) == exp["codes"]
            caught_both += ok_js and ok_py
            orr, ors = (None, "not run")
            if a.openroad:
                orr, ors = run_openroad(a.openroad, d, p, m, t)
            exp_or = m.get("openroad")
            if isinstance(exp_or, list):
                agree = orr is not None and sorted(exp_or) == orr
            else:
                agree = None
            rows.append({"id": m["id"], "name": m["name"], "zh": m["zh"], "expect": exp, "js": codes(jsr), "js_ok": ok_js,
                         "py": codes(pyr), "py_ok": ok_py, "openroad": orr, "openroad_status": ors,
                         "openroad_expected": exp_or, "openroad_agrees": agree, "scope_note": m.get("openroad_scope", "")})
    score = caught_both / len(rows)
    out = {"mutants": len(rows), "caught_by_js_and_python": caught_both, "mutation_score": score, "rows": rows}
    (ROOT / "oracles/openroad/mutants-report.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
    md = ["| # | Mutant | Expected | JS | Python | OpenROAD check_placement | Agrees | Note |", "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    for r in rows:
        o = ", ".join(r["openroad"]) if r["openroad"] else (r["openroad_status"] if r["openroad"] is None else "(clean)")
        md.append(f"| {r['id']} | {r['name']} | {r['expect']['verdict']} {', '.join(r['expect']['codes'])} | "
                  f"{'✓' if r['js_ok'] else '✗ ' + ', '.join(r['js'])} | {'✓' if r['py_ok'] else '✗ ' + ', '.join(r['py'])} | {o} | "
                  f"{ {True: 'yes', False: 'NO', None: 'n/a'}[r['openroad_agrees']] } | {r['scope_note']} |")
    md.append(f"\nMutation score (caught by both JS and Python): {caught_both}/{len(rows)} = {score:.0%}")
    (ROOT / "oracles/openroad/mutants-report.md").write_text("\n".join(md) + "\n")
    print("\n".join(md))
    sys.exit(0 if caught_both == len(rows) else 1)


if __name__ == "__main__":
    main()
