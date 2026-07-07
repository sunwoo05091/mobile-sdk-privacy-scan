// Possibly-unused dependency detection: a declared package with no import in
// the app's own source. Privacy angle: an unused data-collecting SDK still
// forces manifest declarations and ships in the binary.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findUnusedDependencies } from "../dist/unused.js";
import { scanProject } from "../dist/detect/index.js";
import { FLUTTER_FIXTURE, RN_FIXTURE, tempDir } from "./_helpers.js";

test("Flutter: declared-but-never-imported package is flagged", () => {
  const result = scanProject(FLUTTER_FIXTURE);
  const unused = findUnusedDependencies(FLUTTER_FIXTURE, result);
  const names = unused.map((u) => u.package);
  assert.ok(names.includes("http"), "http is never imported in lib/");
  assert.ok(!names.includes("firebase_analytics"), "imported in main.dart");
  assert.ok(!names.includes("geolocator"), "imported in main.dart");
});

test("RN: unused KB-known SDK is flagged as a known data collector", () => {
  const result = scanProject(RN_FIXTURE);
  const unused = findUnusedDependencies(RN_FIXTURE, result);
  const byName = new Map(unused.map((u) => [u.package, u]));

  assert.ok(byName.has("axios"));
  assert.equal(byName.get("axios").knownSdk, false);

  const af = byName.get("react-native-appsflyer");
  assert.ok(af, "appsflyer is declared but never imported");
  assert.equal(af.knownSdk, true, "it resolves in the KB — privacy liability");

  assert.ok(!byName.has("@react-native-firebase/analytics"), "imported");
  assert.ok(!byName.has("react-native-fs"), "required() counts as an import");
  assert.ok(!byName.has("react-native"), "the framework itself is exempt");
});

test("projects without readable source are skipped entirely", (t) => {
  const dir = tempDir(t);
  const result = { detected: [], resolved: [] };
  assert.deepEqual(findUnusedDependencies(dir, result), []);
});

test("directly pinned platform shards are not flagged (never imported by design)", () => {
  const scan = {
    detected: [
      { name: "geolocator", ecosystem: "pub", direct: true, scope: "main", source: "pubspec.lock" },
      { name: "geolocator_android", ecosystem: "pub", direct: true, scope: "main", source: "pubspec.lock" },
    ],
    resolved: [],
  };
  const names = findUnusedDependencies(FLUTTER_FIXTURE, scan).map((u) => u.package);
  assert.ok(!names.includes("geolocator_android"));
  assert.ok(!names.includes("geolocator"), "imported in fixture main.dart");
});

test("dev and transitive dependencies are not checked", () => {
  const result = scanProject(FLUTTER_FIXTURE);
  const names = findUnusedDependencies(FLUTTER_FIXTURE, result).map(
    (u) => u.package,
  );
  assert.ok(!names.includes("build_runner"), "dev tool, not shipped");
  assert.ok(!names.includes("collection"), "transitive, not the app's choice");
});
