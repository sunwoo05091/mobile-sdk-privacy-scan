import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPlayRows,
  generatePlayMarkdown,
} from "../dist/generate/playDataSafety.js";
import { resolvedSdk } from "./_helpers.js";

test("merges identical category|type rows across SDKs", () => {
  const a = resolvedSdk({
    id: "a",
    name: "SDK A",
    play: [
      { category: "Device or other IDs", type: "Device or other IDs", collected: true, shared: false, purposes: ["Analytics"] },
    ],
  });
  const b = resolvedSdk({
    id: "b",
    name: "SDK B",
    play: [
      { category: "Device or other IDs", type: "Device or other IDs", collected: true, shared: true, purposes: ["Advertising or marketing"] },
    ],
  });

  const rows = buildPlayRows([a, b]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].collected, true);
  assert.equal(rows[0].shared, true, "shared is OR-merged");
  assert.deepEqual(rows[0].purposes.sort(), ["Advertising or marketing", "Analytics"]);
  assert.deepEqual(rows[0].from.sort(), ["SDK A", "SDK B"]);
});

test("rows are sorted by category then type", () => {
  const sdk = resolvedSdk({
    id: "s",
    play: [
      { category: "Location", type: "Approximate location", collected: true, shared: false, purposes: ["Ads"] },
      { category: "App activity", type: "Crash logs", collected: true, shared: false, purposes: ["App functionality"] },
      { category: "App activity", type: "App interactions", collected: true, shared: false, purposes: ["Analytics"] },
    ],
  });
  const keys = buildPlayRows([sdk]).map((r) => `${r.category}|${r.type}`);
  assert.deepEqual(keys, [
    "App activity|App interactions",
    "App activity|Crash logs",
    "Location|Approximate location",
  ]);
});

test("markdown renders a review-disclaimer and one table row per entry", () => {
  const sdk = resolvedSdk({
    id: "s",
    name: "SDK S",
    play: [
      { category: "Location", type: "Approximate location", collected: true, shared: false, purposes: ["Ads"] },
    ],
  });
  const md = generatePlayMarkdown(buildPlayRows([sdk]));
  assert.match(md, /draft/i);
  assert.match(md, /\| Location \| Approximate location \| Yes \| No \| Ads \| SDK S \|/);
});
