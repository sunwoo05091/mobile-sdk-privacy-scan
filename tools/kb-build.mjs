#!/usr/bin/env node
// KB bootstrap: verify/refresh the Apple side of src/kb/data.json against the
// PrivacyInfo.xcprivacy files that SDKs actually ship in their pod artifacts.
//
// This is a MAINTAINER tool — it uses the network. The scanner itself stays
// fully offline; only the refreshed data.json ships in the package.
//
// Usage:
//   node tools/kb-build.mjs                 # check: print drift, exit 1 if any
//   node tools/kb-build.mjs --write         # apply harvested data + lastVerified
//   node tools/kb-build.mjs --ids sentry,appsflyer
//
// Needs `unzip` and `tar` on PATH (macOS/Linux default).
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePrivacyManifest } from "../dist/manifest.js";
import { mergeAppleTypes } from "../dist/appleData.js";
import {
  applyAppleData,
  diffAppleData,
  pickLatestVersion,
  podspecUrl,
  selectManifestPaths,
} from "./kb-lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "src", "kb", "data.json");
const CACHE = join(__dirname, ".cache");

const args = process.argv.slice(2);
const WRITE = args.includes("--write");
const idsArg = args.find((a) => a.startsWith("--ids"));
const ONLY = idsArg
  ? new Set((idsArg.split("=")[1] ?? args[args.indexOf(idsArg) + 1]).split(","))
  : null;

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "user-agent": "sdk-privacy-scan-kb-build" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function download(url, dest) {
  if (existsSync(dest)) return;
  const res = await fetch(url, { headers: { "user-agent": "sdk-privacy-scan-kb-build" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

function extract(archive, destDir) {
  if (existsSync(destDir)) return;
  mkdirSync(destDir, { recursive: true });
  try {
    if (archive.endsWith(".zip")) {
      // Extract ONLY the manifests: repo zips can contain filenames the
      // filesystem rejects (e.g. stripe-ios ships an emoji-named file).
      execFileSync(
        "unzip",
        ["-q", "-o", archive, "*PrivacyInfo.xcprivacy", "-d", destDir],
        { stdio: "pipe" },
      );
    } else {
      execFileSync("tar", ["-xf", archive, "-C", destDir], { stdio: "pipe" });
    }
  } catch (e) {
    // unzip exits 11 when no entry matches — a manifest-less artifact is a
    // valid outcome, not an infrastructure failure.
    if (e.status === 11) return;
    rmSync(destDir, { recursive: true, force: true }); // don't poison the cache
    throw e;
  }
}

function findManifests(dir, depth = 0, acc = []) {
  if (depth > 10) return acc;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) findManifests(full, depth + 1, acc);
    else if (name === "PrivacyInfo.xcprivacy") acc.push(full);
  }
  return acc;
}

/** Resolve a pod's latest artifact and return its parsed privacy manifests. */
async function harvestPod(pod) {
  const trunk = await fetchJson(`https://trunk.cocoapods.org/api/v1/pods/${encodeURIComponent(pod)}`);
  const version = pickLatestVersion((trunk.versions ?? []).map((v) => v.name));
  if (!version) throw new Error("no versions on trunk");

  const spec = await fetchJson(podspecUrl(pod, version));
  const src = spec.source ?? {};
  let url;
  if (src.http) {
    url = src.http;
  } else if (src.git && src.tag && src.git.includes("github.com")) {
    const repo = src.git.replace(/\.git$/, "").replace(/^.*github\.com[/:]/, "");
    url = `https://codeload.github.com/${repo}/zip/refs/tags/${encodeURIComponent(src.tag)}`;
  } else {
    throw new Error(`unsupported source: ${JSON.stringify(src)}`);
  }

  const safe = pod.replace(/[^\w.-]/g, "_");
  const ext = src.http && /\.(tar\.gz|tgz|tar\.bz2|tbz)($|\?)/.test(src.http) ? ".tar.gz" : ".zip";
  const archive = join(CACHE, `${safe}-${version}${ext}`);
  const destDir = join(CACHE, `${safe}-${version}`);
  await download(url, archive);
  extract(archive, destDir);

  const all = findManifests(destDir);
  // Score RELATIVE paths — the cache dir itself is named after the pod and
  // would otherwise make every path look like a match.
  const chosen = selectManifestPaths(
    all.map((p) => p.slice(destDir.length + 1)),
    pod,
  ).map((p) => join(destDir, p));
  const parsed = [];
  for (const p of chosen) {
    try {
      parsed.push(parsePrivacyManifest(readFileSync(p, "utf8")));
    } catch {
      console.warn(`    ! unparseable manifest: ${p}`);
    }
  }
  return { version, manifests: parsed, totalFound: all.length, used: chosen.length };
}

const kb = JSON.parse(readFileSync(DATA_PATH, "utf8"));
mkdirSync(CACHE, { recursive: true });

const stamp = new Date().toISOString().slice(0, 7); // YYYY-MM
let drifted = 0;
let failed = 0;

for (const [i, entry] of kb.entries.entries()) {
  if (ONLY && !ONLY.has(entry.id)) continue;
  // Subspec aliases ("Firebase/Analytics") exist for detection only. Their
  // parent pod is a multi-product bundle whose manifests we cannot attribute
  // to THIS SDK, so never harvest it.
  const pods = [...new Set((entry.aliases.pod ?? []).filter((p) => !p.includes("/")))];
  if (!pods.length) {
    console.log(`○ ${entry.id}: no harvestable pod alias — keeping curated seed`);
    continue;
  }

  console.log(`● ${entry.id} (pods: ${pods.join(", ")})`);
  const collected = [];
  const verifiedPods = [];
  for (const pod of pods) {
    try {
      const { version, manifests, totalFound, used } = await harvestPod(pod);
      if (!manifests.length) {
        console.log(`    ${pod} ${version}: no privacy manifest in artifact`);
        continue;
      }
      console.log(`    ${pod} ${version}: ${used}/${totalFound} manifests used`);
      collected.push(...manifests);
      verifiedPods.push(`${pod} ${version}`);
    } catch (e) {
      console.log(`    ${pod}: FAILED (${e.message})`);
    }
  }

  if (!collected.length) {
    console.log(`    ✗ no shipped manifest found — keeping curated seed data`);
    failed++;
    continue;
  }

  const fresh = {
    apple: mergeAppleTypes(collected.flatMap((m) => m.apple)),
    tracking: collected.some((m) => m.tracking),
    trackingDomains: [...new Set(collected.flatMap((m) => m.trackingDomains))].sort(),
  };

  const changes = diffAppleData(entry, fresh);
  if (changes.length) {
    drifted++;
    for (const c of changes) console.log(`    ${c}`);
  } else {
    console.log(`    ✓ matches shipped manifests`);
  }

  if (WRITE) {
    kb.entries[i] = applyAppleData(entry, fresh, { verifiedPods, stamp });
  }
}

if (WRITE) {
  kb._meta.note =
    "Apple-side data is auto-harvested from each SDK's own shipped PrivacyInfo.xcprivacy " +
    "(see tools/kb-build.mjs; per-entry `source` and `lastVerified` say when). " +
    "Play-side data is curated and MUST be verified against the Google Play SDK Index. " +
    "Data collection varies by SDK version and by how the app configures the SDK.";
  kb._meta.generatedFor = stamp;
  writeFileSync(DATA_PATH, JSON.stringify(kb, null, 2) + "\n");
  console.log(`\nWrote ${DATA_PATH}`);
} else if (drifted) {
  console.log(`\n${drifted} entries drift from shipped manifests. Run with --write to apply.`);
  process.exit(1);
}
if (failed) process.exit(2);
