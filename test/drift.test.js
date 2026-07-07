import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import plist from "plist";
import { detectDrift } from "../dist/drift.js";
import { resolvedSdk, tempDir } from "./_helpers.js";

const DEVICE_ID = "NSPrivacyCollectedDataTypeDeviceID";
const CRASH = "NSPrivacyCollectedDataTypeCrashData";
const HEALTH = "NSPrivacyCollectedDataTypeHealth";

function writeManifest(dir, { types = [], tracking = false } = {}) {
  const path = join(dir, "PrivacyInfo.xcprivacy");
  writeFileSync(
    path,
    plist.build({
      NSPrivacyTracking: tracking,
      NSPrivacyCollectedDataTypes: types.map((t) => ({
        NSPrivacyCollectedDataType: t,
        NSPrivacyCollectedDataTypeLinked: false,
        NSPrivacyCollectedDataTypeTracking: false,
        NSPrivacyCollectedDataTypePurposes: ["NSPrivacyCollectedDataTypePurposeAnalytics"],
      })),
    }),
  );
  return path;
}

const trackerSdk = () =>
  resolvedSdk({
    id: "tracker",
    tracking: true,
    trackingDomains: ["tracker.example.com"],
    apple: [
      { type: DEVICE_ID, linked: true, tracking: true, purposes: ["NSPrivacyCollectedDataTypePurposeAnalytics"] },
      { type: CRASH, linked: false, tracking: false, purposes: ["NSPrivacyCollectedDataTypePurposeAppFunctionality"] },
    ],
  });

test("flags collected-but-undeclared types as missing", (t) => {
  const manifest = writeManifest(tempDir(t), { types: [CRASH], tracking: true });
  const drift = detectDrift(manifest, [trackerSdk()]);
  assert.deepEqual(drift.missing, [DEVICE_ID]);
  assert.deepEqual(drift.extra, []);
});

test("flags declared-but-unaccounted types as extra", (t) => {
  const manifest = writeManifest(tempDir(t), {
    types: [DEVICE_ID, CRASH, HEALTH],
    tracking: true,
  });
  const drift = detectDrift(manifest, [trackerSdk()]);
  assert.deepEqual(drift.missing, []);
  assert.deepEqual(drift.extra, [HEALTH]);
});

test("reports tracking mismatch in both directions", (t) => {
  const dir = tempDir(t);

  const underDeclared = writeManifest(dir, { types: [DEVICE_ID, CRASH], tracking: false });
  const drift1 = detectDrift(underDeclared, [trackerSdk()]);
  assert.deepEqual(drift1.trackingMismatch, { declared: false, detected: true });

  const overDeclared = writeManifest(dir, { types: [], tracking: true });
  const drift2 = detectDrift(overDeclared, [resolvedSdk({ id: "quiet" })]);
  assert.deepEqual(drift2.trackingMismatch, { declared: true, detected: false });
});

test("no drift when declarations exactly cover the scan", (t) => {
  const manifest = writeManifest(tempDir(t), {
    types: [DEVICE_ID, CRASH],
    tracking: true,
  });
  const drift = detectDrift(manifest, [trackerSdk()]);
  assert.deepEqual(drift, { missing: [], extra: [] });
  assert.ok(!("trackingMismatch" in drift));
});

test("drift judges against harvested data when an SDK ships its own manifest", async (t) => {
  const { harvestedManifest } = await import("./_helpers.js");
  // KB claims DeviceID, but the SDK's own manifest says only CrashData.
  const r = trackerSdk();
  r.harvested = [
    harvestedManifest({
      tracking: false,
      apple: [{ type: CRASH, linked: false, tracking: false, purposes: ["NSPrivacyCollectedDataTypePurposeAppFunctionality"] }],
    }),
  ];

  const manifest = writeManifest(tempDir(t), { types: [CRASH], tracking: false });
  const drift = detectDrift(manifest, [r]);
  assert.deepEqual(drift.missing, [], "KB's DeviceID must not count as missing");
  assert.ok(!("trackingMismatch" in drift), "harvested tracking=false matches declared");
});

test("a manifest with no NSPrivacyCollectedDataTypes key at all", (t) => {
  const dir = tempDir(t);
  const path = join(dir, "PrivacyInfo.xcprivacy");
  writeFileSync(path, plist.build({ NSPrivacyTracking: false }));
  const drift = detectDrift(path, [trackerSdk()]);
  assert.deepEqual(drift.missing, [CRASH, DEVICE_ID]);
});
