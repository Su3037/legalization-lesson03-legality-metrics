"""Real-design demo: the lesson's Python checker and metrics on OpenROAD's gcd (Nangate45).

  python3 oracles/openroad/real_design.py --lef <Nangate45_stdcell.lef> [--openroad <exe>]
Inputs: oracles/openroad/gcd/gcd_global_place.def and gcd_detailed_place.def (written by
gcd_gp_dp.tcl). Writes oracles/openroad/real-design.json and gcd/gcd_three_faults.def.
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
from legality_metrics.defio import read_def, read_lef_macros, orient_pin  # noqa: E402
from legality_metrics.legality import check_placement  # noqa: E402

G = ROOT / "oracles/openroad/gcd"


def to_design(df, lib):
    """DEF -> checker input, in DBU (dbu=1), relative to the core (row) origin like OpenROAD."""
    rows = df["rows"]
    ox, oy = min(r["x"] for r in rows), min(r["y"] for r in rows)
    step = rows[0]["step"]
    U = df["units"]
    h = round(lib["macros"][df["components"][df["order"][0]]["master"]]["h"] * U)
    W = max(r["x"] + r["num"] * step for r in rows) - ox
    cells, place, fixed = [], {}, {}
    for n in df["order"]:
        c = df["components"][n]
        m = lib["macros"][c["master"]]
        cells.append({"id": n, "width": round(m["w"] * U), "height": round(m["h"] * U)})
        if c["status"] != "UNPLACED":
            place[n] = {"x": c["x"] - ox, "y": c["y"] - oy}
        if c["status"] == "FIXED":
            fixed[n] = dict(place[n])
    design = {"chip": {"W": W, "H": max(r["y"] for r in rows) + h - oy, "siteW": step, "rowH": h,
                       "rows": sorted(r["y"] - oy for r in rows), "dbu": 1},
              "cells": cells, "nets": [], "fixed": fixed}
    return design, place, (ox, oy)


def orientation_violations(df):
    row_o = {r["y"]: r["orient"] for r in df["rows"]}
    ok = {"N": {"N", "FN"}, "FS": {"FS", "S"}}
    bad = []
    for n in df["order"]:
        c = df["components"][n]
        ro = row_o.get(c.get("y"))
        if ro and c["orient"] not in ok.get(ro, {ro}):
            bad.append(n)
    return bad


def hpwl(df, lib, mode):
    U = df["units"]
    total = 0.0
    for net in df["nets"]:
        xs, ys = [], []
        for inst, pin in net["terms"]:
            if inst == "PIN":
                if pin in df["pins"]:
                    x, y = df["pins"][pin]
                    xs.append(x); ys.append(y)
                continue
            c = df["components"][inst]
            m = lib["macros"][c["master"]]
            w, h = m["w"] * U, m["h"] * U
            if mode == "centre":
                px, py = w / 2, h / 2
            else:
                cx, cy = m["pin_centre"][pin]
                px, py = orient_pin(cx * U, cy * U, w, h, c["orient"])
            xs.append(c["x"] + px); ys.append(c["y"] + py)
        if len(xs) > 1:
            total += max(xs) - min(xs) + max(ys) - min(ys)
    return total / U


def displacement(a, b, U):
    ds = []
    for n, c in a["components"].items():
        d = b["components"][n]
        if c["status"] == "UNPLACED" or c["status"] == "FIXED":
            continue
        ds.append((abs(c["x"] - d["x"]) + abs(c["y"] - d["y"])) / U)
    return {"cells": len(ds), "total_um": round(sum(ds), 3), "average_um": round(sum(ds) / len(ds), 4),
            "max_um": round(max(ds), 3)}


def openroad_check(exe, lef_tech, lef_cells, deff):
    with tempfile.TemporaryDirectory() as t:
        rep = Path(t) / "r.json"
        tcl = Path(t) / "c.tcl"
        tcl.write_text(f"read_lef {lef_tech}\nread_lef {lef_cells}\nread_def {deff}\n"
                       f"if {{[catch {{check_placement -verbose -report_file_name {rep}}} e]}} {{puts RESULT_FAIL}} else {{puts RESULT_PASS}}\n")
        r = subprocess.run([exe, "-exit", "-no_init", str(tcl)], capture_output=True, text=True, timeout=300)
        found = {}
        if rep.exists():
            for cat in json.loads(rep.read_text()).get("DRC", []):
                cells = sorted({s["name"] for v in cat["violations"] for s in v.get("sources", [])})
                if cells:
                    found[cat["name"]] = cells
        return ("PASS" if "RESULT_PASS" in r.stdout else "FAIL"), found


def inject(df_text, df, lib):
    """Three single faults on three different movable cells: half-site shift, off-row y, overlap."""
    rows = sorted(df["rows"], key=lambda r: (r["y"], r["x"]))
    step = rows[0]["step"]
    U = df["units"]
    movable = [n for n in df["order"] if df["components"][n]["status"] == "PLACED"]
    occ = {}
    for n in df["order"]:
        c = df["components"][n]
        occ.setdefault(c["y"], []).append((c["x"], c["x"] + round(lib["macros"][c["master"]]["w"] * U), n))

    def free_right(n, dx):
        c = df["components"][n]
        w = round(lib["macros"][c["master"]]["w"] * U)
        return all(not (c["x"] + dx < b and a < c["x"] + dx + w) for a, b, m in occ[c["y"]] if m != n)

    half = next(n for n in movable if free_right(n, step // 2))
    # off-row: move a cell up by half a row height into empty space of both rows it straddles
    offrow = next(n for n in movable[len(movable) // 3:] if n != half)
    # overlap: move a cell onto its right neighbour by one site
    ov = None
    for y, lst in occ.items():
        lst = sorted(lst)
        for (a0, a1, an), (b0, b1, bn) in zip(lst, lst[1:]):
            if an in movable and an not in (half, offrow) and bn not in (half, offrow) and a1 == b0:
                ov, partner = an, bn
                break
        if ov:
            break
    faults = {half: ("x", step // 2, "SITE"), offrow: ("y", 1400, "ROW"), ov: ("x", step, "OVERLAP")}
    lines = df_text.splitlines()
    for i, l in enumerate(lines):
        t = l.split()
        if len(t) > 2 and t[0] == "-" and t[1] in faults and "PLACED" in l:
            axis, d, _ = faults[t[1]]
            c = df["components"][t[1]]
            nx, ny = c["x"] + (d if axis == "x" else 0), c["y"] + (d if axis == "y" else 0)
            lines[i] = l.replace(f"( {c['x']} {c['y']} )", f"( {nx} {ny} )")
    return "\n".join(lines) + "\n", {"half_site": half, "off_row": offrow, "overlap": [ov, partner]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lef", required=True)
    ap.add_argument("--tech", default=None)
    ap.add_argument("--openroad", default=None)
    a = ap.parse_args()
    lib = read_lef_macros(Path(a.lef).read_text())
    gp_t, dp_t = (G / "gcd_global_place.def").read_text(), (G / "gcd_detailed_place.def").read_text()
    gp, dp = read_def(gp_t), read_def(dp_t)
    U = dp["units"]
    res = {"design": "gcd (OpenROAD test/gcd_nangate45.v), Nangate45, OpenROAD 2.0-12381-g01bba3695",
           "instances": len(dp["order"]), "rows": len(dp["rows"]), "site_dbu": dp["rows"][0]["step"], "dbu_per_um": U}
    out, sets = {}, {}
    for name, df in (("global_place", gp), ("detailed_place", dp)):
        d, p, _ = to_design(df, lib)
        r = check_placement(d, p, fixed_mode=False)
        sets[name] = {"site_or_row": sorted({c for v in r["violations"] if v["code"] in ("ROW", "SITE") for c in v["cells"]}),
                      "overlap_or_rect": sorted({c for v in r["violations"] + r["diagnostics"] if v["code"] in ("OVERLAP", "RECT_INTERSECT") for c in v["cells"]})}
        out[name] = {"verdict": r["verdict"], "counts": r["counts"], "rect_intersect_diagnostics": len(r["diagnostics"]),
                     "orientation_mismatches": len(orientation_violations(df)),
                     "hpwl_um_centre_pins": round(hpwl(df, lib, "centre"), 3),
                     "hpwl_um_true_pins": round(hpwl(df, lib, "pins"), 3)}
    res["ours"] = out
    res["displacement_gp_to_dp"] = displacement(gp, dp, U)
    bad_t, faults = inject(dp_t, dp, lib)
    (G / "gcd_three_faults.def").write_text(bad_t)
    bad = read_def(bad_t)
    d, p, _ = to_design(bad, lib)
    r = check_placement(d, p, fixed_mode=False)
    res["three_faults"] = {"injected": faults, "verdict": r["verdict"], "violations": [[v["code"], v["cells"]] for v in r["violations"]],
                           "diagnostics": r["diagnostics"]}
    if a.openroad:
        res["openroad"] = {}
        for name in ("gcd_global_place.def", "gcd_detailed_place.def", "gcd_three_faults.def"):
            st, found = openroad_check(a.openroad, a.tech, a.lef, G / name)
            key = {"gcd_global_place.def": "global_place", "gcd_detailed_place.def": "detailed_place"}.get(name)
            if key:
                ours = sets[key]
                res["openroad_" + key + "_set_agreement"] = {
                    "site_or_row_vs_site_alignment": ours["site_or_row"] == found.get("Site_alignment_failures", []),
                    "overlap_or_rect_vs_overlap": ours["overlap_or_rect"] == found.get("Overlap_failures", []),
                    "ours_overlap_or_rect": len(ours["overlap_or_rect"]), "openroad_overlap": len(found.get("Overlap_failures", []))}
            res["openroad"][name] = {"status": st, "failures": {k: (len(v) if len(v) > 12 else v) for k, v in found.items()}}
    (ROOT / "oracles/openroad/real-design.json").write_text(json.dumps(res, indent=1))
    print(json.dumps(res, indent=1))


if __name__ == "__main__":
    main()
