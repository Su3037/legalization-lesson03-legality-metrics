"""Module 03 exercise: write a placement legality checker and two metrics.

Fill in every function marked TODO, then run:  python check.py
(python check.py --impl reference  runs the reference solution instead).

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
    # TODO: return [] for valid input; otherwise (code, [cells]) entries in the order listed above.
    raise NotImplementedError("validate")


def on_row(design, x, y):
    # TODO: True when the bottom edge y is exactly one of the row bottoms (compare in DBU).
    raise NotImplementedError("on_row")


def on_site(design, x, y):
    # TODO: True when (x - siteX0) is a whole number of site widths (compare in DBU; a non-integer DBU value is off-site).
    raise NotImplementedError("on_site")


def inside(design, x, y, w):
    # TODO: True when the whole rectangle [x, x+w) x [y, y+rowH) is inside the chip, not only the anchor.
    raise NotImplementedError("inside")


def intervals_overlap(xa, wa, xb, wb):
    """Half-open [xa, xa+wa) and [xb, xb+wb) share some length (touching does not count)."""
    # TODO: half-open intervals: touching (xa + wa == xb) is NOT an overlap.
    raise NotImplementedError("intervals_overlap")


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
    # TODO: sum, average and maximum of |dx| + |dy| over every declared cell.
    raise NotImplementedError("displacement")


def hpwl(design, placement):
    """Total half-perimeter wirelength with pins at cell centres."""
    # TODO: for each net: (max - min) of the cell-centre x plus (max - min) of the cell-centre y; return the sum.
    raise NotImplementedError("hpwl")