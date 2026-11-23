"""Self-check for the Module 03 exercise.

    python check.py                 # checks starter.py (your work)
    python check.py --impl reference
    python check.py --impl path/to/my_checker.py

Prints one line per fixture and a final status:
  PASS        every fixture matches
  INCOMPLETE  nothing is wrong yet, but some functions still raise NotImplementedError
  FAIL        at least one fixture gives a wrong answer (exit code 1)
"""
import argparse, importlib.util, json, math, sys, traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load(impl):
    path = Path(impl) if impl.endswith(".py") else HERE / f"{impl}.py"
    spec = importlib.util.spec_from_file_location("student_impl", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def nan(o):
    if isinstance(o, dict):
        return {k: nan(v) for k, v in o.items()}
    if isinstance(o, list):
        return [nan(v) for v in o]
    return float("nan") if o == "NaN" else o


def close(a, b):
    return isinstance(a, (int, float)) and abs(a - b) <= 1e-6


def grade(mod, case):
    d, p, e = case["design"], nan(case["placement"]), case["expected"]
    r = mod.check_placement(d, p, fixed_mode=case["fixed_mode"])
    problems = []
    if r["verdict"] != e["verdict"]:
        problems.append(f"verdict {r['verdict']!r}, expected {e['verdict']!r}")
    if e["verdict"] == "invalid":
        got = sorted({c for c, _ in r.get("errors", [])})
        if got != e["error_codes"]:
            problems.append(f"error codes {got}, expected {e['error_codes']}")
        return problems
    got = sorted([c, sorted(cells)] for c, cells in r["violations"])
    if got != e["violations"]:
        problems.append(f"violations {got}, expected {e['violations']}")
    h = mod.hpwl(d, p)
    if not close(h, e["hpwl"]):
        problems.append(f"hpwl {h}, expected {e['hpwl']}")
    if "displacement" in e:
        dd = mod.displacement(d, p, case["reference"])
        for k, v in e["displacement"].items():
            if not close(dd.get(k), v):
                problems.append(f"displacement {k} {dd.get(k)}, expected {v}")
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--impl", default="starter")
    ap.add_argument("--fixtures", default=str(HERE / "fixtures" / "cases.json"))
    a = ap.parse_args()
    mod = load(a.impl)
    cases = json.loads(Path(a.fixtures).read_text(encoding="utf-8"))["cases"]
    npass = nfail = ntodo = 0
    todo = set()
    for c in cases:
        try:
            probs = grade(mod, c)
        except NotImplementedError as ex:
            ntodo += 1
            todo.add(str(ex) or "?")
            print(f"  TODO  {c['name']}  (needs {ex})")
            continue
        except Exception:
            nfail += 1
            print(f"  FAIL  {c['name']}  crashed:\n" + traceback.format_exc(limit=2))
            continue
        if probs:
            nfail += 1
            print(f"  FAIL  {c['name']}: " + "; ".join(probs))
        else:
            npass += 1
            print(f"  ok    {c['name']}")
    status = "FAIL" if nfail else "INCOMPLETE" if ntodo else "PASS"
    print(f"\n{status}: {npass} passed, {nfail} failed, {ntodo} not implemented" + (f" ({', '.join(sorted(todo))})" if todo else ""))
    return 1 if nfail else 0


if __name__ == "__main__":
    sys.exit(main())
