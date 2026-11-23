"""Python side of the differential fuzzer: same inputs, same semantic summary."""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "python"))
from legality_metrics.legality import check_placement, semantic  # noqa: E402
from legality_metrics.repair import greedy_snap, overlap_remove, abacus_lite, abacus  # noqa: E402


def dec(o):
    if isinstance(o, dict) and set(o) == {"__num"}:
        return float(o["__num"].replace("Infinity", "inf"))
    if isinstance(o, dict):
        return {k: dec(v) for k, v in o.items()}
    if isinstance(o, list):
        return [dec(v) for v in o]
    return o


cases = dec(json.loads(Path(sys.argv[1]).read_text()))
out = []
for c in cases:
    fm = c["fixedMode"]
    r = check_placement(c["design"], c["placement"], fixed_mode=fm, reference=c["reference"])
    o = {"check": semantic(r)}
    if r["verdict"] != "invalid":
        for name, fn in (("snap", greedy_snap), ("overlap", overlap_remove), ("lite", abacus_lite), ("abacus", abacus)):
            try:
                p = fn(c["design"], c["placement"], fixed_mode=fm)
                o[name] = {"placement": p, "check": semantic(check_placement(c["design"], p, fixed_mode=fm, reference=c["reference"]))}
            except ValueError as e:
                o[name] = {"error": str(e).split(":")[0]}
    out.append(o)


def clean(o):
    if isinstance(o, float) and not math.isfinite(o):
        return None
    if isinstance(o, dict):
        return {k: clean(v) for k, v in o.items()}
    if isinstance(o, list):
        return [clean(v) for v in o]
    return o


print(json.dumps(clean(out)))
