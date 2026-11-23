"""Legality checker and metrics for single-height row placement.

Spec: docs/checker-spec.md. Mirror of src/core/legality.js (same codes, same order, same numbers).
Standard library only, so it runs anywhere with Python 3.8+.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Mapping, Optional

RULES = ["ROW", "SITE", "BOUNDS", "FIXED", "OVERLAP"]

MSG = {
    "V_BAD_CHIP": ("芯片参数无效", "invalid chip parameters"),
    "V_BAD_ROWS": ("行定义无效", "invalid row definition"),
    "V_DUP_ID": ("单元编号重复", "duplicate cell id"),
    "V_BAD_SIZE": ("单元尺寸无效", "invalid cell size"),
    "V_HEIGHT": ("单元高度不等于行高", "cell height differs from row height"),
    "V_EMPTY": ("布局为空", "empty placement"),
    "V_MISSING": ("缺少单元坐标", "missing cell position"),
    "V_UNKNOWN": ("出现未声明的单元", "undeclared cell in placement"),
    "V_NONFINITE": ("坐标不是有限数", "coordinate is not a finite number"),
    "V_NET_REF": ("线网引用了未声明的单元", "net references an undeclared cell"),
    "V_FIXED_REF": ("固定声明无效", "invalid fixed-cell declaration"),
    "ROW": ("不在任何一行的底边上", "not on a row bottom"),
    "SITE": ("没有对齐站点", "not aligned to a site"),
    "BOUNDS": ("单元有一部分在芯片外", "part of the cell is outside the chip"),
    "FIXED": ("固定单元被移动了", "fixed cell has moved"),
    "OVERLAP": ("同一行内区间重叠", "intervals overlap on the same row"),
}


def message(code: str, lang: str = "zh") -> str:
    m = MSG.get(code)
    return (m[1] if lang == "en" else m[0]) if m else code


def _num(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def to_dbu(v: float, dbu: float):
    """Chip units -> database units; an int when on the DBU grid, else the exact float product."""
    p = v * dbu
    r = round(p)
    return int(r) if abs(p - r) <= 1e-6 else p


def normalize_design(design: Mapping) -> Dict:
    chip = dict(design.get("chip") or {})
    row_h = chip.get("rowH")
    cells = [
        {"id": c.get("id"), "width": c.get("width"), "height": row_h if c.get("height") is None else c.get("height")}
        for c in design.get("cells") or []
    ]
    fixed = design.get("fixed")
    if fixed is None and "fixed_macros" in design:  # teacher JSON form
        fixed = {m["id"]: {"x": m["x"], "y": m["y"]} for m in design["fixed_macros"]}
    return {
        "chip": {
            "W": chip.get("W"),
            "H": chip.get("H"),
            "siteW": 1 if chip.get("siteW") is None else chip.get("siteW"),
            "rowH": row_h,
            "rows": list(chip.get("rows") or []) if isinstance(chip.get("rows"), list) else [],
            "siteX0": 0 if chip.get("siteX0") is None else chip.get("siteX0"),
            "dbu": 1000 if chip.get("dbu") is None else chip.get("dbu"),
        },
        "cells": cells,
        "nets": [list(n) for n in design.get("nets") or []],
        "fixed": dict(fixed or {}),
    }


def _validate(d: Dict, placement: Any) -> List[Dict]:
    errors: List[Dict] = []

    def err(code, cells, **extra):
        e = {"code": code, "cells": list(cells), "message": message(code)}
        e.update(extra)
        errors.append(e)

    chip = d["chip"]
    for k in ("W", "H", "siteW", "rowH", "dbu"):
        if not _num(chip[k]) or chip[k] <= 0:
            err("V_BAD_CHIP", [], field=k, value=chip[k])
    if not _num(chip["siteX0"]):
        err("V_BAD_CHIP", [], field="siteX0", value=chip["siteX0"])
    if not chip["rows"]:
        err("V_BAD_CHIP", [], field="rows", value=[])
    if errors:
        return errors
    rows = chip["rows"]
    if not all(_num(r) for r in rows):
        err("V_BAD_ROWS", [], rows=rows)
    else:
        s = sorted(rows)
        for i in range(1, len(s)):
            if s[i] == s[i - 1]:
                err("V_BAD_ROWS", [], rows=rows, reason="duplicate")
            elif s[i] - s[i - 1] < chip["rowH"] - 1e-9:
                err("V_BAD_ROWS", [], rows=rows, reason="rows overlap")
    seen = set()
    for c in d["cells"]:
        if c["id"] in seen:
            err("V_DUP_ID", [c["id"]])
        seen.add(c["id"])
        if not _num(c["width"]) or c["width"] <= 0 or not _num(c["height"]) or c["height"] <= 0:
            err("V_BAD_SIZE", [c["id"]], width=c["width"], height=c["height"])
        elif abs(c["height"] - chip["rowH"]) > 1e-9:
            err("V_HEIGHT", [c["id"]], height=c["height"], rowH=chip["rowH"])
    p = placement if isinstance(placement, Mapping) else {}
    keys = list(p.keys())
    if not keys:
        err("V_EMPTY", [])
    for c in d["cells"]:
        if keys and c["id"] not in p:
            err("V_MISSING", [c["id"]])
    for k in sorted(keys, key=str):
        if k not in seen:
            err("V_UNKNOWN", [k])
    for c in d["cells"]:
        if c["id"] not in p:
            continue
        q = p[c["id"]]
        if not isinstance(q, Mapping) or not _num(q.get("x")) or not _num(q.get("y")):
            err("V_NONFINITE", [c["id"]])
    for i, net in enumerate(d["nets"]):
        for cid in net:
            if cid not in seen:
                err("V_NET_REF", [cid], net=i)
    for cid, f in d["fixed"].items():
        if cid not in seen or not isinstance(f, Mapping) or not _num(f.get("x")) or not _num(f.get("y")):
            err("V_FIXED_REF", [cid])
    return errors


def check_placement(design: Mapping, placement: Any, *, fixed_mode: bool = True,
                    reference: Optional[Mapping] = None, include_fixed_in_displacement: bool = True) -> Dict:
    d = normalize_design(design)
    errors = _validate(d, placement)
    if errors:
        return {
            "verdict": "invalid", "legal": False, "errors": errors, "violations": [],
            "first": errors[0], "counts": {r: 0 for r in RULES}, "diagnostics": [], "metrics": None,
        }
    chip = d["chip"]
    u = chip["dbu"]
    rows_d = [to_dbu(y, u) for y in chip["rows"]]
    site_w = to_dbu(chip["siteW"], u)
    x0 = to_dbu(chip["siteX0"], u)
    W = to_dbu(chip["W"], u)
    H = to_dbu(chip["H"], u)
    violations: List[Dict] = []
    g = []
    for c in d["cells"]:
        q = placement[c["id"]]
        g.append({"id": c["id"], "x": to_dbu(q["x"], u), "y": to_dbu(q["y"], u),
                  "w": to_dbu(c["width"], u), "h": to_dbu(c["height"], u)})

    def from_dbu(v):
        return v / u

    for cg, c in zip(g, d["cells"]):
        q = placement[c["id"]]
        row_idx = rows_d.index(cg["y"]) if isinstance(cg["y"], int) and cg["y"] in rows_d else -1
        cg["row"] = row_idx
        if row_idx < 0:
            violations.append({"code": "ROW", "cells": [c["id"]],
                               "evidence": {"y": q["y"], "rows": list(chip["rows"])}, "message": message("ROW")})
        offset = cg["x"] - x0
        aligned = isinstance(cg["x"], int) and isinstance(site_w, int) and offset % site_w == 0
        if not aligned:
            violations.append({"code": "SITE", "cells": [c["id"]],
                               "evidence": {"x": q["x"], "siteX0": chip["siteX0"], "siteW": chip["siteW"],
                                            "sites": offset / site_w}, "message": message("SITE")})
        out = []
        if cg["x"] < 0:
            out.append("left")
        if cg["x"] + cg["w"] > W:
            out.append("right")
        if cg["y"] < 0:
            out.append("bottom")
        if cg["y"] + cg["h"] > H:
            out.append("top")
        if out:
            violations.append({"code": "BOUNDS", "cells": [c["id"]],
                               "evidence": {"sides": out, "extent": [q["x"], q["y"], from_dbu(cg["x"] + cg["w"]),
                                                                     from_dbu(cg["y"] + cg["h"])],
                                            "chip": [0, 0, chip["W"], chip["H"]]}, "message": message("BOUNDS")})
        if fixed_mode and c["id"] in d["fixed"]:
            f = d["fixed"][c["id"]]
            if to_dbu(f["x"], u) != cg["x"] or to_dbu(f["y"], u) != cg["y"]:
                violations.append({"code": "FIXED", "cells": [c["id"]],
                                   "evidence": {"at": [q["x"], q["y"]], "locked": [f["x"], f["y"]]},
                                   "message": message("FIXED")})

    pairs = []
    diagnostics = []
    for i in range(len(g)):
        for j in range(i + 1, len(g)):
            a, b = g[i], g[j]
            x_hit = a["x"] < b["x"] + b["w"] and b["x"] < a["x"] + a["w"]
            if a["row"] >= 0 and b["row"] >= 0:
                if a["row"] == b["row"] and x_hit:
                    pairs.append((a["row"], i, j))
            elif x_hit and a["y"] < b["y"] + b["h"] and b["y"] < a["y"] + a["h"]:
                diagnostics.append({"code": "RECT_INTERSECT", "cells": [a["id"], b["id"]]})
    pairs.sort()
    for r, i, j in pairs:
        a, b = g[i], g[j]
        violations.append({"code": "OVERLAP", "cells": [a["id"], b["id"]],
                           "evidence": {"row": chip["rows"][r],
                                        "interval_a": [from_dbu(a["x"]), from_dbu(a["x"] + a["w"])],
                                        "interval_b": [from_dbu(b["x"]), from_dbu(b["x"] + b["w"])],
                                        "shared": from_dbu(min(a["x"] + a["w"], b["x"] + b["w"]) - max(a["x"], b["x"]))},
                           "message": message("OVERLAP")})
    counts = {r: 0 for r in RULES}
    for v in violations:
        counts[v["code"]] += 1
    metrics = {
        "hpwl": total_hpwl(d, placement),
        "displacement": displacement(d, placement, reference, include_fixed=include_fixed_in_displacement)
        if reference else None,
    }
    return {"verdict": "illegal" if violations else "legal", "legal": not violations, "errors": [],
            "violations": violations, "first": violations[0] if violations else None, "counts": counts,
            "diagnostics": diagnostics, "metrics": metrics}


def _r9(v: float) -> float:
    return round(v * 1e9) / 1e9


def displacement(design: Mapping, placement: Mapping, reference: Mapping, *, include_fixed: bool = True) -> Dict:
    d = normalize_design(design)
    ref = reference.get("placement", reference)
    per = []
    for c in d["cells"]:
        if not include_fixed and c["id"] in d["fixed"]:
            continue
        p, r = placement.get(c["id"]), ref.get(c["id"])
        if not p or not r:
            continue
        per.append((c["id"], abs(p["x"] - r["x"]) + abs(p["y"] - r["y"])))
    total = sum(v for _, v in per)
    return {
        "reference": reference.get("name", "reference"),
        "total": _r9(total),
        "average": _r9(total / len(per)) if per else 0,
        "max": _r9(max(v for _, v in per)) if per else 0,
        "n": len(per),
        "perCell": [{"id": i, "d": _r9(v)} for i, v in per],
    }


def net_hpwl(design: Mapping, placement: Mapping, net) -> float:
    d = normalize_design(design)
    size = {c["id"]: c for c in d["cells"]}
    xs, ys = [], []
    for cid in net:
        p, c = placement.get(cid), size.get(cid)
        if not p or not c:
            continue
        xs.append(p["x"] + c["width"] / 2)
        ys.append(p["y"] + c["height"] / 2)
    if not xs:
        return 0
    return _r9(max(xs) - min(xs) + max(ys) - min(ys))


def total_hpwl(design: Mapping, placement: Mapping) -> Dict:
    d = normalize_design(design)
    per = [net_hpwl(d, placement, n) for n in d["nets"]]
    return {"total": _r9(sum(per)), "perNet": per, "pins": "cell-centre"}


def semantic(report: Mapping) -> Dict:
    m = report.get("metrics")
    return {
        "verdict": report["verdict"],
        "errors": [[e["code"], e["cells"]] for e in report["errors"]],
        "violations": [[v["code"], v["cells"]] for v in report["violations"]],
        "hpwl": m["hpwl"]["total"] if m else None,
        "disp": m["displacement"]["total"] if m and m.get("displacement") else None,
    }
