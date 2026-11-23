// Property-based / metamorphic tests with fast-check (fixed seed for reproducibility).
import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { checkPlacement, displacement, totalHpwl } from "../../src/core/legality.js";
import { abacus } from "../../src/core/repair.js";

const SEED = 20261123;
const instance = fc
  .record({
    siteW: fc.constantFrom(1, 0.5, 0.19, 2),
    nSites: fc.integer({ min: 4, max: 14 }),
    nRows: fc.integer({ min: 1, max: 4 }),
    rowH: fc.constantFrom(1, 2),
    widths: fc.array(fc.integer({ min: 1, max: 3 }), { minLength: 1, maxLength: 6 }),
  })
  .chain((g) =>
    fc.record({
      g: fc.constant(g),
      ks: fc.array(fc.integer({ min: -1, max: g.nSites }), { minLength: g.widths.length, maxLength: g.widths.length }),
      rs: fc.array(fc.integer({ min: 0, max: g.nRows + 1 }), { minLength: g.widths.length, maxLength: g.widths.length }),
    }),
  )
  .map(({ g, ks, rs }) => {
    const ids = g.widths.map((_, i) => String.fromCharCode(65 + i));
    const rows = Array.from({ length: g.nRows }, (_, r) => r * g.rowH);
    const design = {
      chip: { W: +(g.nSites * g.siteW).toFixed(9), H: g.nRows * g.rowH, siteW: g.siteW, rowH: g.rowH, rows },
      cells: ids.map((id, i) => ({ id, width: g.widths[i] * g.siteW })),
      nets: [ids.slice(0, 2), ids],
    };
    const pos = Object.fromEntries(ids.map((id, i) => [id, { x: +(ks[i] * g.siteW).toFixed(9), y: rs[i] <= g.nRows ? rs[i] * g.rowH : g.rowH / 2 }]));
    return { design, pos };
  });
const ms = (r) => r.violations.map((v) => v.code + ":" + [...v.cells].sort().join("/")).sort();

test("verdict does not depend on cell order", () => {
  fc.assert(fc.property(instance, ({ design, pos }) => {
    const rev = { ...design, cells: design.cells.slice().reverse() };
    assert.deepEqual(ms(checkPlacement(design, pos)), ms(checkPlacement(rev, pos)));
  }), { seed: SEED, numRuns: 500 });
});

test("mirroring the die mirrors the verdict", () => {
  fc.assert(fc.property(instance, ({ design, pos }) => {
    const w = Object.fromEntries(design.cells.map((c) => [c.id, c.width]));
    const m = Object.fromEntries(Object.entries(pos).map(([k, p]) => [k, { x: +(design.chip.W - p.x - w[k]).toFixed(9), y: p.y }]));
    assert.deepEqual(ms(checkPlacement(design, pos)), ms(checkPlacement(design, m)));
  }), { seed: SEED, numRuns: 500 });
});

test("displacement(ref, ref) = 0 and adding a net never lowers HPWL", () => {
  fc.assert(fc.property(instance, ({ design, pos }) => {
    assert.equal(displacement(design, pos, { name: "r", placement: pos }).total, 0);
    const more = { ...design, nets: [...design.nets, [design.cells[0].id, design.cells.at(-1).id]] };
    assert.ok(totalHpwl(more, pos).total >= totalHpwl(design, pos).total - 1e-9);
  }), { seed: SEED, numRuns: 500 });
});

test("Abacus output is legal whenever it succeeds", () => {
  fc.assert(fc.property(instance, ({ design, pos }) => {
    let p;
    try { p = abacus(design, pos); } catch { return; }
    assert.equal(checkPlacement(design, p).verdict, "legal");
  }), { seed: SEED, numRuns: 500 });
});
