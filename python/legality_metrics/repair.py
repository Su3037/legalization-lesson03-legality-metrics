"""Small repair demonstrations. They exist to be *measured* by the checker, not to be trusted.

* greedy_snap, overlap_remove, abacus_lite: ports of the teacher's teaching helpers
  (yongfu-li/eda-learning @ 003bcd4, courses/learn_legalization/common/solvers.py, CC BY 4.0),
  modified to work in site indices so that a non-unit pitch is honoured.
  `abacus_lite` is the teacher's name for a greedy row-by-row helper; it is NOT the published
  Abacus algorithm.
* abacus: a small, faithful implementation of Spindler, Schlichtmann & Johannes,
  "Abacus: Fast legalization of standard cell circuits with minimal movement", ISPD 2008
  (cells sorted by x, trial PlaceRow in each row, cluster AddCell/AddCluster/Collapse with unit
  weights, quadratic movement objective), with fixed cells splitting rows into sub-rows and final
  cluster positions rounded to sites.
Mirror: src/core/repair.js.
"""
from __future__ import annotations

import math
from typing import Dict, List, Mapping, Optional

from .legality import normalize_design


def _ctx(design: Mapping):
    d = normalize_design(design)
    ch = d["chip"]
    return d, ch["siteW"], ch["siteX0"], ch["rows"], ch["W"], {c["id"]: c["width"] for c in d["cells"]}


def _snap_site(x: float, w: float, site_w: float, x0: float, chip_w: float) -> float:
    k = math.floor((x - x0) / site_w + 0.5)  # round half up, same as JS Math.round
    kmax = math.floor((chip_w - w - x0) / site_w + 1e-9)
    k = max(0, min(kmax, k))
    return _r(x0 + k * site_w)


def _r(v: float) -> float:
    return round(v * 1e9) / 1e9


def _nearest_row(y: float, rows: List[float]) -> float:
    return min(rows, key=lambda r: (abs(y - r), r))


def greedy_snap(design: Mapping, placement: Mapping, *, fixed_mode: bool = True) -> Dict:
    d, sw, x0, rows, W, wid = _ctx(design)
    out = {}
    for c in d["cells"]:
        cid = c["id"]
        p = placement[cid]
        if fixed_mode and cid in d["fixed"]:
            out[cid] = dict(d["fixed"][cid])
            continue
        out[cid] = {"x": _snap_site(p["x"], wid[cid], sw, x0, W), "y": float(_nearest_row(p["y"], rows))}
    return out


def _ov(a0, a1, b0, b1):
    return a0 < b1 - 1e-9 and b0 < a1 - 1e-9


def overlap_remove(design: Mapping, placement: Mapping, *, fixed_mode: bool = True) -> Dict:
    """Snap, then pack each row left-to-right keeping the original order (teacher's overlap removal)."""
    d, sw, x0, rows, W, wid = _ctx(design)
    fixed = d["fixed"] if fixed_mode else {}
    snapped = greedy_snap(design, placement, fixed_mode=fixed_mode)
    out = {k: dict(v) for k, v in snapped.items()}
    for ry in rows:
        ids = [c["id"] for c in d["cells"] if c["id"] not in fixed and snapped[c["id"]]["y"] == ry]
        ids.sort(key=lambda c: (snapped[c]["x"], c))
        blocked = sorted((fixed[f]["x"], fixed[f]["x"] + wid[f]) for f in fixed if abs(fixed[f]["y"] - ry) < 1e-9)
        cursor = x0
        for cid in ids:
            w = wid[cid]
            x = max(cursor, snapped[cid]["x"])
            moved = True
            while moved:
                moved = False
                for b0, b1 in blocked:
                    if _ov(x, x + w, b0, b1):
                        x = b1
                        moved = True
            if x + w > W + 1e-9:
                x = _snap_site(W - w, w, sw, x0, W)
            out[cid] = {"x": _r(x), "y": float(ry)}
            cursor = x + w
            blocked = sorted(blocked + [(x, x + w)])
    return out


def abacus_lite(design: Mapping, placement: Mapping, *, fixed_mode: bool = True) -> Dict:
    """Teacher's greedy helper: by increasing x, put each cell in the row/position (first free slot at
    or after its snapped x, else from the row start) with the least L1 movement."""
    d, sw, x0, rows, W, wid = _ctx(design)
    fixed = d["fixed"] if fixed_mode else {}
    order = sorted([c["id"] for c in d["cells"] if c["id"] not in fixed], key=lambda c: (placement[c]["x"], c))
    placed = {f: dict(fixed[f]) for f in fixed}
    for cid in order:
        w = wid[cid]
        o = placement[cid]
        best, best_cost = None, math.inf
        for ry in rows:
            occ = sorted((p["x"], p["x"] + wid[k]) for k, p in placed.items() if abs(p["y"] - ry) < 1e-9)
            prefer = _snap_site(o["x"], w, sw, x0, W)

            def try_place(start):
                xx = start
                for _ in range(int(W / sw) + 2):
                    hit = next(((a, b) for a, b in occ if _ov(xx, xx + w, a, b)), None)
                    if hit is None:
                        return xx if xx + w <= W + 1e-9 else None
                    xx = hit[1]
                return None

            cand = try_place(prefer)
            if cand is None:
                cand = try_place(x0)
            if cand is None:
                continue
            cost = abs(cand - o["x"]) + abs(ry - o["y"])
            if cost < best_cost - 1e-12 or (abs(cost - best_cost) <= 1e-12 and (best is None or cand < best["x"])):
                best_cost, best = cost, {"x": _r(cand), "y": float(ry)}
        if best is None:
            best = {"x": _snap_site(o["x"], w, sw, x0, W), "y": float(_nearest_row(o["y"], rows))}
        placed[cid] = best
    snapped = greedy_snap(design, placement, fixed_mode=fixed_mode)
    return {c["id"]: placed.get(c["id"], snapped[c["id"]]) for c in d["cells"]}


# ---------------------------------------------------------------- faithful (small) Abacus

class _Cluster:
    __slots__ = ("cells", "e", "q", "w", "x")

    def __init__(self):
        self.cells: List[str] = []
        self.e = 0.0
        self.q = 0.0
        self.w = 0.0
        self.x = 0.0


def _subrows(row_y, fixed, wid, x0, W):
    """Split one row into free intervals around fixed cells on it."""
    blocks = sorted((f["x"], f["x"] + wid[k]) for k, f in fixed.items() if abs(f["y"] - row_y) < 1e-9)
    out, start = [], x0
    for b0, b1 in blocks:
        if b0 > start + 1e-9:
            out.append([start, b0])
        start = max(start, b1)
    if W > start + 1e-9:
        out.append([start, W])
    return out


def _place_row(clusters: List[_Cluster], cid, xp, w, lo, hi, sw, x0):
    """Abacus PlaceRow on a copy-free list of clusters: returns new cluster list and x of cid."""
    def collapse(cs):
        c = cs[-1]
        c.x = c.q / c.e
        c.x = min(max(c.x, lo), hi - c.w)
        c.x = x0 + math.floor((c.x - x0) / sw + 0.5) * sw  # round to a site
        c.x = min(max(c.x, lo), hi - c.w)
        if len(cs) > 1:
            p = cs[-2]
            if p.x + p.w > c.x + 1e-9:
                # AddCluster(p, c)
                p.cells += c.cells
                p.e += c.e
                p.q += c.q - c.e * p.w
                p.w += c.w
                cs.pop()
                collapse(cs)

    last = clusters[-1] if clusters else None
    if last is None or last.x + last.w <= min(max(xp, lo), hi - w) + 1e-9:
        c = _Cluster()
        c.x = min(max(xp, lo), hi - w)
        c.cells, c.e, c.q, c.w = [cid], 1.0, xp, w
        clusters.append(c)
        collapse(clusters)
    else:
        last.cells.append(cid)
        last.q += 1.0 * (xp - last.w)
        last.e += 1.0
        last.w += w
        collapse(clusters)
    return clusters


def _positions(clusters, wid):
    pos = {}
    for c in clusters:
        x = c.x
        for cid in c.cells:
            pos[cid] = _r(x)
            x += wid[cid]
    return pos


def _copy(clusters):
    out = []
    for c in clusters:
        n = _Cluster()
        n.cells, n.e, n.q, n.w, n.x = list(c.cells), c.e, c.q, c.w, c.x
        out.append(n)
    return out


def abacus(design: Mapping, placement: Mapping, *, fixed_mode: bool = True) -> Dict:
    d, sw, x0, rows, W, wid = _ctx(design)
    fixed = d["fixed"] if fixed_mode else {}
    subrows = []  # (row_y, lo, hi, clusters, used_width)
    for ry in rows:
        for lo, hi in _subrows(ry, fixed, wid, x0, W):
            subrows.append({"y": ry, "lo": lo, "hi": hi, "clusters": [], "used": 0.0})
    order = sorted([c["id"] for c in d["cells"] if c["id"] not in fixed], key=lambda c: (placement[c]["x"], c))
    out = {f: dict(fixed[f]) for f in fixed}
    for cid in order:
        xp, yp, w = placement[cid]["x"], placement[cid]["y"], wid[cid]
        best = None
        # rows in order of vertical distance (paper: stop once the row distance alone exceeds the best cost)
        for sr in sorted(subrows, key=lambda s: (abs(s["y"] - yp), s["y"], s["lo"])):
            if best is not None and (sr["y"] - yp) ** 2 >= best[0] - 1e-12:
                continue
            if sr["used"] + w > sr["hi"] - sr["lo"] + 1e-9:
                continue
            trial = _place_row(_copy(sr["clusters"]), cid, xp, w, sr["lo"], sr["hi"], sw, x0)
            x = _positions(trial, wid)[cid]
            cost = (x - xp) ** 2 + (sr["y"] - yp) ** 2
            if best is None or cost < best[0] - 1e-12:
                best = (cost, sr)
        if best is None:
            raise ValueError(f"abacus: no sub-row can hold {cid}")
        sr = best[1]
        sr["clusters"] = _place_row(sr["clusters"], cid, xp, w, sr["lo"], sr["hi"], sw, x0)
        sr["used"] += w
    for sr in subrows:
        for cid, x in _positions(sr["clusters"], wid).items():
            out[cid] = {"x": x, "y": float(sr["y"])}
    return {c["id"]: out[c["id"]] for c in d["cells"]}
