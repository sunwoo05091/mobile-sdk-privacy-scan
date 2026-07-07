import plist from "plist";
import { effectiveAppleData, mergeAppleTypes } from "../appleData.js";
import type { ResolvedSdk } from "../types.js";

// The app's own required-reason API use cannot come from SDK manifests — each
// SDK declares its own in its bundle. Warn instead of silently emitting [].
const ACCESSED_API_COMMENT = `<!--
      Required-reason APIs used by YOUR OWN app code must be declared here
      (e.g. UserDefaults via shared_preferences / @react-native-async-storage).
      Missing declarations trigger ITMS-91053 at upload. Do NOT copy SDK
      declarations here: each SDK ships its own manifest inside its bundle.
    -->`;

/**
 * Merge every resolved SDK's Apple declarations into a single
 * PrivacyInfo.xcprivacy plist string (the aggregate the app owner must file).
 * Per SDK, harvested manifests take precedence over KB data (appleData.ts).
 */
export function generateAppleManifest(resolved: ResolvedSdk[]): string {
  const effective = resolved.map(effectiveAppleData);

  const collected = mergeAppleTypes(effective.flatMap((e) => e.apple)).map(
    (t) => ({
      NSPrivacyCollectedDataType: t.type,
      NSPrivacyCollectedDataTypeLinked: t.linked,
      NSPrivacyCollectedDataTypeTracking: t.tracking,
      NSPrivacyCollectedDataTypePurposes: t.purposes,
    }),
  );

  const doc = {
    NSPrivacyTracking: effective.some((e) => e.tracking),
    NSPrivacyTrackingDomains: Array.from(
      new Set(effective.flatMap((e) => e.trackingDomains)),
    ).sort(),
    NSPrivacyCollectedDataTypes: collected,
    NSPrivacyAccessedAPITypes: [] as unknown[],
  };

  return plist
    .build(doc as unknown as plist.PlistValue)
    .replace(
      "<key>NSPrivacyAccessedAPITypes</key>",
      `${ACCESSED_API_COMMENT}\n    <key>NSPrivacyAccessedAPITypes</key>`,
    );
}
