import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectReactNative,
  isReactNativeProject,
} from "../dist/detect/reactNative.js";
import { detectPods, detectGradle } from "../dist/detect/native.js";
import { FLUTTER_FIXTURE, RN_FIXTURE } from "./_helpers.js";

test("detectReactNative reads the npm layer from package.json", () => {
  const npm = detectReactNative(RN_FIXTURE);
  const names = npm.map((d) => d.name).sort();
  assert.deepEqual(names, [
    "@react-native-async-storage/async-storage",
    "@react-native-firebase/analytics",
    "axios",
    "react-native",
    "react-native-appsflyer",
    "react-native-fs",
  ]);
  const firebase = npm.find((d) => d.name === "@react-native-firebase/analytics");
  assert.equal(firebase.version, "20.4.0", "range prefix (^/~) is stripped");
  assert.equal(firebase.direct, true);
  assert.equal(firebase.source, "package.json");
});

test("detectPods reads the iOS pod layer from ios/Podfile.lock", () => {
  const pods = detectPods(RN_FIXTURE);
  const byName = new Map(pods.map((d) => [d.name, d]));
  assert.deepEqual(
    [...byName.keys()].sort(),
    ["AcmeAnalytics", "AppsFlyerFramework", "FBSDKCoreKit", "Firebase/Analytics", "FirebaseAnalytics"],
  );
  // "Firebase/Analytics (10.29.0):" is a nested-map entry; version still parses.
  assert.equal(byName.get("Firebase/Analytics").version, "10.29.0");
  assert.equal(byName.get("FBSDKCoreKit").version, "17.0.0");
  for (const d of pods) {
    assert.equal(d.direct, false, "Podfile.lock flattens direct + transitive");
    assert.equal(d.source, "ios/Podfile.lock");
  }
});

test("detectGradle reads the Android layer from android/app/build.gradle", () => {
  const gradle = detectGradle(RN_FIXTURE);
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

test("native layers are framework-independent: Flutter's ios/Podfile.lock is scanned", () => {
  const pods = detectPods(FLUTTER_FIXTURE);
  const names = pods.map((d) => d.name).sort();
  assert.deepEqual(names, ["Firebase/Analytics", "Flutter", "Sentry"]);
});

test("isReactNativeProject requires react-native or expo in deps", () => {
  assert.equal(isReactNativeProject(RN_FIXTURE), true);
  assert.equal(isReactNativeProject(FLUTTER_FIXTURE), false);
});
