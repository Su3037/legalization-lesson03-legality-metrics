// Evaluate a list of {design, placement, fixedMode} with the JS checker; prints semantic results.
import { readFileSync } from "node:fs";
import { checkPlacement, semantic } from "../../src/core/legality.js";
const items = JSON.parse(readFileSync(process.argv[2], "utf8"), (k, v) => (v === "NaN" ? NaN : v));
console.log(JSON.stringify(items.map((it) => semantic(checkPlacement(it.design, it.placement, { fixedMode: true })))));
