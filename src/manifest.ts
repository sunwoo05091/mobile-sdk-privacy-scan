// Parse a PrivacyInfo.xcprivacy document into our Apple data shape.
// Used by the scanner's harvester and by the KB bootstrap tool (tools/).
import plist from "plist";
import type { AppleCollectedType } from "./types.js";

export interface ParsedPrivacyManifest {
  tracking: boolean;
  trackingDomains: string[];
  apple: AppleCollectedType[];
}

/** @throws when the document is not a plist dict. Missing keys get defaults. */
export function parsePrivacyManifest(xml: string): ParsedPrivacyManifest {
  const doc = plist.parse(xml);
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) {
    throw new Error("manifest root is not a dict");
  }
  const dict = doc as Record<string, unknown>;

  const apple: AppleCollectedType[] = [];
  const rawTypes = Array.isArray(dict.NSPrivacyCollectedDataTypes)
    ? dict.NSPrivacyCollectedDataTypes
    : [];
  for (const raw of rawTypes) {
    if (typeof raw !== "object" || raw === null) continue;
    const t = raw as Record<string, unknown>;
    if (typeof t.NSPrivacyCollectedDataType !== "string") continue;
    apple.push({
      type: t.NSPrivacyCollectedDataType,
      linked: Boolean(t.NSPrivacyCollectedDataTypeLinked),
      tracking: Boolean(t.NSPrivacyCollectedDataTypeTracking),
      purposes: Array.isArray(t.NSPrivacyCollectedDataTypePurposes)
        ? t.NSPrivacyCollectedDataTypePurposes.filter(
            (p): p is string => typeof p === "string",
          )
        : [],
    });
  }

  return {
    tracking: Boolean(dict.NSPrivacyTracking),
    trackingDomains: Array.isArray(dict.NSPrivacyTrackingDomains)
      ? dict.NSPrivacyTrackingDomains.filter(
          (d): d is string => typeof d === "string",
          // Some SDKs (e.g. Adjust) write "https://consent.adjust.com" even
          // though Apple expects bare domains — normalize.
        ).map((d) => d.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/\/.*$/, ""))
      : [],
    apple,
  };
}
