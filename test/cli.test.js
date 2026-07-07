// End-to-end tests: run the built CLI exactly the way npx users will.
// Output always goes to a temp dir (absolute --out) so fixtures stay pristine.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import plist from "plist";
import {
  CLI,
  FLUTTER_FIXTURE,
  RN_FIXTURE,
  INCOMPLETE_MANIFEST,
  tempDir,
} from "./_helpers.js";

function runCli(args) {
  const res = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  assert.equal(res.error, undefined);
  return res;
}

test("scanning the Flutter fixture writes both drafts and exits 0", (t) => {
  const out = tempDir(t);
  const res = runCli([FLUTTER_FIXTURE, "--out", out]);

  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /Project type: .*flutter/);

  // Coverage is stated loudly: this fixture has no android/ project.
  assert.match(res.stdout, /Coverage:/);
  assert.match(res.stdout, /Android dependencies.*NOT SCANNED/);
  assert.match(res.stdout, /Results are PARTIAL/);

  const manifest = plist.parse(
    readFileSync(join(out, "PrivacyInfo.xcprivacy"), "utf8"),
  );
  // AdMob's own shipped manifest declares NSPrivacyTracking=false (Google's
  // position: tracking depends on how the app configures ads), so the
  // KB entry harvested from it does too — the aggregate follows the SDKs.
  assert.equal(manifest.NSPrivacyTracking, false);
  const types = manifest.NSPrivacyCollectedDataTypes.map(
    (t) => t.NSPrivacyCollectedDataType,
  );
  // Coarse location comes from AdMob's real manifest.
  assert.ok(types.includes("NSPrivacyCollectedDataTypeCoarseLocation"));

  const md = readFileSync(join(out, "play-data-safety.md"), "utf8");
  assert.match(md, /\| Category \| Data type \|/);

  // Noise suppression: transitive/dev/shard packages are counted, not listed.
  assert.match(res.stdout, /suppressed/i);
  assert.doesNotMatch(res.stdout, /\? collection /, "transitive noise must not be listed");

  // App-own collection hints + actionable ending.
  assert.match(res.stdout, /geolocator/);
  assert.match(res.stdout, /own data collection/i);
  assert.match(res.stdout, /Next steps/i);
  assert.match(res.stdout, /No app privacy manifest found/i);

  // The trust boundary is always stated explicitly.
  assert.match(res.stdout, /Trust boundary/);
  assert.match(res.stdout, /not legal advice/);

  // Config-dependent SDKs say exactly what to check (AdMob in this fixture).
  assert.match(res.stdout, /CONFIG Google AdMob/);
  assert.match(res.stdout, /personalized ads/);

  // App-feature collection lands IN the draft (location via package+plist,
  // camera via Info.plist only), marked for review.
  const xml = readFileSync(join(out, "PrivacyInfo.xcprivacy"), "utf8");
  assert.ok(types.includes("NSPrivacyCollectedDataTypePreciseLocation"));
  const camTypes = plist
    .parse(xml)
    .NSPrivacyCollectedDataTypes.map((t) => t.NSPrivacyCollectedDataType);
  assert.ok(camTypes.includes("NSPrivacyCollectedDataTypePhotosorVideos"));
  assert.match(xml, /REVIEW REQUIRED/);
  assert.match(md, /your app \(.*geolocator.*\) — VERIFY/);
});

test("--compare against an incomplete manifest reports drift and exits 1", (t) => {
  const out = tempDir(t);
  const res = runCli([RN_FIXTURE, "--out", out, "--compare", INCOMPLETE_MANIFEST]);

  assert.equal(res.status, 1, "undeclared data types must fail the CI gate");
  assert.match(res.stdout, /MISSING NSPrivacyCollectedDataTypeDeviceID/);
  assert.match(res.stdout, /TRACKING declared=false detected=true/);
});

test("--compare against the manifest we just generated exits 0 (self-consistency)", (t) => {
  const out = tempDir(t);
  runCli([RN_FIXTURE, "--out", out]);

  const res = runCli([
    RN_FIXTURE,
    "--out", out,
    "--compare", join(out, "PrivacyInfo.xcprivacy"),
  ]);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /No drift detected/);
});

test("declaring tracking=false while SDKs track fails the gate", (t) => {
  const out = tempDir(t);
  runCli([RN_FIXTURE, "--out", out]);

  // Take the fully correct generated manifest and flip only NSPrivacyTracking.
  const generated = join(out, "PrivacyInfo.xcprivacy");
  const doc = plist.parse(readFileSync(generated, "utf8"));
  assert.equal(doc.NSPrivacyTracking, true, "precondition: RN fixture tracks");
  doc.NSPrivacyTracking = false;
  const lying = join(out, "under-declared.xcprivacy");
  writeFileSync(lying, plist.build(doc));

  const res = runCli([RN_FIXTURE, "--out", out, "--compare", lying]);
  assert.equal(res.status, 1, "tracking under-declaration is rejection-grade");
  assert.match(res.stdout, /TRACKING declared=false detected=true/);
});

test("--json writes a machine-readable scan.json", (t) => {
  const out = tempDir(t);
  const res = runCli([RN_FIXTURE, "--out", out, "--json"]);
  assert.equal(res.status, 0);

  const scan = JSON.parse(readFileSync(join(out, "scan.json"), "utf8"));
  const ids = scan.result.resolved.map((r) => r.entry.id).sort();
  assert.deepEqual(ids, [
    "appsflyer",
    "facebook-sdk",
    "firebase-analytics",
    "harvested:AcmeAnalytics",
  ]);
  assert.ok(Array.isArray(scan.playRows) && scan.playRows.length > 0);
});

test("harvested manifests drive the aggregate for the RN fixture", (t) => {
  const out = tempDir(t);
  const res = runCli([RN_FIXTURE, "--out", out]);
  assert.equal(res.status, 0, res.stdout + res.stderr);

  // Provenance is visible in the report.
  assert.match(res.stdout, /\[manifest\]/);
  assert.match(res.stdout, /\[KB seed\]/);

  const xml = readFileSync(join(out, "PrivacyInfo.xcprivacy"), "utf8");
  const doc = plist.parse(xml);
  const types = doc.NSPrivacyCollectedDataTypes.map((d) => d.NSPrivacyCollectedDataType);

  // OtherUsageData exists ONLY in the harvested FBSDKCoreKit manifest —
  // its presence proves harvested data replaced the KB seed.
  assert.ok(types.includes("NSPrivacyCollectedDataTypeOtherUsageData"));
  assert.ok(doc.NSPrivacyTrackingDomains.includes("graph.facebook.com"));

  // The warning comment about the app's own required-reason APIs survives.
  assert.match(xml, /ITMS-91053/);

  // Uncovered required-reason suggestion (react-native-fs) is filled in;
  // async-storage is covered by its own shipped manifest so UserDefaults
  // must NOT be declared app-side.
  const apis = doc.NSPrivacyAccessedAPITypes.map((a) => a.NSPrivacyAccessedAPIType);
  assert.deepEqual(apis, ["NSPrivacyAccessedAPICategoryFileTimestamp"]);
  assert.deepEqual(
    doc.NSPrivacyAccessedAPITypes[0].NSPrivacyAccessedAPITypeReasons,
    ["C617.1"],
  );

  // AndroidManifest RECORD_AUDIO -> app-side AudioData entry in the draft.
  assert.ok(types.includes("NSPrivacyCollectedDataTypeAudioData"));

  // AcmeAnalytics (harvested-only) lands in the Play draft's manual-check section.
  const md = readFileSync(join(out, "play-data-safety.md"), "utf8");
  assert.match(md, /[Cc]heck manually/);
  assert.match(md, /AcmeAnalytics/);
});

test("output stays inside --out: fixtures are never polluted", (t) => {
  const out = tempDir(t);
  runCli([FLUTTER_FIXTURE, "--out", out]);
  assert.ok(!existsSync(join(FLUTTER_FIXTURE, "privacy-out")));
});
