"""Score blind listening-test results downloaded from /listen/.
python3 scripts/score_listening.py results/*.json
Prints per-clip MOS (naturalness, clarity), share judged "machine", and the gate decision."""
import json, sys
from collections import defaultdict
from pathlib import Path

key = json.loads(Path("media/voice/listen-key.json").read_text())
rows, listeners = defaultdict(list), set()
for f in sys.argv[1:]:
    r = json.loads(Path(f).read_text())
    if r.get("native") != "是":
        continue
    listeners.add(r["pid"])
    for x in r["rows"]:
        rows[x["clip"].split(".")[0]].append(x)
print(f"native listeners: {len(listeners)} (gate needs >= 8)")
for cid, xs in sorted(rows.items()):
    nat = sum(x["naturalness"] for x in xs) / len(xs)
    cla = sum(x["clarity"] for x in xs) / len(xs)
    mach = sum(x["judged"] == "machine" for x in xs) / len(xs)
    ok = len(listeners) >= 8 and nat >= 4.0 and mach < 0.30
    print(f"{key.get(cid, cid):45s} n={len(xs):2d}  naturalness {nat:.2f}  clarity {cla:.2f}  machine {mach:.0%}  {'PASS' if ok else 'fail'}")
