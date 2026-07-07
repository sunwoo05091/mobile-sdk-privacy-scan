// Offline unit tests for the KB bootstrap tool's pure logic (tools/kb-lib.mjs).
// The network orchestration in kb-build.mjs is exercised manually / in CI jobs.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cdnShard,
  podspecUrl,
  parentPod,
  pickLatestVersion,
  selectManifestPaths,
  diffAppleData,
  applyAppleData,
} from "../tools/kb-lib.mjs";

test("cdnShard matches CocoaPods md5 sharding", () => {
  assert.deepEqual(cdnShard("AFNetworking"), ["a", "7", "5"]);
  assert.deepEqual(cdnShard("Sentry"), ["a", "b", "d"]);
});

test("podspecUrl builds the CDN path", () => {
  assert.equal(
    podspecUrl("Sentry", "8.36.0"),
    "https://cdn.cocoapods.org/Specs/a/b/d/Sentry/8.36.0/Sentry.podspec.json",
  );
});

test("parentPod strips subspecs", () => {
  assert.equal(parentPod("Firebase/Analytics"), "Firebase");
  assert.equal(parentPod("Sentry"), "Sentry");
});

test("pickLatestVersion prefers highest stable, numeric compare", () => {
  assert.equal(pickLatestVersion(["1.2.0", "1.10.0", "2.0.0-beta.1"]), "1.10.0");
  assert.equal(pickLatestVersion(["10.9.0", "10.29.0", "9.99.99"]), "10.29.0");
  assert.equal(pickLatestVersion(["2.0.0-rc.1", "2.0.0-beta.2"]), "2.0.0-rc.1");
  assert.equal(pickLatestVersion([]), undefined);
});

test("selectManifestPaths prefers paths mentioning the pod, ignoring separators", () => {
  const paths = [
    "/x/GoogleMobileAds.xcframework/PrivacyInfo.xcprivacy",
    "/x/UserMessagingPlatform.xcframework/PrivacyInfo.xcprivacy",
  ];
  assert.deepEqual(selectManifestPaths(paths, "Google-Mobile-Ads-SDK").length, 0 + 1);
  assert.deepEqual(selectManifestPaths(paths, "Google-Mobile-Ads-SDK"), [paths[0]]);
  // no match -> keep everything rather than dropping data
  assert.deepEqual(selectManifestPaths(paths, "SomethingElse"), paths);
});

test("selectManifestPaths splits camelCase so product dirs beat family dirs", () => {
  // firebase-ios-sdk source zip: FirebaseCrashlytics must pick Crashlytics/…,
  // not every path that merely says "Firebase".
  const paths = [
    "/repo/Crashlytics/Resources/PrivacyInfo.xcprivacy",
    "/repo/FirebaseAuth/Sources/Resources/PrivacyInfo.xcprivacy",
    "/repo/FirebaseCore/Sources/Resources/PrivacyInfo.xcprivacy",
  ];
  assert.deepEqual(selectManifestPaths(paths, "FirebaseCrashlytics"), [paths[0]]);
});

const baseEntry = {
  id: "x",
  name: "X",
  aliases: { pod: ["X"] },
  tracking: false,
  trackingDomains: [],
  apple: [
    { type: "A", linked: false, tracking: false, purposes: ["P1"] },
  ],
  play: [{ category: "c", type: "t", collected: true, shared: false, purposes: ["p"] }],
  source: "SEED",
};

test("diffAppleData reports added/removed types and changed flags", () => {
  const fresh = {
    apple: [
      { type: "A", linked: true, tracking: false, purposes: ["P1", "P2"] },
      { type: "B", linked: false, tracking: false, purposes: ["P1"] },
    ],
    tracking: true,
    trackingDomains: ["d.example.com"],
  };
  const changes = diffAppleData(baseEntry, fresh);
  assert.ok(changes.includes("+ type B"));
  assert.ok(changes.includes("~ A linked false -> true"));
  assert.ok(changes.includes("~ A purposes [P1] -> [P1,P2]"));
  assert.ok(changes.includes("~ tracking false -> true"));
  assert.ok(changes.includes("+ domain d.example.com"));
});

test("diffAppleData is empty when nothing changed", () => {
  const fresh = {
    apple: baseEntry.apple,
    tracking: false,
    trackingDomains: [],
  };
  assert.deepEqual(diffAppleData(baseEntry, fresh), []);
});

test("applyAppleData replaces Apple data, stamps provenance, keeps Play data", () => {
  const fresh = {
    apple: [{ type: "B", linked: false, tracking: false, purposes: ["P1"] }],
    tracking: true,
    trackingDomains: ["z.com", "a.com"],
  };
  const updated = applyAppleData(baseEntry, fresh, {
    verifiedPods: ["X 1.2.3"],
    stamp: "2026-07",
  });
  assert.deepEqual(updated.apple.map((t) => t.type), ["B"]);
  assert.equal(updated.tracking, true);
  assert.deepEqual(updated.trackingDomains, ["a.com", "z.com"]);
  assert.equal(updated.lastVerified, "2026-07");
  assert.match(updated.source, /PrivacyInfo\.xcprivacy from X 1\.2\.3/);
  assert.deepEqual(updated.play, baseEntry.play, "Play side is curated, not touched");
  assert.equal(baseEntry.apple[0].type, "A", "input entry not mutated");
});
