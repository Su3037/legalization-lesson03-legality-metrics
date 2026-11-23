import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkPlacement, normalizeDesign, displacement, totalHpwl, netHpwl } from "../../src/core/legality.js";
import { greedySnap, overlapRemove, abacusLite, abacus } from "../../src/core/repair.js";

const raw = JSON.parse(readFileSync(new URL("../../data/fixtures/tiny_legal.json", import.meta.url)));
const cases = JSON.parse(readFileSync(new URL("../../data/fixtures/cases.json", import.meta.url)));
const trade = JSON.parse(readFileSync(new URL("../../data/fixtures/tradeoff.json", import.meta.url)));
const D = normalizeDesign(raw);
const seed = cases.cases.overlap_seed.placement;
const REF = { name: "overlap seed", placement: seed };
const codes = (r) => r.violations.map((v) => `${v.code}:${v.cells.join("/")}`);
const errs = (r) => r.errors.map((e) => e.code);
const mv = (p, id, x, y) => ({ ...p, [id]: { x: x ?? p[id].x, y: y ?? p[id].y } });

test("the four source rows are reproduced exactly (written before the code)", () => {
  for (const [k, c] of Object.entries(cases.cases)) {
    const r = checkPlacement(D, c.placement, { reference: REF });
    assert.equal(r.legal, c.expected.legal, k);
    assert.equal(r.metrics.displacement.total, c.expected.displacement, k);
    assert.equal(r.metrics.hpwl.total, c.expected.hpwl, k);
  }
  assert.deepEqual(codes(checkPlacement(D, seed)).slice(0, 1), ["OVERLAP:A/B"]);
});

test("our ports of the teacher helpers give the same placements as the source", () => {
  assert.deepEqual(overlapRemove(D, seed), cases.cases.overlap_removal.placement);
  assert.deepEqual(abacusLite(D, seed), cases.cases.abacus_lite.placement);
  const snapped = greedySnap(D, raw.starter_float);
  assert.deepEqual(snapped, cases.cases.greedy_snap_float.placement);
  assert.equal(checkPlacement(D, snapped).legal, false, "snap alone is not legalization");
});

test("faithful Abacus is legal with and without D fixed", () => {
  for (const fixedMode of [true, false]) {
    const p = abacus(D, seed, { fixedMode });
    const r = checkPlacement(D, p, { reference: REF, fixedMode });
    assert.equal(r.legal, true);
    assert.equal(r.metrics.displacement.total, 4);
  }
  assert.equal(checkPlacement(D, abacus(D, raw.starter_float)).legal, true);
});

test("validation: empty, missing, unknown, duplicate, NaN/Infinity, bad sizes and pitch", () => {
  assert.deepEqual(errs(checkPlacement(D, {})), ["V_EMPTY"]);
  const { F, ...noF } = seed;
  assert.deepEqual(errs(checkPlacement(D, noF)), ["V_MISSING"]);
  assert.deepEqual(errs(checkPlacement(D, { ...seed, Z: { x: 0, y: 0 } })), ["V_UNKNOWN"]);
  assert.deepEqual(errs(checkPlacement(D, mv(seed, "A", NaN))), ["V_NONFINITE"]);
  assert.deepEqual(errs(checkPlacement(D, mv(seed, "A", undefined, Infinity))), ["V_NONFINITE"]);
  assert.deepEqual(errs(checkPlacement(D, { ...seed, A: { x: "4", y: 2 } })), ["V_NONFINITE"]);
  const dup = { ...D, cells: [...D.cells, { id: "A", width: 2, height: 2 }] };
  assert.ok(errs(checkPlacement(dup, seed)).includes("V_DUP_ID"));
  assert.ok(errs(checkPlacement({ ...D, chip: { ...D.chip, siteW: 0 } }, seed)).includes("V_BAD_CHIP"));
  assert.ok(errs(checkPlacement({ ...D, cells: D.cells.map((c) => (c.id === "E" ? { ...c, width: -1 } : c)) }, seed)).includes("V_BAD_SIZE"));
  assert.ok(errs(checkPlacement({ ...D, nets: [["A", "Q"]] }, seed)).includes("V_NET_REF"));
  assert.ok(errs(checkPlacement({ ...D, chip: { ...D.chip, rows: [0, 1, 4] } }, seed)).includes("V_BAD_ROWS"));
  assert.ok(errs(checkPlacement({ ...D, cells: D.cells.map((c) => (c.id === "E" ? { ...c, height: 4 } : c)) }, seed)).includes("V_HEIGHT"));
  assert.equal(checkPlacement(D, {}).legal, false);
});

const GOLD = cases.cases.illustrative_golden.placement;

test("half-open intervals: touching is legal, one site of overlap is not", () => {
  assert.equal(checkPlacement(D, mv(GOLD, "B", 2)).legal, true);
  assert.deepEqual(codes(checkPlacement(D, mv(GOLD, "B", 1))), ["OVERLAP:A/B"]);
  // containment counts as overlap
  assert.deepEqual(codes(checkPlacement(D, mv(mv(GOLD, "E", 0, 0), "F", 1, 0))), ["OVERLAP:A/E", "OVERLAP:A/F"]);
});

test("the whole cell extent is checked at every boundary, not only the anchor", () => {
  assert.equal(checkPlacement(D, mv(GOLD, "F", 11)).legal, true); // [11,12) touches the right edge
  assert.deepEqual(codes(checkPlacement(D, mv(GOLD, "D", 11))), ["BOUNDS:D", "FIXED:D"]); // anchor inside, cell not
  assert.deepEqual(codes(checkPlacement(D, mv(GOLD, "F", -1))), ["BOUNDS:F"]);
  assert.deepEqual(codes(checkPlacement(D, mv(GOLD, "E", 0, 6))), ["ROW:E", "BOUNDS:E"]);
  assert.deepEqual(codes(checkPlacement(D, mv(GOLD, "E", 0, -2))), ["ROW:E", "BOUNDS:E"]);
});

test("row and site rules, with tolerance only for float noise", () => {
  assert.deepEqual(codes(checkPlacement(D, mv(GOLD, "C", undefined, 3))), ["ROW:C"]);
  assert.deepEqual(codes(checkPlacement(D, mv(GOLD, "F", 10.5))), ["SITE:F"]);
  assert.equal(checkPlacement(D, mv(GOLD, "F", 10 + 1e-12)).legal, true);
  assert.deepEqual(codes(checkPlacement(D, mv(GOLD, "F", 10.0001))), ["SITE:F"]);
});

test("non-unit pitch and site origin are honoured exactly", () => {
  const d = { ...D, chip: { ...D.chip, siteW: 0.5, siteX0: 0.25, W: 12.25 } };
  const p = Object.fromEntries(Object.entries(GOLD).map(([k, v]) => [k, { x: v.x + 0.25, y: v.y }]));
  const fixed = { D: { x: 8.25, y: 4 } };
  assert.equal(checkPlacement({ ...d, fixed }, p).legal, true);
  assert.deepEqual(codes(checkPlacement({ ...d, fixed }, mv(p, "F", 10.5))), ["SITE:F"]);
  assert.equal(checkPlacement({ ...d, fixed }, mv(p, "F", 10.75)).legal, true);
  // Nangate45-like: 0.19 pitch in a 1000-DBU grid
  const n = normalizeDesign({ chip: { W: 1.9, H: 1.4, siteW: 0.19, rowH: 1.4, rows: [0] }, cells: [{ id: "u1", width: 0.38 }], nets: [] });
  assert.equal(checkPlacement(n, { u1: { x: 0.57, y: 0 } }).legal, true);
  assert.deepEqual(codes(checkPlacement(n, { u1: { x: 0.5, y: 0 } })), ["SITE:u1"]);
});

test("fixed-cell mode changes the contract", () => {
  const moved = mv(GOLD, "D", 6);
  assert.deepEqual(codes(checkPlacement(D, moved, { fixedMode: true })), ["FIXED:D"]);
  assert.equal(checkPlacement(D, moved, { fixedMode: false }).legal, true);
});

test("displacement uses an immutable named reference; average and max are reported", () => {
  const a = mv(seed, "B", 6);
  const b = mv(a, "C", 8); // a second edit
  const r = displacement(D, b, REF);
  assert.equal(r.total, 6);
  assert.equal(r.max, 4);
  assert.equal(r.reference, "overlap seed");
  assert.equal(r.average, 1);
  assert.equal(displacement(D, seed, REF).total, 0);
  assert.equal(displacement(D, b, REF, { includeFixedInDisplacement: false }).n, 5);
});

test("HPWL uses cell centres, which matters for unequal widths", () => {
  // net [E,F] in the seed: E(0,4) w1 centre (0.5,5); F(10,0) w1 centre (10.5,1) -> 10 + 4 = 14
  assert.equal(netHpwl(D, seed, ["E", "F"]), 14);
  // net [A,E]: A(4,2) w2 centre (5,3); E centre (0.5,5) -> 4.5 + 2 = 6.5; lower-left would give 4 + 2 = 6
  assert.equal(netHpwl(D, seed, ["A", "E"]), 6.5);
  assert.equal(netHpwl(D, seed, ["A"]), 0);
  assert.equal(totalHpwl(D, seed).total, 32);
});

test("sum versus max: the jump has the smaller sum but the larger max", () => {
  const d = normalizeDesign(trade);
  const ref = { name: "dropped", placement: trade.reference };
  const j = checkPlacement(d, trade.jump, { reference: ref });
  const s = checkPlacement(d, trade.shift, { reference: ref });
  assert.ok(j.legal && s.legal);
  assert.deepEqual([j.metrics.displacement.total, j.metrics.displacement.max], [4, 4]);
  assert.deepEqual([s.metrics.displacement.total, s.metrics.displacement.max], [8, 2]);
});

test("illegal layouts keep metrics as diagnostics and stay labelled illegal", () => {
  const r = checkPlacement(D, seed, { reference: REF });
  assert.equal(r.verdict, "illegal");
  assert.equal(r.metrics.hpwl.total, 32);
});

test("off-row cells produce rectangle diagnostics, never OVERLAP", () => {
  const p = mv(mv(GOLD, "A", 4, 3), "C", 4, 2);
  const r = checkPlacement(D, p);
  assert.deepEqual(codes(r), ["ROW:A"]);
  assert.deepEqual(r.diagnostics.map((x) => x.cells.join("/")), ["A/C"]);
});
