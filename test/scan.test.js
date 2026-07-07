import { test } from "node:test";
import assert from "node:assert/strict";
import { scanProject } from "../dist/detect/index.js";
import { FLUTTER_FIXTURE, RN_FIXTURE } from "./_helpers.js";

test("scanProject on the Flutter fixture", () => {
  const result = scanProject(FLUTTER_FIXTURE);
  assert.deepEqual(result.projectType, ["flutter"]);

  const resolvedIds = result.resolved.map((r) => r.entry.id).sort();
  assert.deepEqual(resolvedIds, ["firebase-analytics", "google-admob", "sentry"]);

  // Noise classification: only unmatched DIRECT MAIN deps surface for review.
  // collection (transitive), build_runner (dev) and geolocator_apple
  // (platform shard of geolocator) are counted, not listed.
  const unknownNames = result.unknown.map((d) => d.name).sort();
  assert.deepEqual(unknownNames, ["geolocator", "http"]);
  assert.deepEqual(result.suppressed, {
    dev: 1,
    transitive: 1,
    shards: 1,
    utilities: 0,
  });
});

test("scanProject on the RN fixture resolves each SDK once across layers", () => {
  const result = scanProject(RN_FIXTURE);
  assert.deepEqual(result.projectType, ["react-native"]);

  // firebase-analytics appears in npm AND pod layers; appsflyer in npm AND pod.
  // Each must resolve to exactly one entry. AcmeAnalytics is not in the KB but
  // ships its own PrivacyInfo.xcprivacy → synthetic harvested entry.
  const resolvedIds = result.resolved.map((r) => r.entry.id).sort();
  assert.deepEqual(resolvedIds, [
    "appsflyer",
    "facebook-sdk",
    "firebase-analytics",
    "harvested:AcmeAnalytics",
  ]);
});

test("harvested manifests attach to the KB-resolved SDK that owns them", () => {
  const result = scanProject(RN_FIXTURE);
  const fb = result.resolved.find((r) => r.entry.id === "facebook-sdk");
  assert.equal(fb.harvested?.length, 1);
  assert.ok(fb.harvested[0].path.endsWith("FBSDKCoreKit/PrivacyInfo.xcprivacy"));
  assert.deepEqual(fb.harvested[0].owner, { ecosystem: "pod", name: "FBSDKCoreKit" });

  // SDKs without a shipped manifest stay KB-only.
  const af = result.resolved.find((r) => r.entry.id === "appsflyer");
  assert.equal(af.harvested, undefined);
});

test("a synthetic harvested-only SDK carries the manifest and no Play data", () => {
  const result = scanProject(RN_FIXTURE);
  const mp = result.resolved.find((r) => r.entry.id === "harvested:AcmeAnalytics");
  assert.equal(mp.entry.name, "AcmeAnalytics");
  assert.deepEqual(mp.entry.play, []);
  assert.match(mp.entry.source, /harvested from/);
  assert.equal(mp.harvested?.length, 1);
  assert.equal(mp.dependency.name, "AcmeAnalytics");
});

test("scanProject filters framework noise out of unknown, keeps real deps", () => {
  const result = scanProject(RN_FIXTURE);
  const unknownNames = result.unknown.map((d) => d.name);

  assert.ok(unknownNames.includes("axios"));
  assert.ok(!unknownNames.includes("react-native"), "the framework itself is not an SDK");
  assert.ok(
    !unknownNames.includes("AcmeAnalytics"),
    "a dep covered by its own harvested manifest is no longer unknown",
  );

  // KNOWN GAP (documented): the KB has no gradle aliases yet, so Android
  // artifacts of SDKs we DO know fall into unknown instead of resolving.
  assert.ok(unknownNames.includes("com.google.firebase:firebase-analytics"));
});

test("scanProject on a directory that is neither Flutter nor RN", () => {
  const result = scanProject("/nonexistent/path");
  assert.deepEqual(result.projectType, []);
  assert.deepEqual(result.detected, []);
  assert.deepEqual(result.resolved, []);
  assert.deepEqual(result.unknown, []);
  assert.deepEqual(result.harvestedManifests, []);
  assert.deepEqual(result.harvestErrors, []);
});

test("Flutter iOS layer: pods dedupe against pub, .symlinks manifests attach", () => {
  const result = scanProject(FLUTTER_FIXTURE);

  // ios/Podfile.lock pods (Firebase/Analytics, Sentry) resolve to the same
  // KB entries as their pub packages — still exactly three resolved SDKs.
  const resolvedIds = result.resolved.map((r) => r.entry.id).sort();
  assert.deepEqual(resolvedIds, ["firebase-analytics", "google-admob", "sentry"]);

  // The sentry_flutter plugin manifest under ios/.symlinks is harvested,
  // attributed to pub, and attached to the sentry entry.
  assert.equal(result.harvestedManifests.length, 1);
  const sentry = result.resolved.find((r) => r.entry.id === "sentry");
  assert.equal(sentry.harvested?.length, 1);
  assert.deepEqual(sentry.harvested[0].owner, {
    ecosystem: "pub",
    name: "sentry_flutter",
  });
  assert.deepEqual(result.harvestErrors, []);
});
