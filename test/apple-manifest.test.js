import { test } from "node:test";
import assert from "node:assert/strict";
import plist from "plist";
import { generateAppleManifest } from "../dist/generate/appleManifest.js";
import { resolvedSdk, harvestedManifest } from "./_helpers.js";

const DEVICE_ID = "NSPrivacyCollectedDataTypeDeviceID";
const CRASH = "NSPrivacyCollectedDataTypeCrashData";
const ANALYTICS = "NSPrivacyCollectedDataTypePurposeAnalytics";
const ADS = "NSPrivacyCollectedDataTypePurposeThirdPartyAdvertising";

test("merges the same data type across SDKs: purposes union, linked/tracking OR", () => {
  const a = resolvedSdk({
    id: "a",
    apple: [{ type: DEVICE_ID, linked: false, tracking: false, purposes: [ANALYTICS] }],
  });
  const b = resolvedSdk({
    id: "b",
    tracking: true,
    trackingDomains: ["b.example.com"],
    apple: [{ type: DEVICE_ID, linked: true, tracking: true, purposes: [ADS] }],
  });

  const doc = plist.parse(generateAppleManifest([a, b]));
  assert.equal(doc.NSPrivacyCollectedDataTypes.length, 1);

  const merged = doc.NSPrivacyCollectedDataTypes[0];
  assert.equal(merged.NSPrivacyCollectedDataType, DEVICE_ID);
  assert.equal(merged.NSPrivacyCollectedDataTypeLinked, true);
  assert.equal(merged.NSPrivacyCollectedDataTypeTracking, true);
  assert.deepEqual(
    [...merged.NSPrivacyCollectedDataTypePurposes].sort(),
    [ANALYTICS, ADS].sort(),
  );
});

test("NSPrivacyTracking is true iff any SDK tracks; domains are deduped + sorted", () => {
  const tracker1 = resolvedSdk({
    id: "t1",
    tracking: true,
    trackingDomains: ["z.example.com", "a.example.com"],
  });
  const tracker2 = resolvedSdk({
    id: "t2",
    tracking: true,
    trackingDomains: ["a.example.com"],
  });
  const doc = plist.parse(generateAppleManifest([tracker1, tracker2]));
  assert.equal(doc.NSPrivacyTracking, true);
  assert.deepEqual(doc.NSPrivacyTrackingDomains, ["a.example.com", "z.example.com"]);

  const quiet = plist.parse(generateAppleManifest([resolvedSdk({ id: "q" })]));
  assert.equal(quiet.NSPrivacyTracking, false);
  assert.deepEqual(quiet.NSPrivacyTrackingDomains, []);
});

test("collected data types are sorted for a stable, diffable manifest", () => {
  const sdk = resolvedSdk({
    id: "s",
    apple: [
      { type: DEVICE_ID, linked: false, tracking: false, purposes: [ANALYTICS] },
      { type: CRASH, linked: false, tracking: false, purposes: [ANALYTICS] },
    ],
  });
  const doc = plist.parse(generateAppleManifest([sdk]));
  const types = doc.NSPrivacyCollectedDataTypes.map((t) => t.NSPrivacyCollectedDataType);
  assert.deepEqual(types, [CRASH, DEVICE_ID]);
});

test("empty scan yields a valid, empty manifest", () => {
  const doc = plist.parse(generateAppleManifest([]));
  assert.equal(doc.NSPrivacyTracking, false);
  assert.deepEqual(doc.NSPrivacyCollectedDataTypes, []);
  assert.deepEqual(doc.NSPrivacyAccessedAPITypes, []);
});

test("harvested manifest data replaces KB data in the aggregate", () => {
  const r = resolvedSdk({
    tracking: true,
    trackingDomains: ["kb.example.com"],
    apple: [{ type: DEVICE_ID, linked: true, tracking: true, purposes: [ADS] }],
  });
  r.harvested = [
    harvestedManifest({
      tracking: true,
      trackingDomains: ["manifest.example.com"],
      apple: [{ type: CRASH, linked: false, tracking: false, purposes: [ANALYTICS] }],
    }),
  ];

  const doc = plist.parse(generateAppleManifest([r]));
  const types = doc.NSPrivacyCollectedDataTypes.map((t) => t.NSPrivacyCollectedDataType);
  assert.deepEqual(types, [CRASH], "KB-only types must not appear");
  assert.deepEqual(doc.NSPrivacyTrackingDomains, ["manifest.example.com"]);
});

test("the empty NSPrivacyAccessedAPITypes carries a warning comment and stays parseable", () => {
  const xml = generateAppleManifest([resolvedSdk({})]);
  assert.match(xml, /ITMS-91053/);
  assert.match(
    xml,
    /<!--[\s\S]*?-->\s*<key>NSPrivacyAccessedAPITypes<\/key>/,
    "comment sits directly above the key",
  );
  // Comments must not break consumers.
  assert.deepEqual(plist.parse(xml).NSPrivacyAccessedAPITypes, []);
});
