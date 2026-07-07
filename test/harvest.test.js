import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { harvestPrivacyManifests } from "../dist/detect/harvest.js";
import { tempDir } from "./_helpers.js";

const VALID_MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>NSPrivacyTracking</key>
    <true/>
    <key>NSPrivacyTrackingDomains</key>
    <array><string>sdk.example.com</string></array>
    <key>NSPrivacyCollectedDataTypes</key>
    <array>
      <dict>
        <key>NSPrivacyCollectedDataType</key>
        <string>NSPrivacyCollectedDataTypeDeviceID</string>
        <key>NSPrivacyCollectedDataTypeLinked</key>
        <true/>
        <key>NSPrivacyCollectedDataTypeTracking</key>
        <true/>
        <key>NSPrivacyCollectedDataTypePurposes</key>
        <array><string>NSPrivacyCollectedDataTypePurposeAnalytics</string></array>
      </dict>
    </array>
  </dict>
</plist>`;

function plant(root, relDir, content = VALID_MANIFEST) {
  const dir = join(root, relDir);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "PrivacyInfo.xcprivacy");
  writeFileSync(file, content);
  return file;
}

test("finds and parses manifests shipped inside ios/Pods and node_modules", (t) => {
  const root = tempDir(t);
  const inPods = plant(root, "ios/Pods/SomeSDK/Resources");
  const inNodeModules = plant(root, "node_modules/some-sdk/ios");

  const { manifests, errors } = harvestPrivacyManifests(root);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    manifests.map((m) => m.path).sort(),
    [inPods, inNodeModules].sort(),
  );

  const parsed = manifests[0];
  assert.equal(parsed.tracking, true);
  assert.deepEqual(parsed.trackingDomains, ["sdk.example.com"]);
  assert.equal(parsed.apple.length, 1);
  assert.deepEqual(parsed.apple[0], {
    type: "NSPrivacyCollectedDataTypeDeviceID",
    linked: true,
    tracking: true,
    purposes: ["NSPrivacyCollectedDataTypePurposeAnalytics"],
  });
});

test("overlapping search roots (ios contains ios/Pods) do not duplicate", (t) => {
  const root = tempDir(t);
  plant(root, "ios/Pods/SomeSDK");
  assert.equal(harvestPrivacyManifests(root).manifests.length, 1);
});

test("attributes owners from the manifest path", (t) => {
  const root = tempDir(t);
  plant(root, "ios/Pods/FBSDKCoreKit");
  plant(root, "node_modules/react-native-thing/ios");
  plant(root, "node_modules/@sentry/react-native/ios");
  plant(root, ".symlinks/plugins/sentry_flutter/ios");

  const owners = new Map(
    harvestPrivacyManifests(root).manifests.map((m) => [
      m.path,
      m.owner,
    ]),
  );
  const byEnding = (suffix) =>
    [...owners.entries()].find(([p]) => p.includes(suffix))?.[1];

  assert.deepEqual(byEnding("Pods/FBSDKCoreKit"), {
    ecosystem: "pod",
    name: "FBSDKCoreKit",
  });
  assert.deepEqual(byEnding("react-native-thing"), {
    ecosystem: "npm",
    name: "react-native-thing",
  });
  assert.deepEqual(byEnding("@sentry"), {
    ecosystem: "npm",
    name: "@sentry/react-native",
  });
  assert.deepEqual(byEnding("sentry_flutter"), {
    ecosystem: "pub",
    name: "sentry_flutter",
  });
});

test("nested node_modules attributes to the innermost package", (t) => {
  const root = tempDir(t);
  plant(root, "node_modules/outer/node_modules/inner");
  const [m] = harvestPrivacyManifests(root).manifests;
  assert.deepEqual(m.owner, { ecosystem: "npm", name: "inner" });
});

test("Target Support Files and the app's own manifest get no owner", (t) => {
  const root = tempDir(t);
  plant(root, "ios/Pods/Target Support Files/Pods-App");
  plant(root, "ios/MyApp");

  for (const m of harvestPrivacyManifests(root).manifests) {
    assert.equal(m.owner, undefined, m.path);
  }
});

test("malformed manifests are collected as errors, not silently dropped", (t) => {
  const root = tempDir(t);
  const bad = plant(root, "ios/Pods/BadSDK", "not a plist at all <<<");
  const good = plant(root, "ios/Pods/GoodSDK");

  const { manifests, errors } = harvestPrivacyManifests(root);
  assert.deepEqual(errors, [bad]);
  assert.deepEqual(manifests.map((m) => m.path), [good]);
});

test("missing keys fall back to safe defaults", (t) => {
  const root = tempDir(t);
  plant(
    root,
    "ios/Pods/QuietSDK",
    `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict/></plist>`,
  );
  const [m] = harvestPrivacyManifests(root).manifests;
  assert.equal(m.tracking, false);
  assert.deepEqual(m.trackingDomains, []);
  assert.deepEqual(m.apple, []);
});

test("respects the max walk depth", (t) => {
  const root = tempDir(t);
  const atLimit = plant(root, "node_modules/a1/a2/a3/a4/a5/a6");
  plant(root, "node_modules/b1/b2/b3/b4/b5/b6/b7");

  const { manifests } = harvestPrivacyManifests(root);
  assert.deepEqual(manifests.map((m) => m.path), [atLimit]);
});

test("returns empty result for a project with no dependency folders", (t) => {
  assert.deepEqual(harvestPrivacyManifests(tempDir(t)), {
    manifests: [],
    errors: [],
  });
});
