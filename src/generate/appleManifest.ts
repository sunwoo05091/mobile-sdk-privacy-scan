import plist from "plist";
import { effectiveAppleData, mergeAppleTypes } from "../appleData.js";
import type { AppleCollectedType, ResolvedSdk } from "../types.js";

/** App-side additions the scanner derived itself (not SDK declarations). */
export interface DraftExtras {
  /** Uncovered required-reason suggestions -> NSPrivacyAccessedAPITypes. */
  accessedApis?: { category: string; reasons: string[] }[];
  /** App-feature collection (capability hints) -> NSPrivacyCollectedDataTypes. */
  appCollected?: AppleCollectedType[];
}

const ACCESSED_API_COMMENT = `<!--
      Entries here are auto-suggested from packages detected in YOUR app
      (SDK-side API use is declared in each SDK's own bundled manifest and
      must NOT be copied here). VERIFY each reason code matches how the app
      actually uses the API, and add anything the scanner cannot see.
      Missing declarations trigger ITMS-91053 at upload.
    -->`;

const APP_COLLECTED_COMMENT = `<!--
      REVIEW REQUIRED: entries marked from app features were added because
      your app itself collects them (location/camera/mic/...). They default
      to Linked=false and purpose AppFunctionality — if the data is tied to
      user identity (accounts, login, identity verification) set
      NSPrivacyCollectedDataTypeLinked to true and fix the purposes.
    -->`;

/**
 * Merge every resolved SDK's Apple declarations into a single
 * PrivacyInfo.xcprivacy plist string (the aggregate the app owner must file).
 * Per SDK, harvested manifests take precedence over KB data (appleData.ts).
 * App-side extras (required-reason suggestions, app-feature collection) are
 * filled in so the draft doesn't contradict the scanner's own warnings.
 */
export function generateAppleManifest(
  resolved: ResolvedSdk[],
  extras: DraftExtras = {},
): string {
  const effective = resolved.map(effectiveAppleData);
  const appCollected = extras.appCollected ?? [];

  const collected = mergeAppleTypes([
    ...effective.flatMap((e) => e.apple),
    ...appCollected,
  ]).map((t) => ({
    NSPrivacyCollectedDataType: t.type,
    NSPrivacyCollectedDataTypeLinked: t.linked,
    NSPrivacyCollectedDataTypeTracking: t.tracking,
    NSPrivacyCollectedDataTypePurposes: t.purposes,
  }));

  const doc = {
    NSPrivacyTracking: effective.some((e) => e.tracking),
    NSPrivacyTrackingDomains: Array.from(
      new Set(effective.flatMap((e) => e.trackingDomains)),
    ).sort(),
    NSPrivacyCollectedDataTypes: collected,
    NSPrivacyAccessedAPITypes: (extras.accessedApis ?? []).map((a) => ({
      NSPrivacyAccessedAPIType: a.category,
      NSPrivacyAccessedAPITypeReasons: a.reasons,
    })),
  };

  let xml = plist
    .build(doc as unknown as plist.PlistValue)
    .replace(
      "<key>NSPrivacyAccessedAPITypes</key>",
      `${ACCESSED_API_COMMENT}\n    <key>NSPrivacyAccessedAPITypes</key>`,
    );
  if (appCollected.length) {
    xml = xml.replace(
      "<key>NSPrivacyCollectedDataTypes</key>",
      `${APP_COLLECTED_COMMENT}\n    <key>NSPrivacyCollectedDataTypes</key>`,
    );
  }
  return xml;
}
