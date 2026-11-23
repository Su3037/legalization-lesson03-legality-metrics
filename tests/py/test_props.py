"""Property-based and metamorphic tests (Hypothesis). Shrunk failures are saved by Hypothesis in
.hypothesis/ and should be copied to tests/regressions/ as fixtures."""
import random

from hypothesis import given, settings, strategies as st

from legality_metrics.legality import check_placement, displacement, total_hpwl
from legality_metrics.repair import abacus, overlap_remove

SETTINGS = settings(max_examples=400, deadline=None, derandomize=True)


@st.composite
def instance(draw):
    site_w = draw(st.sampled_from([1, 0.5, 0.19, 2]))
    n_sites = draw(st.integers(4, 14))
    n_rows = draw(st.integers(1, 4))
    row_h = draw(st.sampled_from([1, 2]))
    ids = [chr(65 + i) for i in range(draw(st.integers(1, 6)))]
    cells = [{"id": i, "width": draw(st.integers(1, 3)) * site_w} for i in ids]
    rows = [r * row_h for r in range(n_rows)]
    pos = {}
    for c in cells:
        k = draw(st.integers(-1, n_sites))
        y = draw(st.sampled_from(rows + [row_h / 2, n_rows * row_h]))
        pos[c["id"]] = {"x": round(k * site_w, 9), "y": y}
    nets = draw(st.lists(st.lists(st.sampled_from(ids), min_size=1, max_size=4), max_size=4))
    design = {"chip": {"W": round(n_sites * site_w, 9), "H": n_rows * row_h, "siteW": site_w, "rowH": row_h, "rows": rows},
              "cells": cells, "nets": nets}
    return design, pos


def multiset(r):
    return sorted((v["code"], tuple(sorted(v["cells"]))) for v in r["violations"])


@SETTINGS
@given(instance(), st.randoms(use_true_random=False))
def test_verdict_independent_of_cell_order(inst, rnd):
    design, pos = inst
    shuffled = dict(design, cells=rnd.sample(design["cells"], len(design["cells"])))
    a, b = check_placement(design, pos), check_placement(shuffled, pos)
    assert a["verdict"] == b["verdict"]
    assert multiset(a) == multiset(b)


@SETTINGS
@given(instance(), st.integers(-3, 3))
def test_translation_by_whole_sites(inst, k):
    design, pos = inst
    sw, W = design["chip"]["siteW"], design["chip"]["W"]
    wid = {c["id"]: c["width"] for c in design["cells"]}
    moved = {c: {"x": round(p["x"] + k * sw, 9), "y": p["y"]} for c, p in pos.items()}
    inside = all(0 <= p["x"] and p["x"] + wid[c] <= W + 1e-9 for c, p in pos.items())
    inside2 = all(0 <= p["x"] and p["x"] + wid[c] <= W + 1e-9 for c, p in moved.items())
    a, b = check_placement(design, pos), check_placement(design, moved)
    if inside and inside2:
        assert a["verdict"] == b["verdict"]
        assert abs(a["metrics"]["hpwl"]["total"] - b["metrics"]["hpwl"]["total"]) < 1e-6


@SETTINGS
@given(instance())
def test_mirror_die_mirrors_verdict(inst):
    design, pos = inst
    W = design["chip"]["W"]
    wid = {c["id"]: c["width"] for c in design["cells"]}
    mirrored = {c: {"x": round(W - p["x"] - wid[c], 9), "y": p["y"]} for c, p in pos.items()}
    a, b = check_placement(design, pos), check_placement(design, mirrored)
    assert a["verdict"] == b["verdict"]
    assert multiset(a) == multiset(b)


@SETTINGS
@given(instance(), instance())
def test_displacement_identity_and_triangle(i1, i2):
    design, p = i1
    _, q0 = i2
    ids = [c["id"] for c in design["cells"]]
    q = {c: q0.get(c, p[c]) for c in ids}
    m = {c: {"x": (p[c]["x"] + q[c]["x"]) / 2, "y": q[c]["y"]} for c in ids}
    d = lambda a, b: displacement(design, a, {"name": "r", "placement": b})["total"]
    assert d(p, p) == 0
    assert d(p, q) <= d(p, m) + d(m, q) + 1e-9
    assert d(p, q) == d(q, p)


@SETTINGS
@given(instance(), st.lists(st.sampled_from("ABCDEF"), min_size=1, max_size=4))
def test_adding_a_net_never_lowers_hpwl(inst, net):
    design, pos = inst
    ids = {c["id"] for c in design["cells"]}
    net = [n for n in net if n in ids] or [design["cells"][0]["id"]]
    more = dict(design, nets=design["nets"] + [net])
    assert total_hpwl(more, pos)["total"] >= total_hpwl(design, pos)["total"] - 1e-9


@SETTINGS
@given(instance())
def test_repairs_are_legal_when_they_fit(inst):
    design, pos = inst
    W = design["chip"]["W"]
    cap = W * len(design["chip"]["rows"])
    if sum(c["width"] for c in design["cells"]) > cap or any(c["width"] > W for c in design["cells"]):
        return
    try:
        p = abacus(design, pos)
    except ValueError:
        return  # sub-row capacity exhausted by greedy row choice
    assert check_placement(design, p)["legal"], p
