// Required-reason API (ITMS-91053) suggestions: known packages -> accessed API
// categories, cross-checked against manifests the packages ship themselves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestRequiredReasons } from "../dist/requiredReasons.js";
import { scanProject } from "../dist/detect/index.js";
import { RN_FIXTURE, FLUTTER_FIXTURE, harvestedManifest } from "./_helpers.js";

const UD = "NSPrivacyAccessedAPICategoryUserDefaults";

test("a known package with a manifest declaring the category is covered", () => {
  const result = scanProject(RN_FIXTURE);
  const s = suggestRequiredReasons(result).find(
    (x) => x.package === "@react-native-async-storage/async-storage",
  );
  assert.ok(s, "async-storage must be suggested");
  assert.equal(s.category, UD);
  assert.deepEqual(s.reasons, ["CA92.1"]);
  assert.equal(s.covered, true, "its shipped manifest declares UserDefaults");
});

test("a known package without a shipped manifest warns as uncovered", () => {
  const result = scanProject(RN_FIXTURE);
  const s = suggestRequiredReasons(result).find(
    (x) => x.package === "react-native-fs",
  );
  assert.ok(s);
  assert.equal(s.category, "NSPrivacyAccessedAPICategoryFileTimestamp");
  assert.equal(s.covered, false);
});

test("coverage accepts the iOS implementation package via coveredBy", () => {
  const result = scanProject(FLUTTER_FIXTURE);
  // Flutter fixture has no shared_preferences — no suggestion at all.
  assert.equal(
    suggestRequiredReasons(result).find((x) => x.package === "shared_preferences"),
    undefined,
  );

  // Synthetic: shared_preferences detected + manifest owned by the
  // shared_preferences_foundation implementation package.
  const synthetic = {
    detected: [
      { name: "shared_preferences", ecosystem: "pub", direct: true, source: "pubspec.lock" },
    ],
    harvestedManifests: [
      harvestedManifest({
        owner: { ecosystem: "pub", name: "shared_preferences_foundation" },
        accessedApiCategories: [UD],
      }),
    ],
  };
  const s = suggestRequiredReasons(synthetic).find(
    (x) => x.package === "shared_preferences",
  );
  assert.equal(s.covered, true);
});

test("packages the project does not use produce no suggestions", () => {
  const result = scanProject(FLUTTER_FIXTURE);
  assert.deepEqual(suggestRequiredReasons(result), []);
});
