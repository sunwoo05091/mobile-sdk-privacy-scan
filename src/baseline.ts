// Privacy baseline: a COMMITTED snapshot of the app's acknowledged privacy
// posture (.privacy-baseline.json). Works like a lockfile: any expansion of
// collection (new SDK, new data type, tracking turned on, new uncovered
// required-reason API) fails CI until the team re-baselines deliberately.
// scan.json can't play this role — it's gitignored output that moves every run.
import { readFileSync, writeFileSync } from "node:fs";
import { effectiveAppleData } from "./appleData.js";
import type { AppleCollectedType, ResolvedSdk } from "./types.js";
import type { RequiredReasonSuggestion } from "./requiredReasons.js";

export interface PrivacyBaseline {
  schemaVersion: 1;
  /** KB ids / harvested ids of recognized SDKs. */
  sdks: string[];
  tracking: boolean;
  trackingDomains: string[];
  /** Apple collected data types in the aggregate (SDKs + app features). */
  appleTypes: string[];
  /** Required-reason categories suggested but not covered by any package manifest. */
  uncoveredReasonCategories: string[];
}

export interface BaselineDelta {
  addedSdks: string[];
  removedSdks: string[];
  addedTypes: string[];
  removedTypes: string[];
  trackingTurnedOn: boolean;
  trackingTurnedOff: boolean;
  newUncoveredReasons: string[];
  /** true when collection EXPANDED — the CI-failing condition. */
  expanded: boolean;
}

export function buildBaseline(
  resolved: ResolvedSdk[],
  appCollected: AppleCollectedType[],
  requiredReasons: RequiredReasonSuggestion[],
): PrivacyBaseline {
  const effective = resolved.map(effectiveAppleData);
  return {
    schemaVersion: 1,
    sdks: resolved.map((r) => r.entry.id).sort(),
    tracking: effective.some((e) => e.tracking),
    trackingDomains: [...new Set(effective.flatMap((e) => e.trackingDomains))].sort(),
    appleTypes: [
      ...new Set([
        ...effective.flatMap((e) => e.apple.map((t) => t.type)),
        ...appCollected.map((t) => t.type),
      ]),
    ].sort(),
    uncoveredReasonCategories: requiredReasons
      .filter((s) => !s.covered)
      .map((s) => s.category)
      .sort(),
  };
}

export function diffBaseline(
  before: PrivacyBaseline,
  after: PrivacyBaseline,
): BaselineDelta {
  const diff = (a: string[], b: string[]) => b.filter((x) => !a.includes(x));
  const delta: BaselineDelta = {
    addedSdks: diff(before.sdks, after.sdks),
    removedSdks: diff(after.sdks, before.sdks),
    addedTypes: diff(before.appleTypes, after.appleTypes),
    removedTypes: diff(after.appleTypes, before.appleTypes),
    trackingTurnedOn: !before.tracking && after.tracking,
    trackingTurnedOff: before.tracking && !after.tracking,
    newUncoveredReasons: diff(
      before.uncoveredReasonCategories,
      after.uncoveredReasonCategories,
    ),
    expanded: false,
  };
  delta.expanded =
    delta.addedSdks.length > 0 ||
    delta.addedTypes.length > 0 ||
    delta.trackingTurnedOn ||
    delta.newUncoveredReasons.length > 0;
  return delta;
}

export function readBaseline(path: string): PrivacyBaseline | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as PrivacyBaseline;
    return parsed.schemaVersion === 1 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function writeBaseline(path: string, baseline: PrivacyBaseline): void {
  writeFileSync(path, JSON.stringify(baseline, null, 2) + "\n");
}
