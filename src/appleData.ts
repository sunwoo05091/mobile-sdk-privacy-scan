// The single precedence point for Apple-side data: an SDK's own shipped
// PrivacyInfo.xcprivacy beats our KB seed data. Generator and drift both read
// through here so the draft and the drift verdict can never disagree.
import type { AppleCollectedType, ResolvedSdk } from "./types.js";

export interface EffectiveAppleData {
  apple: AppleCollectedType[];
  tracking: boolean;
  trackingDomains: string[];
  /** "manifest" = the SDK's own declaration; "kb" = our seed data (verify!). */
  provenance: "manifest" | "kb";
}

/** Merge declarations by data type: linked/tracking OR, purposes union. */
export function mergeAppleTypes(
  types: AppleCollectedType[],
): AppleCollectedType[] {
  const merged = new Map<string, AppleCollectedType>();
  for (const t of types) {
    const existing = merged.get(t.type);
    if (existing) {
      existing.linked ||= t.linked;
      existing.tracking ||= t.tracking;
      existing.purposes = Array.from(
        new Set([...existing.purposes, ...t.purposes]),
      );
    } else {
      merged.set(t.type, { ...t, purposes: [...t.purposes] });
    }
  }
  return Array.from(merged.values()).sort((a, b) =>
    a.type.localeCompare(b.type),
  );
}

export function effectiveAppleData(r: ResolvedSdk): EffectiveAppleData {
  if (r.harvested && r.harvested.length > 0) {
    // Several binaries of one SDK may each ship a manifest
    // (e.g. FirebaseAnalytics + GoogleAppMeasurement) — union them.
    return {
      apple: mergeAppleTypes(r.harvested.flatMap((m) => m.apple)),
      tracking: r.harvested.some((m) => m.tracking),
      trackingDomains: Array.from(
        new Set(r.harvested.flatMap((m) => m.trackingDomains)),
      ).sort(),
      provenance: "manifest",
    };
  }
  return {
    apple: r.entry.apple,
    tracking: r.entry.tracking,
    trackingDomains: r.entry.trackingDomains,
    provenance: "kb",
  };
}
