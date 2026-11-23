"""Export a toy design + placement to LEF/DEF so OpenROAD's check_placement can judge it.

1 chip unit = 1 µm, DATABASE MICRONS 1000. One site = siteW µm × rowH µm. Rows alternate N / FS
like real standard-cell rows. A cell of width w becomes macro CELL_W<w*1000>.
Missing cells are written UNPLACED; fixed cells FIXED; everything else PLACED.
"""
import json
import sys


def lef(design):
    ch = design["chip"]
    sw, rh = ch.get("siteW", 1), ch["rowH"]
    widths = sorted({c["width"] for c in design["cells"]})
    out = ["VERSION 5.8 ;", "BUSBITCHARS \"[]\" ;", "DIVIDERCHAR \"/\" ;", "UNITS\n  DATABASE MICRONS 1000 ;\nEND UNITS",
           "MANUFACTURINGGRID 0.001 ;",
           "LAYER metal1\n  TYPE ROUTING ;\n  DIRECTION HORIZONTAL ;\n  PITCH 0.2 ;\n  WIDTH 0.1 ;\nEND metal1",
           f"SITE toysite\n  SYMMETRY Y ;\n  CLASS CORE ;\n  SIZE {sw} BY {rh} ;\nEND toysite"]
    for w in widths:
        n = f"CELL_W{round(w * 1000)}"
        out.append(f"MACRO {n}\n  CLASS CORE ;\n  ORIGIN 0 0 ;\n  SIZE {w} BY {rh} ;\n  SYMMETRY X Y ;\n  SITE toysite ;\n"
                   f"  PIN A\n    DIRECTION INPUT ;\n    PORT\n      LAYER metal1 ;\n        RECT 0 0 0.05 0.05 ;\n    END\n  END A\nEND {n}")
    out.append("END LIBRARY")
    return "\n".join(out) + "\n"


def dbu(v):
    return round(v * 1000)


def defn(design, placement, *, orient=None, dup=None, extra_cells=()):
    ch = design["chip"]
    sw = ch.get("siteW", 1)
    x0 = ch.get("siteX0", 0)
    nsites = round((ch["W"] - x0) / sw)
    rows = []
    for i, y in enumerate(ch["rows"]):
        o = "N" if i % 2 == 0 else "FS"
        rows.append(f"ROW ROW_{i} toysite {dbu(x0)} {dbu(y)} {o} DO {nsites} BY 1 STEP {dbu(sw)} 0 ;")
    fixed = design.get("fixed", {})
    comps = []
    for c in list(design["cells"]) + list(extra_cells):
        n = f"CELL_W{round(c['width'] * 1000)}"
        p = placement.get(c["id"])
        if p is None:
            comps.append(f"    - {c['id']} {n} + UNPLACED ;")
            continue
        status = "FIXED" if c["id"] in fixed else "PLACED"
        o = (orient or {}).get(c["id"], "N" if _row_index(ch, p["y"]) % 2 == 0 else "FS")
        comps.append(f"    - {c['id']} {n} + {status} ( {dbu(p['x'])} {dbu(p['y'])} ) {o} ;")
    if dup:
        comps.append(comps[[c["id"] for c in design["cells"]].index(dup)])
    return "\n".join([
        "VERSION 5.8 ;", "DIVIDERCHAR \"/\" ;", "BUSBITCHARS \"[]\" ;", "DESIGN toy ;", "UNITS DISTANCE MICRONS 1000 ;",
        f"DIEAREA ( 0 0 ) ( {dbu(ch['W'])} {dbu(ch['H'])} ) ;", *rows,
        f"COMPONENTS {len(comps)} ;", *comps, "END COMPONENTS", "END DESIGN", ""])


def _row_index(ch, y):
    best = min(range(len(ch["rows"])), key=lambda i: abs(ch["rows"][i] - y))
    return best


if __name__ == "__main__":
    d = json.load(open(sys.argv[1]))
    p = json.load(open(sys.argv[2]))
    open(sys.argv[3] + ".lef", "w").write(lef(d))
    open(sys.argv[3] + ".def", "w").write(defn(d, p))
