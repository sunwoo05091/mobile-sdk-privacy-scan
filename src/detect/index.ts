import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { detectFlutter, isFlutterProject } from "./flutter.js";
import {
  detectReactNative,
  isExpoManaged,
  isReactNativeProject,
} from "./reactNative.js";
import { detectPods, detectGradle } from "./native.js";
import { harvestPrivacyManifests } from "./harvest.js";
import { lookup } from "../kb/index.js";
import type {
  CoverageEntry,
  DetectedDependency,
  HarvestedManifest,
  KbEntry,
  ResolvedSdk,
  ScanResult,
} from "../types.js";

export function scanProject(projectRoot: string): ScanResult {
  const projectType: ScanResult["projectType"] = [];
  if (isFlutterProject(projectRoot)) projectType.push("flutter");
  if (isReactNativeProject(projectRoot)) projectType.push("react-native");

  const detected: DetectedDependency[] = [
    ...detectFlutter(projectRoot),
    ...detectReactNative(projectRoot),
    // Native layers exist in both Flutter and RN projects.
    ...detectPods(projectRoot),
    ...detectGradle(projectRoot),
  ];

  const resolved: ResolvedSdk[] = [];
  let unknown: DetectedDependency[] = [];
  const seenEntry = new Set<string>();

  for (const dep of detected) {
    const entry = lookup(dep.ecosystem, dep.name);
    if (entry) {
      // De-duplicate: the same SDK often shows up in both pub and pod layers.
      if (!seenEntry.has(entry.id)) {
        resolved.push({ dependency: dep, entry });
        seenEntry.add(entry.id);
      }
    } else if (isLikelyThirdParty(dep)) {
      unknown.push(dep);
    }
  }

  const { manifests, errors } = harvestPrivacyManifests(projectRoot);
  const coveredByHarvest = attachHarvested(projectRoot, manifests, detected, resolved);
  unknown = unknown.filter(
    (d) => !coveredByHarvest.has(depKey(d.ecosystem, d.name)),
  );

  const { unknown: curated, suppressed } = classifyUnknown(unknown, detected);

  return {
    projectType,
    detected,
    resolved,
    unknown: curated,
    harvestedManifests: manifests,
    harvestErrors: errors,
    coverage: computeCoverage(projectRoot, projectType, manifests.length),
    suppressed,
  };
}

/**
 * A compliance tool must never be silently blind. Report per layer whether
 * it could actually be scanned — Expo managed apps, missing lockfiles and
 * uninstalled Pods otherwise produce confident-looking but partial results.
 */
function computeCoverage(
  projectRoot: string,
  projectType: ScanResult["projectType"],
  harvestedCount: number,
): CoverageEntry[] {
  if (projectType.length === 0) return [];
  const coverage: CoverageEntry[] = [];
  const expo = isExpoManaged(projectRoot);

  if (projectType.includes("flutter")) {
    coverage.push({
      layer: "Flutter packages (pubspec.lock)",
      ok: existsSync(join(projectRoot, "pubspec.lock")),
      hint: "run `flutter pub get` to create pubspec.lock",
    });
  }

  const hasPodfileLock =
    existsSync(join(projectRoot, "ios", "Podfile.lock")) ||
    existsSync(join(projectRoot, "Podfile.lock"));
  coverage.push({
    layer: "iOS native pods (Podfile.lock)",
    ok: hasPodfileLock,
    hint: expo
      ? "Expo managed workflow: run `npx expo prebuild` first — native SDKs are INVISIBLE to this scan until the ios/ project exists"
      : "run `pod install` (or commit ios/Podfile.lock)",
  });

  coverage.push({
    layer: "Android dependencies (build.gradle)",
    ok:
      existsSync(join(projectRoot, "android", "app", "build.gradle")) ||
      existsSync(join(projectRoot, "android", "build.gradle")),
    hint: expo
      ? "Expo managed workflow: run `npx expo prebuild` first — the android/ project does not exist yet"
      : "android/ project not found",
  });

  coverage.push({
    layer: "SDK-shipped privacy manifests",
    ok: harvestedCount > 0 || existsSync(join(projectRoot, "ios", "Pods")),
    hint: "run `pod install`, then re-scan to read each SDK's own declaration",
  });

  return coverage;
}

/**
 * Keep the unknown list actionable: a real project drags in hundreds of
 * transitive/dev packages. Suppress (but count) everything the developer
 * did not directly choose or that is a known non-collecting utility.
 */
function classifyUnknown(
  unknown: DetectedDependency[],
  detected: DetectedDependency[],
): { unknown: DetectedDependency[]; suppressed: ScanResult["suppressed"] } {
  const suppressed = { dev: 0, transitive: 0, shards: 0, utilities: 0 };
  const detectedNames = new Set(detected.map((d) => d.name.toLowerCase()));

  const curated: DetectedDependency[] = [];
  const seen = new Set<string>();
  for (const dep of unknown) {
    // Pod subspecs (DKImagePickerController/Core) roll up to their parent.
    const name = dep.ecosystem === "pod" ? dep.name.split("/")[0] : dep.name;

    if (isPlatformShard(name, detectedNames)) {
      suppressed.shards++;
    } else if (dep.scope === "dev") {
      suppressed.dev++;
    } else if (dep.scope === "transitive") {
      suppressed.transitive++;
    } else if (UTILITY_PACKAGES.has(name)) {
      suppressed.utilities++;
    } else if (!seen.has(`${dep.ecosystem}::${name.toLowerCase()}`)) {
      seen.add(`${dep.ecosystem}::${name.toLowerCase()}`);
      curated.push(name === dep.name ? dep : { ...dep, name });
    }
    // duplicate rolled-up subspecs are silently deduped
  }
  return { unknown: curated, suppressed };
}

// foo_android / foo_darwin / foo_platform_interface … are implementation
// shards of a federated plugin; the base package is the reviewable unit.
const SHARD_SUFFIXES = [
  "android", "ios", "darwin", "macos", "linux", "windows", "web",
  "apple", "foundation", "avfoundation", "platform_interface",
];

export function isPlatformShard(name: string, detectedNames: Set<string>): boolean {
  for (const suffix of SHARD_SUFFIXES) {
    if (name.endsWith(`_${suffix}`)) {
      const base = name.slice(0, -(suffix.length + 1));
      if (detectedNames.has(base.toLowerCase())) return true;
    }
  }
  return false;
}

// Infrastructure the ecosystem drags in that collects nothing for a vendor.
// They still ship their own privacy manifests, which harvest reads anyway.
const UTILITY_PACKAGES = new Set([
  "nanopb", "PromisesObjC", "PromisesSwift", "GoogleUtilities",
  "GoogleDataTransport", "GoogleToolboxForMac", "GTMSessionFetcher",
  "FirebaseCore", "FirebaseCoreInternal", "FirebaseCoreExtension",
  "FirebaseInstallations", "FirebaseABTesting", "FirebaseSessions",
  "FirebaseRemoteConfigInterop", "FirebaseSharedSwift", "RecaptchaInterop",
  "SDWebImage", "SwiftyGif", "DKImagePickerController", "DKPhotoGallery",
  "FMDB", "libwebp", "OrderedSet", "Toast", "ReachabilitySwift", "Protobuf",
  "abseil", "BoringSSL-GRPC", "gRPC-Core", "gRPC-C++", "leveldb-library",
  // Flutter framework / asset packages (pub) — not third-party SDKs.
  "flutter", "flutter_localizations", "flutter_test", "flutter_driver",
  "flutter_web_plugins", "sky_engine", "integration_test", "cupertino_icons",
  // Expo framework core (npm) — its expo-* feature packages stay reviewable.
  "expo",
]);

/**
 * Attach each attributed manifest to the SDK that ships it:
 *  - owner resolves in the KB   -> attach to that ResolvedSdk
 *  - owner is a detected dep    -> synthesize a harvested-only entry
 *  - owner not detected at all  -> leave unattached (stale Pods etc.); the
 *    lockfile is the trust anchor for what actually ships in the app.
 * Returns the dep keys now covered by synthetic entries (to drop from unknown).
 */
function attachHarvested(
  projectRoot: string,
  manifests: HarvestedManifest[],
  detected: DetectedDependency[],
  resolved: ResolvedSdk[],
): Set<string> {
  const byEntryId = new Map(resolved.map((r) => [r.entry.id, r]));
  const byDepKey = new Map(
    detected.map((d) => [depKey(d.ecosystem, d.name), d]),
  );
  const synthetic = new Map<string, ResolvedSdk>();

  for (const m of manifests) {
    if (!m.owner) continue;

    const kbEntry = lookup(m.owner.ecosystem, m.owner.name);
    if (kbEntry) {
      // Only aggregate if the dependency was actually detected in a lockfile.
      const r = byEntryId.get(kbEntry.id);
      if (r) (r.harvested ??= []).push(m);
      continue;
    }

    // A manifest that declares no collection (e.g. async-storage: accessed
    // APIs only) has nothing to contribute to the aggregate — don't invent
    // a data-collecting SDK out of it.
    if (!m.apple.length && !m.tracking && !m.trackingDomains.length) continue;

    const key = depKey(m.owner.ecosystem, m.owner.name);
    const dep = byDepKey.get(key);
    if (!dep) continue;

    let r = synthetic.get(key);
    if (!r) {
      r = {
        dependency: dep,
        entry: syntheticEntry(projectRoot, dep, m),
        harvested: [],
      };
      synthetic.set(key, r);
      resolved.push(r);
    }
    r.harvested!.push(m);
  }

  return new Set(synthetic.keys());
}

/** An SDK we only know through its own shipped manifest. Play side is unknown. */
function syntheticEntry(
  projectRoot: string,
  dep: DetectedDependency,
  m: HarvestedManifest,
): KbEntry {
  return {
    id: `harvested:${dep.name}`,
    name: dep.name,
    aliases: { [dep.ecosystem]: [dep.name] },
    tracking: false, // unused: effectiveAppleData reads the harvested manifests
    trackingDomains: [],
    apple: [],
    play: [], // no Play data — the report flags this for manual review
    source: `harvested from ${relative(projectRoot, m.path)}`,
  };
}

function depKey(ecosystem: string, name: string): string {
  return `${ecosystem}::${name.toLowerCase()}`;
}

// Filter out first-party / framework noise so the "unknown" list is actionable.
const IGNORE_PREFIXES = [
  "Flutter",
  "React",
  "react-native/",
  "RCT",
  "boost",
  "glog",
  "fmt",
  "DoubleConversion",
];

function isLikelyThirdParty(dep: DetectedDependency): boolean {
  if (dep.name === "Flutter" || dep.name === "react-native") return false;
  return !IGNORE_PREFIXES.some((p) => dep.name.startsWith(p));
}
