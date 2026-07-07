// Capability plugins (camera, location, mic…) mean the APP itself collects
// data — SDK scanning cannot declare that for the developer, only point at it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectCapabilities } from "../dist/capabilities.js";
import { scanProject } from "../dist/detect/index.js";
import { FLUTTER_FIXTURE, RN_FIXTURE } from "./_helpers.js";

test("geolocator in the Flutter fixture flags app-side location collection", () => {
  const result = scanProject(FLUTTER_FIXTURE);
  const hints = detectCapabilities(result);
  const loc = hints.find((h) => h.package === "geolocator");
  assert.ok(loc);
  assert.match(loc.collects, /location/i);
});

test("platform shards do not double-report the same capability", () => {
  const result = scanProject(FLUTTER_FIXTURE);
  const hints = detectCapabilities(result);
  assert.equal(
    hints.filter((h) => /location/i.test(h.collects)).length,
    1,
    "geolocator_apple must not add a second row",
  );
});

test("RN fixture has no capability plugins", () => {
  assert.deepEqual(detectCapabilities(scanProject(RN_FIXTURE)), []);
});
