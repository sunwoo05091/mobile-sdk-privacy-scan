// Pure logic for the KB bootstrap tool — no network, unit-testable.
import { createHash } from "node:crypto";

/** CocoaPods CDN shards specs by the first 3 hex chars of md5(podName). */
export function cdnShard(podName) {
  const md5 = createHash("md5").update(podName).digest("hex");
  return [md5[0], md5[1], md5[2]];
}

export function podspecUrl(podName, version) {
  const [a, b, c] = cdnShard(podName);
  const p = encodeURIComponent(podName);
  const v = encodeURIComponent(version);
  return `https://cdn.cocoapods.org/Specs/${a}/${b}/${c}/${p}/${v}/${p}.podspec.json`;
}

/** "Firebase/Analytics" (subspec) -> "Firebase" (the pod that gets published). */
export function parentPod(podName) {
  return podName.split("/")[0];
}

/** Latest stable version by numeric segment compare; prereleases only as fallback. */
export function pickLatestVersion(versions) {
  const stable = versions.filter((v) => !v.includes("-"));
  const pool = stable.length ? stable : versions;
  if (!pool.length) return undefined;
  const numeric = (v) => v.split("-")[0].split(".").map((n) => parseInt(n, 10) || 0);
  return [...pool].sort((a, b) => {
    const na = numeric(a);
    const nb = numeric(b);
    for (let i = 0; i < Math.max(na.length, nb.length); i++) {
      const d = (na[i] ?? 0) - (nb[i] ?? 0);
      if (d !== 0) return d;
    }
    // Same numeric core: lexicographic prerelease tiebreak (alpha < beta < rc).
    return a.localeCompare(b);
  }).pop();
}

/**
 * An SDK archive can contain manifests for bundled sub-frameworks too.
 * Prefer the ones whose path mentions the pod; fall back to all of them.
 */
export function selectManifestPaths(paths, podName) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  // "Google-Mobile-Ads-SDK" should match "GoogleMobileAds.xcframework" and
  // "FirebaseCrashlytics" should prefer "Crashlytics/Resources/…" over
  // "FirebaseAuth/…": split pod names on separators AND camelCase, drop
  // generic words, then score paths by total length of matched tokens
  // (longer, more specific tokens dominate).
  const GENERIC = new Set(["sdk", "ios", "framework", "lib", "apple"]);
  const camel = podName.replace(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/g, " ");
  let tokens = camel.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const specific = tokens.filter((t) => !GENERIC.has(t));
  if (specific.length) tokens = specific;

  const scored = paths.map((p) => {
    const np = norm(p);
    return [p, tokens.reduce((n, t) => n + (np.includes(t) ? t.length : 0), 0)];
  });
  const max = Math.max(0, ...scored.map(([, s]) => s));
  if (max === 0) return paths; // no match -> keep everything, don't drop data
  return scored.filter(([, s]) => s === max).map(([p]) => p);
}

/**
 * Compare a KB entry's Apple data with freshly harvested data.
 * Returns human-readable change lines; empty array = no drift.
 */
export function diffAppleData(entry, fresh) {
  const changes = [];
  const oldTypes = new Set(entry.apple.map((t) => t.type));
  const newTypes = new Set(fresh.apple.map((t) => t.type));
  for (const t of newTypes) {
    if (!oldTypes.has(t)) changes.push(`+ type ${t}`);
  }
  for (const t of oldTypes) {
    if (!newTypes.has(t)) changes.push(`- type ${t}`);
  }
  for (const f of fresh.apple) {
    const o = entry.apple.find((t) => t.type === f.type);
    if (!o) continue;
    if (o.linked !== f.linked) changes.push(`~ ${f.type} linked ${o.linked} -> ${f.linked}`);
    if (o.tracking !== f.tracking) changes.push(`~ ${f.type} tracking ${o.tracking} -> ${f.tracking}`);
    const op = [...o.purposes].sort().join(",");
    const fp = [...f.purposes].sort().join(",");
    if (op !== fp) changes.push(`~ ${f.type} purposes [${op}] -> [${fp}]`);
  }
  if (entry.tracking !== fresh.tracking) {
    changes.push(`~ tracking ${entry.tracking} -> ${fresh.tracking}`);
  }
  const oldDomains = new Set(entry.trackingDomains);
  const newDomains = new Set(fresh.trackingDomains);
  for (const d of newDomains) if (!oldDomains.has(d)) changes.push(`+ domain ${d}`);
  for (const d of oldDomains) if (!newDomains.has(d)) changes.push(`- domain ${d}`);
  return changes;
}

/** Apply harvested Apple data to a KB entry (returns a new entry object). */
export function applyAppleData(entry, fresh, { verifiedPods, stamp }) {
  const playNote = entry.play.length
    ? "Play data: curated — verify against the Play SDK Index"
    : "Play data: none — check the Play SDK Index";
  return {
    ...entry,
    tracking: fresh.tracking,
    trackingDomains: [...fresh.trackingDomains].sort(),
    apple: fresh.apple,
    source: `Apple data: PrivacyInfo.xcprivacy from ${verifiedPods.join(", ")}. ${playNote}.`,
    lastVerified: stamp,
  };
}
