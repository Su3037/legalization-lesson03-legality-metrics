import json
from pathlib import Path

from legality_metrics.legality import check_placement, normalize_design, displacement, net_hpwl
from legality_metrics.repair import greedy_snap, overlap_remove, abacus_lite, abacus

ROOT = Path(__file__).resolve().parents[2]
RAW = json.loads((ROOT / "data/fixtures/tiny_legal.json").read_text())
CASES = json.loads((ROOT / "data/fixtures/cases.json").read_text())["cases"]
TRADE = json.loads((ROOT / "data/fixtures/tradeoff.json").read_text())
D = normalize_design(RAW)
SEED = CASES["overlap_seed"]["placement"]
GOLD = CASES["illustrative_golden"]["placement"]
REF = {"name": "overlap seed", "placement": SEED}


def codes(r):
    return [f'{v["code"]}:{"/".join(v["cells"])}' for v in r["violations"]]


def mv(p, cid, x=None, y=None):
    q = {k: dict(v) for k, v in p.items()}
    if x is not None:
        q[cid]["x"] = x
    if y is not None:
        q[cid]["y"] = y
    return q


def test_four_source_rows():
    for k, c in CASES.items():
        r = check_placement(D, c["placement"], reference=REF)
        assert r["legal"] == c["expected"]["legal"], k
        assert r["metrics"]["displacement"]["total"] == c["expected"]["displacement"], k
        assert r["metrics"]["hpwl"]["total"] == c["expected"]["hpwl"], k


def test_ports_match_source():
    assert overlap_remove(D, SEED) == CASES["overlap_removal"]["placement"]
    assert abacus_lite(D, SEED) == CASES["abacus_lite"]["placement"]
    snapped = greedy_snap(D, RAW["starter_float"])
    assert snapped == CASES["greedy_snap_float"]["placement"]
    assert not check_placement(D, snapped)["legal"]


def test_upstream_pitfall_empty_is_not_legal():
    assert check_placement(D, {})["verdict"] == "invalid"


def test_abacus_legal():
    for fm in (True, False):
        r = check_placement(D, abacus(D, SEED, fixed_mode=fm), fixed_mode=fm, reference=REF)
        assert r["legal"] and r["metrics"]["displacement"]["total"] == 4


def test_touching_and_extent():
    assert check_placement(D, mv(GOLD, "B", 2))["legal"]
    assert codes(check_placement(D, mv(GOLD, "B", 1))) == ["OVERLAP:A/B"]
    assert check_placement(D, mv(GOLD, "F", 11))["legal"]
    assert codes(check_placement(D, mv(GOLD, "D", 11))) == ["BOUNDS:D", "FIXED:D"]


def test_pitch_nangate_like():
    n = {"chip": {"W": 1.9, "H": 1.4, "siteW": 0.19, "rowH": 1.4, "rows": [0]}, "cells": [{"id": "u1", "width": 0.38}], "nets": []}
    assert check_placement(n, {"u1": {"x": 0.57, "y": 0}})["legal"]
    assert codes(check_placement(n, {"u1": {"x": 0.5, "y": 0}})) == ["SITE:u1"]


def test_centre_hpwl_and_reference():
    assert net_hpwl(D, SEED, ["A", "E"]) == 6.5
    b = mv(mv(SEED, "B", 6), "C", 8)
    r = displacement(D, b, REF)
    assert (r["total"], r["max"], r["average"]) == (6, 4, 1)


def test_tradeoff():
    ref = {"name": "dropped", "placement": TRADE["reference"]}
    j = check_placement(TRADE, TRADE["jump"], reference=ref)["metrics"]["displacement"]
    s = check_placement(TRADE, TRADE["shift"], reference=ref)["metrics"]["displacement"]
    assert (j["total"], j["max"], s["total"], s["max"]) == (4, 4, 8, 2)
