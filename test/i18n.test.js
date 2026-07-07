// --lang ko: CLI chrome in Korean; default stays English. Technical
// identifiers (NSPrivacy…, [manifest], reason codes) stay English by design.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { CLI, FLUTTER_FIXTURE, tempDir } from "./_helpers.js";

function run(args, t) {
  const env = { ...process.env, NO_COLOR: "1" };
  delete env.FORCE_COLOR;
  return spawnSync(
    process.execPath,
    [CLI, FLUTTER_FIXTURE, "--out", tempDir(t), ...args],
    { encoding: "utf8", env },
  );
}

test("default output is English", (t) => {
  const res = run([], t);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /Coverage:/);
  assert.match(res.stdout, /Trust boundary/);
  assert.doesNotMatch(res.stdout, /커버리지/);
});

test("--lang ko switches the chrome to Korean, keeps identifiers English", (t) => {
  const res = run(["--lang", "ko"], t);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /커버리지:/);
  assert.match(res.stdout, /인식된 SDK \(데이터 수집\):/);
  assert.match(res.stdout, /신뢰 경계/);
  assert.match(res.stdout, /다음 할 일:/);
  assert.match(res.stdout, /앱 자체 데이터 수집/);
  // identifiers stay grep-able
  assert.match(res.stdout, /\[KB seed\]/);
  assert.match(res.stdout, /NSPrivacyAccessedAPICategory|PrivacyInfo\.xcprivacy/);
  assert.doesNotMatch(res.stdout, /Trust boundary/);
});
