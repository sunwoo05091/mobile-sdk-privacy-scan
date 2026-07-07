import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { detectFlutter, isFlutterProject } from "../dist/detect/flutter.js";
import { FLUTTER_FIXTURE, RN_FIXTURE, tempDir } from "./_helpers.js";

test("detectFlutter parses every package in pubspec.lock", () => {
  const deps = detectFlutter(FLUTTER_FIXTURE);
  const names = deps.map((d) => d.name).sort();
  assert.deepEqual(names, [
    "build_runner",
    "collection",
    "firebase_analytics",
    "geolocator",
    "geolocator_apple",
    "google_mobile_ads",
    "http",
    "sentry_flutter",
  ]);
  for (const d of deps) {
    assert.equal(d.ecosystem, "pub");
    assert.equal(d.source, "pubspec.lock");
  }
});

test("detectFlutter reads version, direct flag, and dependency scope", () => {
  const deps = detectFlutter(FLUTTER_FIXTURE);
  const firebase = deps.find((d) => d.name === "firebase_analytics");
  assert.equal(firebase.version, "10.8.0");
  assert.equal(firebase.direct, true);
  assert.equal(firebase.scope, "main");

  const transitive = deps.find((d) => d.name === "collection");
  assert.equal(transitive.direct, false);
  assert.equal(transitive.scope, "transitive");

  const dev = deps.find((d) => d.name === "build_runner");
  assert.equal(dev.scope, "dev");
});

test("detectFlutter returns [] when there is no pubspec.lock", () => {
  assert.deepEqual(detectFlutter(RN_FIXTURE), []);
  assert.deepEqual(detectFlutter("/nonexistent/path"), []);
});

test("detectFlutter returns [] on malformed YAML instead of throwing", (t) => {
  const dir = tempDir(t);
  writeFileSync(join(dir, "pubspec.lock"), "packages:\n\tbad: [unclosed");
  assert.deepEqual(detectFlutter(dir), []);
});

test("isFlutterProject keys off pubspec.yaml", () => {
  assert.equal(isFlutterProject(FLUTTER_FIXTURE), true);
  assert.equal(isFlutterProject(RN_FIXTURE), false);
});
