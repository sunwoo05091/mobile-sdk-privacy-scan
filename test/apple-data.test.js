// effectiveAppleData: the single precedence point — harvested manifest data
// replaces KB seed data; multiple manifests for one SDK union together.
import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveAppleData, mergeAppleTypes } from "../dist/appleData.js";
import { resolvedSdk, harvestedManifest } from "./_helpers.js";

const DEVICE_ID = "NSPrivacyCollectedDataTypeDeviceID";
const CRASH = "NSPrivacyCollectedDataTypeCrashData";
const ANALYTICS = "NSPrivacyCollectedDataTypePurposeAnalytics";
const ADS = "NSPrivacyCollectedDataTypePurposeThirdPartyAdvertising";

test("falls back to KB data when nothing was harvested", () => {
  const r = resolvedSdk({
    tracking: true,
    trackingDomains: ["kb.example.com"],
    apple: [{ type: DEVICE_ID, linked: false, tracking: true, purposes: [ANALYTICS] }],
  });
  const eff = effectiveAppleData(r);
  assert.equal(eff.provenance, "kb");
  assert.equal(eff.tracking, true);
  assert.deepEqual(eff.trackingDomains, ["kb.example.com"]);
  assert.deepEqual(eff.apple.map((t) => t.type), [DEVICE_ID]);
});

test("a harvested manifest REPLACES the KB entry's Apple data", () => {
  const r = resolvedSdk({
    tracking: true,
    trackingDomains: ["kb.example.com"],
    apple: [{ type: DEVICE_ID, linked: true, tracking: true, purposes: [ADS] }],
  });
  r.harvested = [
    harvestedManifest({
      tracking: false,
      trackingDomains: [],
      apple: [{ type: CRASH, linked: false, tracking: false, purposes: [ANALYTICS] }],
    }),
  ];

  const eff = effectiveAppleData(r);
  assert.equal(eff.provenance, "manifest");
  assert.equal(eff.tracking, false, "KB tracking must not leak through");
  assert.deepEqual(eff.trackingDomains, []);
  assert.deepEqual(eff.apple.map((t) => t.type), [CRASH], "KB types must not leak through");
});

test("multiple harvested manifests for one SDK union together", () => {
  const r = resolvedSdk({});
  r.harvested = [
    harvestedManifest({
      tracking: false,
      apple: [{ type: DEVICE_ID, linked: false, tracking: false, purposes: [ANALYTICS] }],
    }),
    harvestedManifest({
      tracking: true,
      trackingDomains: ["b.example.com"],
      apple: [{ type: DEVICE_ID, linked: true, tracking: true, purposes: [ADS] }],
    }),
  ];

  const eff = effectiveAppleData(r);
  assert.equal(eff.tracking, true);
  assert.deepEqual(eff.trackingDomains, ["b.example.com"]);
  assert.equal(eff.apple.length, 1);
  assert.equal(eff.apple[0].linked, true);
  assert.equal(eff.apple[0].tracking, true);
  assert.deepEqual(eff.apple[0].purposes.sort(), [ANALYTICS, ADS].sort());
});

test("mergeAppleTypes dedupes by type with OR/union semantics, sorted output", () => {
  const merged = mergeAppleTypes([
    { type: DEVICE_ID, linked: false, tracking: false, purposes: [ANALYTICS] },
    { type: CRASH, linked: false, tracking: false, purposes: [ANALYTICS] },
    { type: DEVICE_ID, linked: true, tracking: true, purposes: [ADS] },
  ]);
  assert.deepEqual(merged.map((t) => t.type), [CRASH, DEVICE_ID]);
  const dev = merged.find((t) => t.type === DEVICE_ID);
  assert.equal(dev.linked, true);
  assert.equal(dev.tracking, true);
  assert.deepEqual(dev.purposes.sort(), [ANALYTICS, ADS].sort());
});

test("mergeAppleTypes does not mutate its inputs", () => {
  const input = { type: DEVICE_ID, linked: false, tracking: false, purposes: [ANALYTICS] };
  mergeAppleTypes([input, { type: DEVICE_ID, linked: true, tracking: true, purposes: [ADS] }]);
  assert.deepEqual(input.purposes, [ANALYTICS]);
  assert.equal(input.linked, false);
});
