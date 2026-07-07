import { relative } from "node:path";
import { detectFlutter, isFlutterProject } from "./flutter.js";
import { detectReactNative, isReactNativeProject } from "./reactNative.js";
import { detectPods, detectGradle } from "./native.js";
import { harvestPrivacyManifests } from "./harvest.js";
import { lookup } from "../kb/index.js";
import type {
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

  return {
    projectType,
    detected,
    resolved,
    unknown,
    harvestedManifests: manifests,
    harvestErrors: errors,
  };
}

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
