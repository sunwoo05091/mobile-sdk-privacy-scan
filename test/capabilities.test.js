// Capability hints from three independent signals: capability packages,
// iOS Info.plist usage-description keys, AndroidManifest permissions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectCapabilities, capabilityAppleTypes } from "../dist/capabilities.js";
import { scanProject } from "../dist/detect/index.js";
import { FLUTTER_FIXTURE, RN_FIXTURE } from "./_helpers.js";

test("package and Info.plist evidence merge into one location hint", () => {
  const result = scanProject(FLUTTER_FIXTURE);
  const hints = detectCapabilities(result, FLUTTER_FIXTURE);

  const loc = hints.find((h) => /location \(precise\)/i.test(h.collects));
  assert.ok(loc);
  assert.ok(loc.evidence.includes("package geolocator"));
  assert.ok(
    loc.evidence.includes("Info.plist NSLocationWhenInUseUsageDescription"),
  );
  assert.equal(
    hints.filter((h) => /location \(precise\)/i.test(h.collects)).length,
    1,
    "same collection shape must not appear twice",
  );
});

test("Info.plist catches capabilities with no known package (camera)", () => {
  const result = scanProject(FLUTTER_FIXTURE);
  const hints = detectCapabilities(result, FLUTTER_FIXTURE);
  const cam = hints.find((h) => /camera/i.test(h.collects));
  assert.ok(cam, "no camera package in the fixture — only the plist key");
  assert.deepEqual(cam.evidence, ["Info.plist NSCameraUsageDescription"]);
});

test("AndroidManifest permissions catch capabilities on the RN side", () => {
  const result = scanProject(RN_FIXTURE);
  const hints = detectCapabilities(result, RN_FIXTURE);
  const audio = hints.find((h) => /audio/i.test(h.collects));
  assert.ok(audio);
  assert.deepEqual(audio.evidence, ["AndroidManifest RECORD_AUDIO"]);
});

test("without a projectRoot only package evidence is used", () => {
  const result = scanProject(RN_FIXTURE);
  assert.deepEqual(detectCapabilities(result), []);
});

test("capabilityAppleTypes dedupes into reviewable draft entries", () => {
  const hints = [
    { collects: "a", appleTypes: ["NSPrivacyCollectedDataTypePreciseLocation"], play: [], evidence: ["x"] },
    { collects: "b", appleTypes: ["NSPrivacyCollectedDataTypePreciseLocation"], play: [], evidence: ["y"] },
  ];
  const types = capabilityAppleTypes(hints);
  assert.equal(types.length, 1);
  assert.equal(types[0].type, "NSPrivacyCollectedDataTypePreciseLocation");
  assert.equal(types[0].linked, false);
  assert.deepEqual(types[0].purposes, ["NSPrivacyCollectedDataTypePurposeAppFunctionality"]);
});
