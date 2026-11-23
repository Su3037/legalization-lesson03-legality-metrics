"""Reference solution for the Module 03 exercise (same interface as starter.py).

Single-height rows. A placement is legal iff the input is valid and all five rules hold:
ROW (bottom edge on a row bottom), SITE (left edge on a site), BOUNDS (whole rectangle inside the
chip), OVERLAP (same row, half-open intervals [x, x+w) intersect; touching is legal) and FIXED
(a declared fixed cell is at its declared position, only when fixed_mode is on).
Coordinates are compared as integers in database units (DBU), so a site width like 0.19 is exact.
"""
import math

DBU = 1000


def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def to_dbu(v):
    """Chip units -> DBU. Round only when the value is within 1e-6 of an integer DBU."""
    p = v * DBU
    r = round(p)
    return int(r) if abs(p - r) <= 1e-6 else p


def fixed_of(design):
    """{id: (x, y)} from either design['fixed'] = {id: {x, y}} or design['fixed_macros'] = [...]."""
    if isinstance(design.get("fixed"), dict):
        return {k: (v["x"], v["y"]) for k, v in design["fixed"].items()}
    return {m["id"]: (m["x"], m["y"]) for m in design.get("fixed_macros", []) if m.get("fixed", True)}


def widths(design):
    return {c["id"]: c["width"] for c in design["cells"]}


def validate(design, placement):
    """Return a list of (code, [cells]) for placement-level input errors (empty list = valid).

    V_EMPTY     the placement has no entries
    V_MISSING   a declared cell has no position
    V_UNKNOWN   the placement names a cell that is not declared
    V_NONFINITE a position has a missing, non-numeric, NaN or infinite x or y
    """
    if not isinstance(placement, dict) or not placement:
        return [("V_EMPTY", [])]
    errors = []
    ids = [c["id"] for c in design["cells"]]
    missing = [i for i in ids if i not in placement]
    if missing:
        errors.append(("V_MISSING", missing))
    unknown = sorted(k for k in placement if k not in ids)
    if unknown:
        errors.append(("V_UNKNOWN", unknown))
    bad = [i for i in ids if i in placement and not (isinstance(placement[i], dict) and is_num(placement[i].get("x")) and is_num(placement[i].get("y")))]
    if bad:
        errors.append(("V_NONFINITE", bad))
    return errors


def on_row(design, x, y):
    return to_dbu(y) in {to_dbu(r) for r in design["chip"]["rows"]}


def on_site(design, x, y):
    chip = design["chip"]
    off = to_dbu(x) - to_dbu(chip.get("siteX0", 0))
    return isinstance(off, int) and off % to_dbu(chip["siteW"]) == 0


def inside(design, x, y, w):
    chip = design["chip"]
    h = chip["rowH"]
    return to_dbu(x) >= 0 and to_dbu(x + w) <= to_dbu(chip["W"]) and to_dbu(y) >= 0 and to_dbu(y + h) <= to_dbu(chip["H"])


def intervals_overlap(xa, wa, xb, wb):
    """Half-open [xa, xa+wa) and [xb, xb+wb) share some length (touching does not count)."""
    return to_dbu(xa) < to_dbu(xb + wb) and to_dbu(xb) < to_dbu(xa + wa)


def check_placement(design, placement, fixed_mode=True):
    """Return {"verdict": "legal"|"illegal"|"invalid", "violations": [(code, [cells])], "errors": [...]}."""
    errors = validate(design, placement)
    if errors:
        return {"verdict": "invalid", "violations": [], "errors": errors}
    W = widths(design)
    fixed = fixed_of(design) if fixed_mode else {}
    v = []
    for c in design["cells"]:
        i = c["id"]
        x, y = placement[i]["x"], placement[i]["y"]
        if not on_row(design, x, y):
            v.append(("ROW", [i]))
        if not on_site(design, x, y):
            v.append(("SITE", [i]))
        if not inside(design, x, y, W[i]):
            v.append(("BOUNDS", [i]))
        if i in fixed and (to_dbu(x), to_dbu(y)) != (to_dbu(fixed[i][0]), to_dbu(fixed[i][1])):
            v.append(("FIXED", [i]))
    ids = [c["id"] for c in design["cells"]]
    for a in range(len(ids)):
        for b in range(a + 1, len(ids)):
            pa, pb = placement[ids[a]], placement[ids[b]]
            if to_dbu(pa["y"]) == to_dbu(pb["y"]) and on_row(design, pa["x"], pa["y"]):
                if intervals_overlap(pa["x"], W[ids[a]], pb["x"], W[ids[b]]):
                    v.append(("OVERLAP", [ids[a], ids[b]]))
    return {"verdict": "illegal" if v else "legal", "violations": v, "errors": []}


def displacement(design, placement, reference):
    """Manhattan displacement of every declared cell from the fixed reference placement."""
    d = [abs(placement[c["id"]]["x"] - reference[c["id"]]["x"]) + abs(placement[c["id"]]["y"] - reference[c["id"]]["y"]) for c in design["cells"]]
    return {"total": sum(d), "average": sum(d) / len(d), "max": max(d)}


def hpwl(design, placement):
    """Total half-perimeter wirelength with pins at cell centres."""
    W = widths(design)
    h = design["chip"]["rowH"]
    total = 0.0
    for net in design["nets"]:
        xs = [placement[i]["x"] + W[i] / 2 for i in net]
        ys = [placement[i]["y"] + h / 2 for i in net]
        total += max(xs) - min(xs) + max(ys) - min(ys)
    return total
