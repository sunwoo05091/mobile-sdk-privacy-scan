// `explain`: rejection mails are decoded via STABLE codes only (ITMS numbers,
// NSPrivacyAccessedAPICategory…), never via Apple's mail wording.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { extractCodes, explain } from "../dist/explain.js";
import { scanProject } from "../dist/detect/index.js";
import { CLI, RN_FIXTURE } from "./_helpers.js";

const MAIL = `
Dear Developer,
We identified one or more issues with a recent delivery for your app.
ITMS-91053: Missing API declaration - Your app's code references one or more
APIs that require reasons, including the following API categories:
NSPrivacyAccessedAPICategoryFileTimestamp. Starting May 1, 2024 ...
NSPrivacyAccessedAPICategoryUserDefaults.
`;

test("extractCodes pulls stable identifiers regardless of wording", () => {
  const codes = extractCodes(MAIL);
  assert.deepEqual(codes.itms, ["ITMS-91053"]);
  assert.deepEqual(codes.categories.sort(), [
    "NSPrivacyAccessedAPICategoryFileTimestamp",
    "NSPrivacyAccessedAPICategoryUserDefaults",
  ]);
  // Purpose constants must NOT be mistaken for collected-type constants.
  const p = extractCodes("NSPrivacyCollectedDataTypePurposeAnalytics NSPrivacyCollectedDataTypeDeviceID");
  assert.deepEqual(p.collectedTypes, ["NSPrivacyCollectedDataTypeDeviceID"]);
});

test("explain names the ITMS code and lists approved reasons", () => {
  const e = explain(MAIL);
  assert.equal(e.empty, false);
  assert.match(e.itms[0].meaning, /Missing API declaration/);
  const ud = e.categories.find((c) => c.category.endsWith("UserDefaults"));
  assert.ok(ud.reasons["CA92.1"]);
  assert.deepEqual(ud.culprits, [], "no project given -> no culprits");
});

test("with a project, culprits are cross-referenced from the scan", () => {
  const scan = scanProject(RN_FIXTURE);
  const e = explain(MAIL, scan);
  const ft = e.categories.find((c) => c.category.endsWith("FileTimestamp"));
  const culprit = ft.culprits.find((x) => x.package === "react-native-fs");
  assert.ok(culprit, "react-native-fs maps to FileTimestamp");
  assert.equal(culprit.covered, false);
  assert.deepEqual(culprit.reasons, ["C617.1"]);

  const ud = e.categories.find((c) => c.category.endsWith("UserDefaults"));
  const covered = ud.culprits.find((x) => x.package.includes("async-storage"));
  assert.equal(covered.covered, true, "async-storage ships its own manifest");
});

test("gibberish text is handled honestly", () => {
  assert.equal(explain("we rejected ur app lol").empty, true);
});

test("CLI: explain subcommand end to end", () => {
  const env = { ...process.env, NO_COLOR: "1" };
  delete env.FORCE_COLOR;
  const res = spawnSync(
    process.execPath,
    [CLI, "explain", MAIL, "--project", RN_FIXTURE],
    { encoding: "utf8", env },
  );
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /ITMS-91053 — Missing API declaration/);
  assert.match(res.stdout, /react-native-fs — no shipped manifest covers it/);
  assert.match(res.stdout, /C617\.1/);
  assert.match(res.stdout, /async-storage — its own manifest declares this/);
});
