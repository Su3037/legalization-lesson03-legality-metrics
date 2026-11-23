"""Minimal LEF/DEF reader for the real-design demo (rows, components, pins, nets, macro sizes and
pin boxes). Enough for OpenROAD-written DEF 5.8; not a general parser."""
from __future__ import annotations

import re
from typing import Dict


def read_lef_macros(text: str) -> Dict:
    macros, cur, pin, units = {}, None, None, None
    for line in text.splitlines():
        t = line.split()
        if not t:
            continue
        if t[0] == "DATABASE" and len(t) > 2:
            units = float(t[2])
        if t[0] == "MACRO":
            cur = {"name": t[1], "pins": {}, "class": None}
            macros[t[1]] = cur
        elif cur is not None and t[0] == "CLASS" and cur["class"] is None:
            cur["class"] = " ".join(x for x in t[1:] if x != ";")
        elif cur is not None and t[0] == "SIZE":
            cur["w"], cur["h"] = float(t[1]), float(t[3])
        elif cur is not None and t[0] == "PIN":
            pin = t[1]
            cur["pins"][pin] = []
        elif cur is not None and pin and t[0] == "RECT":
            x0, y0, x1, y1 = map(float, t[1:5])
            cur["pins"][pin].append((x0, y0, x1, y1))
        elif cur is not None and t[0] == "END" and len(t) > 1:
            if t[1] == pin:
                pin = None
            elif t[1] == cur["name"]:
                cur = None
    for m in macros.values():
        m["pin_centre"] = {}
        for p, rects in m["pins"].items():
            if rects:
                m["pin_centre"][p] = ((min(r[0] for r in rects) + max(r[2] for r in rects)) / 2,
                                      (min(r[1] for r in rects) + max(r[3] for r in rects)) / 2)
    return {"units": units, "macros": macros}


def read_def(text: str) -> Dict:
    out = {"rows": [], "components": {}, "pins": {}, "nets": [], "units": None, "die": None, "order": []}
    m = re.search(r"UNITS DISTANCE MICRONS (\d+)", text)
    out["units"] = int(m.group(1))
    m = re.search(r"DIEAREA \( (-?\d+) (-?\d+) \) \( (-?\d+) (-?\d+) \)", text)
    out["die"] = tuple(map(int, m.groups()))
    for m in re.finditer(r"^ROW (\S+) (\S+) (-?\d+) (-?\d+) (\S+) DO (\d+) BY (\d+) STEP (\d+) (\d+)", text, re.M):
        n, site, x, y, o, nx, ny, sx, sy = m.groups()
        out["rows"].append({"name": n, "site": site, "x": int(x), "y": int(y), "orient": o, "num": int(nx), "step": int(sx)})
    comp = text[text.index("\nCOMPONENTS"):text.index("END COMPONENTS")]
    for m in re.finditer(r"- (\S+) (\S+)([^;]*);", comp):
        name, master, rest = m.groups()
        pm = re.search(r"\+ (PLACED|FIXED|COVER) \( (-?\d+) (-?\d+) \) (\S+)", rest)
        c = {"master": master, "status": "UNPLACED"}
        if pm:
            c.update(status=pm.group(1), x=int(pm.group(2)), y=int(pm.group(3)), orient=pm.group(4))
        out["components"][name] = c
        out["order"].append(name)
    if "\nPINS" in text:
        pins = text[text.index("\nPINS"):text.index("END PINS")]
        for m in re.finditer(r"- (\S+) \+ NET (\S+)(.*?);", pins, re.S):
            pm = re.search(r"\+ (?:PLACED|FIXED) \( (-?\d+) (-?\d+) \)", m.group(3))
            if pm:
                out["pins"][m.group(1)] = (int(pm.group(1)), int(pm.group(2)))
    nets = text[text.index("\nNETS"):text.index("END NETS")]
    for m in re.finditer(r"- (\S+)((?:\s*\( \S+ \S+ \))*)", nets):
        terms = re.findall(r"\( (\S+) (\S+) \)", m.group(2))
        out["nets"].append({"name": m.group(1), "terms": terms})
    return out


def orient_pin(px, py, w, h, o):
    return {"N": (px, py), "S": (w - px, h - py), "FN": (w - px, py), "FS": (px, h - py),
            "W": (h - py, px), "E": (py, w - px), "FW": (py, px), "FE": (h - py, w - px)}[o]
