import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectReactNative,
  isReactNativeProject,
} from "../dist/detect/reactNative.js";
import { FLUTTER_FIXTURE, RN_FIXTURE } from "./_helpers.js";

test("detectReactNative reads the npm layer from package.json", () => {
  const npm = detectReactNative(RN_FIXTURE).filter(
    (d) => d.ecosystem === "npm",
  );
  const names = npm.map((d) => d.name).sort();
  assert.deepEqual(names, [
    "@react-native-firebase/analytics",
    "axios",
    "react-native",
    "react-native-appsflyer",
  ]);
  const firebase = npm.find((d) => d.name === "@react-native-firebase/analytics");
  assert.equal(firebase.version, "20.4.0", "range prefix (^/~) is stripped");
  assert.equal(firebase.direct, true);
  assert.equal(firebase.source, "package.json");
});

test("detectReactNative reads the iOS pod layer from ios/Podfile.lock", () => {
  const pods = detectReactNative(RN_FIXTURE).filter(
    (d) => d.ecosystem === "pod",
  );
  const byName = new Map(pods.map((d) => [d.name, d]));
  assert.deepEqual(
    [...byName.keys()].sort(),
    ["AppsFlyerFramework", "FBSDKCoreKit", "Firebase/Analytics", "FirebaseAnalytics", "Mixpanel"],
  );
  // "Firebase/Analytics (10.29.0):" is a nested-map entry; version still parses.
  assert.equal(byName.get("Firebase/Analytics").version, "10.29.0");
  assert.equal(byName.get("FBSDKCoreKit").version, "17.0.0");
  for (const d of pods) {
    assert.equal(d.direct, false, "Podfile.lock flattens direct + transitive");
    assert.equal(d.source, "ios/Podfile.lock");
  }
});

test("detectReactNative reads the Android layer from android/app/build.gradle", () => {
  const gradle = detectReactNative(RN_FIXTURE).filter(
    (d) => d.ecosystem === "gradle",
  );
  const byName = new Map(gradle.map((d) => [d.name, d]));
  assert.deepEqual(
    [...byName.keys()].sort(),
    [
      "com.appsflyer:af-android-sdk",
      "com.facebook.android:facebook-core",
      "com.google.firebase:firebase-analytics",
    ],
    "handles implementation 'a:b:c', implementation(\"a:b:c\") and api 'a:b:c'",
  );
  assert.equal(byName.get("com.appsflyer:af-android-sdk").version, "6.15.1");
});

test("detectReactNative returns [] for a non-RN project", () => {
  assert.deepEqual(detectReactNative(FLUTTER_FIXTURE), []);
});

test("isReactNativeProject requires react-native or expo in deps", () => {
  assert.equal(isReactNativeProject(RN_FIXTURE), true);
  assert.equal(isReactNativeProject(FLUTTER_FIXTURE), false);
});
