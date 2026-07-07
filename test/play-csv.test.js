// Play Data Safety CSV: fill Google's own exported template — one row per
// choice, TRUE marks selections, judgment questions stay blank.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePlayCsv } from "../dist/generate/playCsv.js";
import { generateAscAnswers } from "../dist/generate/ascAnswers.js";

const row = (category, type, collected, shared, purposes) => ({
  category, type, collected, shared, purposes, from: ["x"],
});

function parseCsv(csv) {
  // good-enough parser for our own output (quoted fields with commas)
  return csv.trim().split("\r\n").map((line) => {
    const fields = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === ",") { fields.push(cur); cur = ""; }
      else cur += c;
    }
    fields.push(cur);
    return fields;
  });
}

test("selected types mark TRUE in their category and usage rows", () => {
  const { csv, unmapped } = generatePlayCsv([
    row("Device or other IDs", "Device or other IDs", true, true, ["Analytics", "Advertising or marketing"]),
    row("Location", "Precise location", true, false, ["App functionality"]),
  ]);
  assert.deepEqual(unmapped, []);
  const rows = parseCsv(csv);
  const find = (q, r) => rows.find((x) => x[0] === q && x[1] === (r ?? ""));

  assert.equal(rows[0][0], "Question ID (machine readable)", "header preserved");
  assert.equal(find("PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA")[2], "TRUE");
  assert.equal(find("PSL_DATA_TYPES_IDENTIFIERS", "PSL_DEVICE_ID")[2], "TRUE");
  assert.equal(find("PSL_DATA_TYPES_LOCATION", "PSL_PRECISE_LOCATION")[2], "TRUE");
  assert.equal(find("PSL_DATA_TYPES_LOCATION", "PSL_APPROX_LOCATION")[2], "", "unselected choice stays blank");

  // Collected AND shared → both boxes TRUE; location only collected.
  const cs = "PSL_DATA_USAGE_RESPONSES:PSL_DEVICE_ID:PSL_DATA_USAGE_COLLECTION_AND_SHARING";
  assert.equal(find(cs, "PSL_DATA_USAGE_ONLY_COLLECTED")[2], "TRUE");
  assert.equal(find(cs, "PSL_DATA_USAGE_ONLY_SHARED")[2], "TRUE");
  const locCs = "PSL_DATA_USAGE_RESPONSES:PSL_PRECISE_LOCATION:PSL_DATA_USAGE_COLLECTION_AND_SHARING";
  assert.equal(find(locCs, "PSL_DATA_USAGE_ONLY_SHARED")[2], "");

  // Purposes: collection + sharing for device id; sharing rows blank for location.
  const cp = "PSL_DATA_USAGE_RESPONSES:PSL_DEVICE_ID:DATA_USAGE_COLLECTION_PURPOSE";
  assert.equal(find(cp, "PSL_ANALYTICS")[2], "TRUE");
  assert.equal(find(cp, "PSL_ADVERTISING")[2], "TRUE");
  assert.equal(find(cp, "PSL_APP_FUNCTIONALITY")[2], "");
  const sp = "PSL_DATA_USAGE_RESPONSES:PSL_DEVICE_ID:DATA_USAGE_SHARING_PURPOSE";
  assert.equal(find(sp, "PSL_ANALYTICS")[2], "TRUE");

  // Judgment questions stay blank for the developer.
  const uc = find("PSL_DATA_USAGE_RESPONSES:PSL_DEVICE_ID:DATA_USAGE_USER_CONTROL", "PSL_DATA_USAGE_USER_CONTROL_REQUIRED");
  assert.equal(uc[2], "");
  assert.equal(find("PSL_DATA_COLLECTION_ENCRYPTED_IN_TRANSIT")[2], "");
});

test("no rows -> collects=FALSE; unknown labels are reported, not guessed", () => {
  const empty = generatePlayCsv([]);
  const rows = parseCsv(empty.csv);
  assert.equal(rows.find((x) => x[0] === "PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA")[2], "FALSE");

  const weird = generatePlayCsv([row("Weird", "Quantum vibes", true, false, ["Divination"])]);
  assert.ok(weird.unmapped.some((u) => u.includes("Quantum vibes")));
});

test("ASC answer sheet follows the questionnaire structure", () => {
  const md = generateAscAnswers(
    [
      { type: "NSPrivacyCollectedDataTypeDeviceID", linked: true, tracking: true, purposes: ["NSPrivacyCollectedDataTypePurposeThirdPartyAdvertising"] },
      { type: "NSPrivacyCollectedDataTypePreciseLocation", linked: false, tracking: false, purposes: ["NSPrivacyCollectedDataTypePurposeAppFunctionality"] },
    ],
    { NSPrivacyCollectedDataTypeDeviceID: ["AppsFlyer"], NSPrivacyCollectedDataTypePreciseLocation: ["your app (geolocator)"] },
  );
  assert.match(md, /NOT the PrivacyInfo\.xcprivacy/);
  assert.match(md, /\*\*Answer: Yes\.\*\*/);
  assert.match(md, /## Identifiers/);
  assert.match(md, /### Device ID/);
  assert.match(md, /Used for tracking: \*\*Yes\*\*/);
  assert.match(md, /from: AppsFlyer/);
  assert.match(md, /## Location/);
  assert.match(md, /REVIEW: if your app has accounts/);
  assert.match(md, /Third-Party Advertising/);
});
