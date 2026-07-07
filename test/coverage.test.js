// A compliance tool must never be silently blind: layers that cannot be
// scanned are reported loudly instead of producing confident partial output.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { scanProject } from "../dist/detect/index.js";
import { FLUTTER_FIXTURE, RN_FIXTURE, tempDir } from "./_helpers.js";

const byLayer = (result) =>
  new Map(result.coverage.map((c) => [c.layer, c]));

test("RN fixture: every layer is covered", () => {
  const cov = byLayer(scanProject(RN_FIXTURE));
  for (const [layer, c] of cov) assert.equal(c.ok, true, layer);
});

test("Flutter fixture: android/ project missing is loudly reported", () => {
  const cov = byLayer(scanProject(FLUTTER_FIXTURE));
  assert.equal(cov.get("Flutter packages (pubspec.lock)").ok, true);
  assert.equal(cov.get("iOS native pods (Podfile.lock)").ok, true);
  assert.equal(cov.get("Android dependencies (build.gradle)").ok, false);
});

test("Expo managed app: native layers flagged with a prebuild hint", (t) => {
  const dir = tempDir(t);
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "expo-demo",
      dependencies: { expo: "~51.0.0", "react-native-appsflyer": "^6.15.1" },
    }),
  );

  const result = scanProject(dir);
  assert.deepEqual(result.projectType, ["react-native"]);

  const cov = byLayer(result);
  const pods = cov.get("iOS native pods (Podfile.lock)");
  assert.equal(pods.ok, false);
  assert.match(pods.hint, /expo prebuild/);
  const gradle = cov.get("Android dependencies (build.gradle)");
  assert.equal(gradle.ok, false);
  assert.match(gradle.hint, /expo prebuild/);
});

test("Flutter project without pubspec.lock is flagged, not silently empty", (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, "pubspec.yaml"), "name: demo\n");
  mkdirSync(join(dir, "lib"), { recursive: true });

  const result = scanProject(dir);
  const cov = byLayer(result);
  assert.equal(cov.get("Flutter packages (pubspec.lock)").ok, false);
  assert.match(cov.get("Flutter packages (pubspec.lock)").hint, /flutter pub get/);
});

test("non-mobile directories get no coverage noise", () => {
  assert.deepEqual(scanProject("/nonexistent/path").coverage, []);
});
