"""Oracle A: the exact minimum-displacement legal placement, by CP-SAT (Google OR-Tools).

For every instance below it finds (1) the minimum total Manhattan displacement, (2) the minimum
maximum displacement, (3) how many distinct legal placements reach the minimum total, and then
reports the optimality gap of each repair heuristic. Run: python3 oracles/cpsat/optimum.py
Writes oracles/cpsat/results.json (consumed by the site and docs/oracles.md).
"""
import json
import sys
from pathlib import Path

from ortools.sat.python import cp_model
import ortools

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))
from legality_metrics.legality import check_placement, normalize_design  # noqa: E402
from legality_metrics.repair import greedy_snap, overlap_remove, abacus_lite, abacus  # noqa: E402

U = 1000  # integer database units per chip unit


def model(design, ref, fixed_mode, objective, fix_total=None, fix_max=None):
    d = normalize_design(design)
    ch = d["chip"]
    sw, x0 = round(ch["siteW"] * U), round(ch["siteX0"] * U)
    W, rows = round(ch["W"] * U), [round(r * U) for r in ch["rows"]]
    m = cp_model.CpModel()
    B = round((ch["W"] + ch["H"]) * U) + max(round(abs(p["x"]) * U) + round(abs(p["y"]) * U) for p in ref.values())
    xs, ys, cost, per_row = {}, {}, [], {r: [] for r in range(len(rows))}
    for c in d["cells"]:
        cid, w = c["id"], round(c["width"] * U)
        rx, ry = round(ref[cid]["x"] * U), round(ref[cid]["y"] * U)
        if fixed_mode and cid in d["fixed"]:
            fx, fy = round(d["fixed"][cid]["x"] * U), round(d["fixed"][cid]["y"] * U)
            ri = rows.index(fy)
            per_row[ri].append(m.NewFixedSizeIntervalVar(fx, w, f"I_{cid}"))
            xs[cid], ys[cid] = fx, fy
            cost.append(abs(fx - rx) + abs(fy - ry))
            continue
        kmax = (W - w - x0) // sw
        k = m.NewIntVar(0, kmax, f"k_{cid}")
        x = m.NewIntVar(x0, x0 + kmax * sw, f"x_{cid}")
        m.Add(x == x0 + k * sw)
        lits = [m.NewBoolVar(f"r_{cid}_{r}") for r in range(len(rows))]
        m.AddExactlyOne(lits)
        y = m.NewIntVar(min(rows), max(rows), f"y_{cid}")
        m.Add(y == sum(l * rows[r] for r, l in enumerate(lits)))
        for r, l in enumerate(lits):
            per_row[r].append(m.NewOptionalFixedSizeIntervalVar(x, w, l, f"I_{cid}_{r}"))
        dx = m.NewIntVar(0, B, f"dx_{cid}")
        dy = m.NewIntVar(0, B, f"dy_{cid}")
        m.AddAbsEquality(dx, x - rx)
        m.AddAbsEquality(dy, y - ry)
        tot = m.NewIntVar(0, B, f"d_{cid}")
        m.Add(tot == dx + dy)
        cost.append(tot)
        xs[cid], ys[cid] = x, y
    for ivs in per_row.values():
        m.AddNoOverlap(ivs)
    total = sum(cost)
    mx = m.NewIntVar(0, B, "max")
    m.AddMaxEquality(mx, [c if not isinstance(c, int) else m.NewConstant(c) for c in cost])
    if fix_total is not None:
        m.Add(total == fix_total)
    if fix_max is not None:
        m.Add(mx == fix_max)
    if objective == "sum":
        m.Minimize(total)
    elif objective == "max":
        m.Minimize(mx)
    return m, xs, ys, total, mx


def solve(design, ref, fixed_mode, objective, fix_max=None):
    if objective == "max":  # lexicographic: min max, then min total at that max
        best_max = solve(design, ref, fixed_mode, "max_only")["max"]
        return solve(design, ref, fixed_mode, "sum", fix_max=round(best_max * U))
    m, xs, ys, total, mx = model(design, ref, fixed_mode, "max" if objective == "max_only" else objective, fix_max=fix_max)
    s = cp_model.CpSolver()
    s.parameters.num_workers = 1
    s.parameters.random_seed = 1
    st = s.Solve(m)
    assert st == cp_model.OPTIMAL, s.StatusName(st)
    val = lambda v: v if isinstance(v, int) else s.Value(v)
    p = {c: {"x": val(xs[c]) / U, "y": val(ys[c]) / U} for c in xs}
    return {"total": s.Value(total) / U if not isinstance(total, int) else total / U,
            "max": s.Value(mx) / U, "placement": p}


class _Count(cp_model.CpSolverSolutionCallback):
    def __init__(self, xs, ys):
        super().__init__()
        self.n, self.xs, self.ys, self.sols = 0, xs, ys, []

    def on_solution_callback(self):
        self.n += 1
        if len(self.sols) < 50:
            self.sols.append({c: {"x": (v if isinstance(v, int) else self.Value(v)) / U,
                                  "y": (self.ys[c] if isinstance(self.ys[c], int) else self.Value(self.ys[c])) / U}
                              for c, v in self.xs.items()})


def count_optima(design, ref, fixed_mode, best):
    m, xs, ys, total, mx = model(design, ref, fixed_mode, None, fix_total=round(best * U))
    s = cp_model.CpSolver()
    s.parameters.enumerate_all_solutions = True
    s.parameters.max_time_in_seconds = 120
    s.parameters.num_workers = 1
    cb = _Count(xs, ys)
    s.Solve(m, cb)
    return cb.n, cb.sols


def main():
    raw = json.loads((ROOT / "data/fixtures/tiny_legal.json").read_text())
    cases = json.loads((ROOT / "data/fixtures/cases.json").read_text())["cases"]
    trade = json.loads((ROOT / "data/fixtures/tradeoff.json").read_text())
    out = {"tool": f"OR-Tools CP-SAT {ortools.__version__}", "units": "chip units (sites); internal 1000 DBU per unit",
           "instances": []}
    insts = [
        ("tiny_legal, reference = overlap seed", raw, cases["overlap_seed"]["placement"]),
        ("tiny_legal, reference = float starter", raw, raw["starter_float"]),
        ("tradeoff (sum vs max)", trade, trade["reference"]),
    ]
    for name, design, ref in insts:
        for fixed_mode in (True, False):
            if "tradeoff" in name and not fixed_mode:
                continue
            s_sum = solve(design, ref, fixed_mode, "sum")
            s_max = solve(design, ref, fixed_mode, "max")
            n, sols = count_optima(design, ref, fixed_mode, s_sum["total"])
            heur = {}
            R = {"name": "reference", "placement": ref}
            for hname, fn in (("greedy snap", greedy_snap), ("overlap removal (teacher)", overlap_remove),
                              ("abacus-lite (teacher)", abacus_lite), ("Abacus (Spindler 2008, small)", abacus)):
                p = fn(design, ref, fixed_mode=fixed_mode)
                r = check_placement(design, p, fixed_mode=fixed_mode, reference=R)
                dd = r["metrics"]["displacement"]
                heur[hname] = {"legal": r["legal"], "total": dd["total"], "max": dd["max"],
                               "gap": round(dd["total"] - s_sum["total"], 6) if r["legal"] else None,
                               "hpwl": r["metrics"]["hpwl"]["total"], "placement": p}
            chk = check_placement(design, s_sum["placement"], fixed_mode=fixed_mode, reference=R)
            assert chk["legal"], chk["violations"]
            out["instances"].append({
                "name": name, "fixed_D": fixed_mode,
                "min_total": s_sum["total"], "max_at_min_total": s_sum["max"], "optimum_placement": s_sum["placement"],
                "optimum_hpwl": chk["metrics"]["hpwl"]["total"],
                "min_max": s_max["max"], "total_at_min_max": s_max["total"], "min_max_placement": s_max["placement"],
                "n_optimal_placements": n, "optimal_placements_sample": sols[:12],
                "heuristics": heur,
            })
            print(flush=True, *[f"{name:42s} fixedD={fixed_mode!s:5s} min_total={s_sum['total']:<5} min_max={s_max['max']:<4} "
                  f"#optima={n:<4} " + " ".join(f"{k.split(' ')[0]}={v['total'] if v['legal'] else 'illegal'}" for k, v in heur.items())])
    (ROOT / "oracles/cpsat/results.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
