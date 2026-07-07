// Reverse permission check: capability package present but the Info.plist
// usage string is missing -> runtime crash + App Review rejection material.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkIosPermissionStrings } from "../dist/capabilities.js";
import { scanProject } from "../dist/detect/index.js";
import { FLUTTER_FIXTURE, tempDir } from "./_helpers.js";

function appWithPlist(t, plistBody) {
  const dir = tempDir(t);
  mkdirSync(join(dir, "ios", "Runner"), { recursive: true });
  writeFileSync(
    join(dir, "ios", "Runner", "Info.plist"),
    `<?xml version="1.0"?><plist version="1.0"><dict>${plistBody}</dict></plist>`,
  );
  return dir;
}

const dep = (name) => ({
  name, ecosystem: "pub", direct: true, scope: "main", source: "pubspec.lock",
});

test("record without NSMicrophoneUsageDescription is flagged", (t) => {
  const dir = appWithPlist(t, "<key>CFBundleName</key><string>x</string>");
  const warnings = checkIosPermissionStrings({ detected: [dep("record")] }, dir, false);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].missingKey, "NSMicrophoneUsageDescription");
  assert.match(warnings[0].because[0], /record/);
});

test("any accepted alternative key satisfies the requirement", (t) => {
  const dir = appWithPlist(
    t,
    "<key>NSLocationAlwaysAndWhenInUseUsageDescription</key><string>why</string>",
  );
  const warnings = checkIosPermissionStrings({ detected: [dep("geolocator")] }, dir, false);
  assert.deepEqual(warnings, []);
});

test("tracking SDKs demand the ATT prompt string", (t) => {
  const dir = appWithPlist(t, "<key>CFBundleName</key><string>x</string>");
  const warnings = checkIosPermissionStrings({ detected: [] }, dir, true);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].missingKey, "NSUserTrackingUsageDescription");
});

test("no app Info.plist at all -> silent (coverage already screams)", (t) => {
  const dir = tempDir(t);
  const warnings = checkIosPermissionStrings({ detected: [dep("record")] }, dir, true);
  assert.deepEqual(warnings, []);
});

test("Flutter fixture: geolocator is satisfied by its Info.plist", () => {
  const result = scanProject(FLUTTER_FIXTURE);
  const warnings = checkIosPermissionStrings(result, FLUTTER_FIXTURE, false);
  assert.ok(
    !warnings.some((w) => w.missingKey.startsWith("NSLocation")),
    "NSLocationWhenInUseUsageDescription exists in the fixture",
  );
});
