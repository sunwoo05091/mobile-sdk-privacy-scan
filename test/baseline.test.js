// Committed privacy baseline: lockfile semantics — collection expansion
// fails CI until the team re-baselines deliberately.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildBaseline, diffBaseline } from "../dist/baseline.js";
import { resolvedSdk, harvestedManifest, CLI, RN_FIXTURE, tempDir } from "./_helpers.js";

const DEVICE_ID = "NSPrivacyCollectedDataTypeDeviceID";

test("buildBaseline snapshots sdks, types, tracking and uncovered reasons", () => {
  const r = resolvedSdk({
    id: "tracker",
    tracking: true,
    trackingDomains: ["t.example.com"],
    apple: [{ type: DEVICE_ID, linked: true, tracking: true, purposes: ["P"] }],
  });
  const b = buildBaseline(
    [r],
    [{ type: "NSPrivacyCollectedDataTypePreciseLocation", linked: false, tracking: false, purposes: [] }],
    [{ package: "x", ecosystem: "npm", category: "NSPrivacyAccessedAPICategoryFileTimestamp", reasons: [], note: "", covered: false }],
  );
  assert.deepEqual(b.sdks, ["tracker"]);
  assert.equal(b.tracking, true);
  assert.deepEqual(b.appleTypes, [DEVICE_ID, "NSPrivacyCollectedDataTypePreciseLocation"].sort());
  assert.deepEqual(b.uncoveredReasonCategories, ["NSPrivacyAccessedAPICategoryFileTimestamp"]);
});

test("diffBaseline: expansion flags on, shrinkage is informational", () => {
  const base = {
    schemaVersion: 1, sdks: ["a"], tracking: false, trackingDomains: [],
    appleTypes: [DEVICE_ID], uncoveredReasonCategories: [],
  };
  const grown = { ...base, sdks: ["a", "b"], tracking: true };
  const d1 = diffBaseline(base, grown);
  assert.deepEqual(d1.addedSdks, ["b"]);
  assert.equal(d1.trackingTurnedOn, true);
  assert.equal(d1.expanded, true);

  const shrunk = { ...base, appleTypes: [] };
  const d2 = diffBaseline(base, shrunk);
  assert.deepEqual(d2.removedTypes, [DEVICE_ID]);
  assert.equal(d2.expanded, false, "removing collection never fails CI");
});

test("CLI: write baseline, clean re-scan passes, expansion fails with exit 1", (t) => {
  const project = join(tempDir(t), "app");
  cpSync(RN_FIXTURE, project, { recursive: true });
  const out = join(tempDir(t), "out");
  const env = { ...process.env, NO_COLOR: "1" };
  delete env.FORCE_COLOR;
  const run = (...args) =>
    spawnSync(process.execPath, [CLI, project, "--out", out, ...args], { encoding: "utf8", env });

  // 1. acknowledge current posture
  const write = run("--update-baseline");
  assert.equal(write.status, 0, write.stdout);
  assert.match(write.stdout, /Baseline written/);
  const baseline = JSON.parse(readFileSync(join(project, ".privacy-baseline.json"), "utf8"));
  assert.ok(baseline.appleTypes.includes(DEVICE_ID));

  // 2. nothing changed -> no delta, exit 0
  const clean = run();
  assert.equal(clean.status, 0, clean.stdout);
  assert.match(clean.stdout, /no change in privacy posture/);

  // 3. simulate an older baseline that never knew about DeviceID -> expansion
  baseline.appleTypes = baseline.appleTypes.filter((t2) => t2 !== DEVICE_ID);
  baseline.sdks = baseline.sdks.filter((s) => s !== "appsflyer");
  writeFileSync(join(project, ".privacy-baseline.json"), JSON.stringify(baseline));
  const expanded = run();
  assert.equal(expanded.status, 1, "expansion must fail CI");
  assert.match(expanded.stdout, /Collection EXPANDED/);
  assert.match(expanded.stdout, /\+ SDKs: appsflyer/);
});
