// App-own data collection hints, from three independent signals:
//   1. capability packages (geolocator, camera, …)
//   2. iOS Info.plist usage-description keys (catches packages we don't know)
//   3. AndroidManifest.xml permissions
// These feed draft entries that the developer MUST review (Linked/purposes).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DetectedDependency } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface PlayRef {
  category: string;
  type: string;
}

interface CapabilityRule {
  ecosystem: string;
  name: string;
  collects: string;
  appleTypes: string[];
  play: PlayRef[];
  /** Info.plist keys of which at least ONE must exist when this package is used. */
  iosUsageKeys?: string[];
}

export interface CapabilityHint {
  collects: string;
  appleTypes: string[];
  play: PlayRef[];
  /** What produced this hint, e.g. "package geolocator" or "Info.plist NSCameraUsageDescription". */
  evidence: string[];
}

function loadRules(): CapabilityRule[] {
  const candidates = [
    join(__dirname, "kb", "capabilities.json"),
    join(__dirname, "..", "src", "kb", "capabilities.json"),
  ];
  for (const p of candidates) {
    try {
      return (JSON.parse(readFileSync(p, "utf8")) as { packages: CapabilityRule[] })
        .packages;
    } catch {
      /* try next */
    }
  }
  throw new Error("Could not locate capabilities.json");
}

const rules = loadRules();

// iOS usage-description keys → the same collection shapes.
const IOS_PERMISSION_MAP: Record<string, Omit<CapabilityHint, "evidence">> = {
  NSLocationWhenInUseUsageDescription: LOC(),
  NSLocationAlwaysAndWhenInUseUsageDescription: LOC(),
  NSLocationAlwaysUsageDescription: LOC(),
  NSCameraUsageDescription: {
    collects: "Photos or videos (camera)",
    appleTypes: ["NSPrivacyCollectedDataTypePhotosorVideos"],
    play: [
      { category: "Photos and videos", type: "Photos" },
      { category: "Photos and videos", type: "Videos" },
    ],
  },
  NSPhotoLibraryUsageDescription: {
    collects: "Photos or videos (library)",
    appleTypes: ["NSPrivacyCollectedDataTypePhotosorVideos"],
    play: [{ category: "Photos and videos", type: "Photos" }],
  },
  NSPhotoLibraryAddUsageDescription: {
    collects: "Photos or videos (library)",
    appleTypes: ["NSPrivacyCollectedDataTypePhotosorVideos"],
    play: [{ category: "Photos and videos", type: "Photos" }],
  },
  NSMicrophoneUsageDescription: {
    collects: "Audio (microphone)",
    appleTypes: ["NSPrivacyCollectedDataTypeAudioData"],
    play: [{ category: "Audio", type: "Voice or sound recordings" }],
  },
  NSContactsUsageDescription: {
    collects: "Contacts",
    appleTypes: ["NSPrivacyCollectedDataTypeContacts"],
    play: [{ category: "Contacts", type: "Contacts" }],
  },
  NSHealthShareUsageDescription: {
    collects: "Health data",
    appleTypes: ["NSPrivacyCollectedDataTypeHealth"],
    play: [{ category: "Health and fitness", type: "Health info" }],
  },
};

const ANDROID_PERMISSION_MAP: Record<string, Omit<CapabilityHint, "evidence">> = {
  "android.permission.ACCESS_FINE_LOCATION": LOC(),
  "android.permission.ACCESS_COARSE_LOCATION": {
    collects: "Location (approximate)",
    appleTypes: ["NSPrivacyCollectedDataTypeCoarseLocation"],
    play: [{ category: "Location", type: "Approximate location" }],
  },
  "android.permission.CAMERA": IOS_PERMISSION_MAP.NSCameraUsageDescription,
  "android.permission.RECORD_AUDIO": IOS_PERMISSION_MAP.NSMicrophoneUsageDescription,
  "android.permission.READ_CONTACTS": IOS_PERMISSION_MAP.NSContactsUsageDescription,
};

function LOC(): Omit<CapabilityHint, "evidence"> {
  return {
    collects: "Location (precise)",
    appleTypes: ["NSPrivacyCollectedDataTypePreciseLocation"],
    play: [{ category: "Location", type: "Precise location" }],
  };
}

export function detectCapabilities(
  scan: { detected: DetectedDependency[] },
  projectRoot?: string,
): CapabilityHint[] {
  // Merge by collection shape so "geolocator" + NSLocation… + FINE_LOCATION
  // become ONE hint with three pieces of evidence.
  const merged = new Map<string, CapabilityHint>();
  const add = (shape: Omit<CapabilityHint, "evidence">, evidence: string) => {
    const key = [...shape.appleTypes].sort().join("|") + "::" + shape.collects;
    const existing = merged.get(key);
    if (existing) existing.evidence.push(evidence);
    else merged.set(key, { ...shape, evidence: [evidence] });
  };

  for (const rule of rules) {
    const dep = scan.detected.find(
      (d) =>
        d.ecosystem === rule.ecosystem &&
        d.name.toLowerCase() === rule.name.toLowerCase(),
    );
    if (dep) {
      add(
        { collects: rule.collects, appleTypes: rule.appleTypes, play: rule.play },
        `package ${dep.name}`,
      );
    }
  }

  if (projectRoot) {
    for (const key of readIosPermissionKeys(projectRoot)) {
      const shape = IOS_PERMISSION_MAP[key];
      if (shape) add(shape, `Info.plist ${key}`);
    }
    for (const perm of readAndroidPermissions(projectRoot)) {
      const shape = ANDROID_PERMISSION_MAP[perm];
      if (shape) add(shape, `AndroidManifest ${perm.replace("android.permission.", "")}`);
    }
  }

  return [...merged.values()];
}

/** Concatenated text of the app target's ios/<App>/Info.plist file(s). */
function appInfoPlistText(projectRoot: string): string | undefined {
  const iosDir = join(projectRoot, "ios");
  let entries: string[];
  try {
    entries = readdirSync(iosDir);
  } catch {
    return undefined;
  }
  const chunks: string[] = [];
  for (const name of entries) {
    if (name === "Pods" || name.startsWith(".")) continue;
    const plistPath = join(iosDir, name, "Info.plist");
    if (!existsSync(plistPath)) continue;
    try {
      chunks.push(readFileSync(plistPath, "utf8"));
    } catch {
      /* unreadable — skip */
    }
  }
  return chunks.length ? chunks.join("\n") : undefined;
}

/** Keys present in the app target's ios/<App>/Info.plist. */
function readIosPermissionKeys(projectRoot: string): string[] {
  const text = appInfoPlistText(projectRoot);
  if (text === undefined) return [];
  // Key scan is enough — values are human-readable strings.
  return Object.keys(IOS_PERMISSION_MAP).filter((key) =>
    text.includes(`<key>${key}</key>`),
  );
}

export interface PermissionWarning {
  /** The Info.plist key to add (first acceptable alternative). */
  missingKey: string;
  /** What requires it. */
  because: string[];
}

/**
 * Reverse check: a capability package (or tracking SDK) is present but the
 * matching Info.plist usage string is missing — runtime crash and App Review
 * rejection material. Silent when no app Info.plist exists at all (the
 * coverage report already screams about that).
 */
export function checkIosPermissionStrings(
  scan: { detected: DetectedDependency[] },
  projectRoot: string,
  trackingDetected: boolean,
): PermissionWarning[] {
  const text = appInfoPlistText(projectRoot);
  if (text === undefined) return [];
  const has = (key: string) => text.includes(`<key>${key}</key>`);

  const byKey = new Map<string, PermissionWarning>();
  const add = (missingKey: string, because: string) => {
    const existing = byKey.get(missingKey);
    if (existing) existing.because.push(because);
    else byKey.set(missingKey, { missingKey, because: [because] });
  };

  for (const rule of rules) {
    if (!rule.iosUsageKeys?.length) continue;
    const dep = scan.detected.find(
      (d) =>
        d.ecosystem === rule.ecosystem &&
        d.name.toLowerCase() === rule.name.toLowerCase(),
    );
    if (!dep) continue;
    if (!rule.iosUsageKeys.some(has)) {
      add(rule.iosUsageKeys[0], `${dep.name} (${rule.collects})`);
    }
  }

  if (trackingDetected && !has("NSUserTrackingUsageDescription")) {
    add(
      "NSUserTrackingUsageDescription",
      "tracking SDKs detected — the ATT prompt is mandatory before any tracking",
    );
  }

  return [...byKey.values()];
}

function readAndroidPermissions(projectRoot: string): string[] {
  const manifestPath = join(
    projectRoot, "android", "app", "src", "main", "AndroidManifest.xml",
  );
  let text: string;
  try {
    text = readFileSync(manifestPath, "utf8");
  } catch {
    return [];
  }
  const found = new Set<string>();
  const re = /uses-permission[^>]*android:name="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) found.add(m[1]);
  return [...found];
}

/** Deduped Apple collected-type entries to seed the app's draft manifest. */
export function capabilityAppleTypes(hints: CapabilityHint[]) {
  const types = new Set(hints.flatMap((h) => h.appleTypes));
  return [...types].sort().map((type) => ({
    type,
    linked: false, // REVIEW: set true when tied to user identity
    tracking: false,
    purposes: ["NSPrivacyCollectedDataTypePurposeAppFunctionality"],
  }));
}
