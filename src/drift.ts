import { readFileSync } from "node:fs";
import plist from "plist";
import { effectiveAppleData } from "./appleData.js";
import type { ResolvedSdk } from "./types.js";

export interface DriftReport {
  /** Data types SDKs collect but the current manifest does NOT declare. */
  missing: string[];
  /** Data types declared but no scanned SDK accounts for (possibly stale). */
  extra: string[];
  trackingMismatch?: { declared: boolean; detected: boolean };
}

/**
 * Compare the developer's existing PrivacyInfo.xcprivacy with what the scan
 * found. `missing` is the important list: those cause App Store rejections.
 */
export function detectDrift(
  existingManifestPath: string,
  resolved: ResolvedSdk[],
): DriftReport {
  const parsed = plist.parse(
    readFileSync(existingManifestPath, "utf8"),
  ) as Record<string, unknown>;

  const declaredTypes = new Set<string>();
  const declaredArr =
    (parsed.NSPrivacyCollectedDataTypes as Array<Record<string, unknown>>) ?? [];
  for (const d of declaredArr) {
    const t = d.NSPrivacyCollectedDataType;
    if (typeof t === "string") declaredTypes.add(t);
  }

  const detectedTypes = new Set<string>();
  let detectedTracking = false;
  for (const r of resolved) {
    const eff = effectiveAppleData(r);
    if (eff.tracking) detectedTracking = true;
    for (const t of eff.apple) detectedTypes.add(t.type);
  }

  const missing = [...detectedTypes].filter((t) => !declaredTypes.has(t)).sort();
  const extra = [...declaredTypes].filter((t) => !detectedTypes.has(t)).sort();

  const declaredTracking = Boolean(parsed.NSPrivacyTracking);
  const report: DriftReport = { missing, extra };
  if (declaredTracking !== detectedTracking) {
    report.trackingMismatch = {
      declared: declaredTracking,
      detected: detectedTracking,
    };
  }
  return report;
}
