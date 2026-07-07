import pc from "picocolors";
import { effectiveAppleData } from "./appleData.js";
import type { ScanResult } from "./types.js";
import type { DriftReport } from "./drift.js";
import type { RequiredReasonSuggestion } from "./requiredReasons.js";
import type { CapabilityHint } from "./capabilities.js";

export function printScanSummary(result: ScanResult): void {
  const types =
    result.projectType.length > 0
      ? result.projectType.join(" + ")
      : "unknown (no Flutter/RN markers found)";
  console.log(pc.bold(`\nProject type: ${pc.cyan(types)}`));
  console.log(
    `Dependencies scanned: ${pc.bold(String(result.detected.length))}  ` +
      `| Known SDKs: ${pc.bold(pc.green(String(result.resolved.length)))}  ` +
      `| Unrecognized: ${pc.bold(pc.yellow(String(result.unknown.length)))}`,
  );

  if (result.resolved.length) {
    console.log(pc.bold("\nRecognized SDKs (data-collecting):"));
    for (const r of result.resolved) {
      const eff = effectiveAppleData(r);
      const provenance =
        eff.provenance === "manifest"
          ? pc.cyan("[manifest]")
          : pc.yellow("[KB seed]");
      const tracking = eff.tracking ? pc.red(" [tracking]") : "";
      const playGap =
        r.entry.play.length === 0
          ? pc.yellow(" — Play data unknown, check manually")
          : "";
      console.log(
        `  ${pc.green("•")} ${r.entry.name} ${provenance}${tracking} ${pc.dim(
          `(${r.dependency.name} @ ${r.dependency.ecosystem})`,
        )}${playGap}`,
      );
    }
  }

  if (result.harvestedManifests.length || result.harvestErrors.length) {
    const attributed = result.harvestedManifests.filter((m) => m.owner);
    const orphans = result.harvestedManifests.filter((m) => !m.owner);
    console.log(
      pc.bold(
        `\nPrivacy manifests shipped by dependencies: ${result.harvestedManifests.length} parsed`,
      ) +
        pc.dim(
          ` (${attributed.length} attributed, ${orphans.length} unattributed` +
            (result.harvestErrors.length
              ? `, ${result.harvestErrors.length} unparseable`
              : "") +
            ")",
        ),
    );
    for (const m of orphans.slice(0, 5)) {
      console.log(`  ${pc.blue("·")} ${pc.dim(`unattributed: ${m.path}`)}`);
    }
    if (orphans.length > 5) {
      console.log(pc.dim(`  … and ${orphans.length - 5} more`));
    }
  }

  if (result.unknown.length) {
    console.log(
      pc.bold(
        pc.yellow(
          `\nUnrecognized direct dependencies — review these by hand (${result.unknown.length}):`,
        ),
      ),
    );
    for (const dep of result.unknown.slice(0, 25)) {
      console.log(`  ${pc.yellow("?")} ${dep.name} ${pc.dim(`(${dep.ecosystem})`)}`);
    }
    if (result.unknown.length > 25) {
      console.log(pc.dim(`  … and ${result.unknown.length - 25} more`));
    }
  }

  const s = result.suppressed;
  const suppressedTotal = s.dev + s.transitive + s.shards + s.utilities;
  if (suppressedTotal > 0) {
    console.log(
      pc.dim(
        `  suppressed ${suppressedTotal} noise packages: ${s.transitive} transitive, ` +
          `${s.dev} dev-only, ${s.shards} platform shards, ${s.utilities} known utilities ` +
          `(SDKs among them are still matched via the KB and shipped manifests)`,
      ),
    );
  }
}

export function printRequiredReasons(
  suggestions: RequiredReasonSuggestion[],
): void {
  if (!suggestions.length) return;
  console.log(
    pc.bold("\nRequired-reason APIs (ITMS-91053) used by your dependencies:"),
  );
  for (const s of suggestions) {
    const status = s.covered
      ? pc.green("✓ covered by the package's own manifest")
      : pc.yellow(
          `⚠ no shipped manifest declares it — update the package, or declare ` +
            `${s.category} (${s.reasons.join(", ")}) in YOUR PrivacyInfo.xcprivacy`,
        );
    console.log(
      `  ${pc.cyan("•")} ${s.package} ${pc.dim(`(${s.note})`)}\n    ${status}`,
    );
  }
}

export function printCapabilities(hints: CapabilityHint[]): void {
  if (!hints.length) return;
  console.log(
    pc.bold("\nYour app's own data collection (app features, not SDKs):"),
  );
  for (const h of hints) {
    console.log(
      `  ${pc.magenta("•")} ${h.package} → ${pc.bold(h.collects)}`,
    );
  }
  console.log(
    pc.dim(
      "  SDK scanning cannot declare these for you. If the app really collects them,\n" +
        "  add them to PrivacyInfo.xcprivacy AND the Play Data Safety form yourself.",
    ),
  );
}

/** Security / review feedback derived from what the scan actually found. */
export function printInsights(result: ScanResult): void {
  const lines: string[] = [];

  const trackers = result.resolved.filter((r) => effectiveAppleData(r).tracking);
  if (trackers.length) {
    lines.push(
      `${pc.red("TRACKING")} ${trackers.map((r) => r.entry.name).join(", ")} ` +
        `declare cross-app tracking: iOS requires the ATT prompt ` +
        `(NSUserTrackingUsageDescription) before any tracking, and their tracking ` +
        `domains are blocked until the user consents.`,
    );
  }

  const silent = result.resolved.filter((r) => {
    const eff = effectiveAppleData(r);
    return eff.provenance === "manifest" && eff.apple.length === 0 && !eff.tracking;
  });
  if (silent.length) {
    lines.push(
      `${pc.yellow("CONSERVATIVE")} ${silent.map((r) => r.entry.name).join(", ")} ` +
        `ship a manifest that declares NO data collection. Vendors often under-declare ` +
        `("depends on app configuration") — review what your configuration actually sends.`,
    );
  }

  const seeded = result.resolved.filter(
    (r) => effectiveAppleData(r).provenance === "kb",
  );
  if (seeded.length) {
    lines.push(
      `${pc.yellow("UNVERIFIED")} ${seeded.map((r) => r.entry.name).join(", ")}: ` +
        `no shipped manifest was readable here — data comes from our knowledge base. ` +
        `Re-scan after \`pod install\` to read the SDK's own declaration.`,
    );
  }

  if (result.harvestErrors.length) {
    lines.push(
      `${pc.red("MALFORMED")} ${result.harvestErrors.length} dependency manifest(s) ` +
        `could not be parsed — those SDKs' declarations are effectively missing.`,
    );
  }

  if (!lines.length) return;
  console.log(pc.bold("\nReview notes:"));
  for (const l of lines) console.log(`  ${l}`);
}

export function printNextSteps(steps: string[]): void {
  if (!steps.length) return;
  console.log(pc.bold(pc.cyan("\nNext steps:")));
  steps.forEach((step, i) => console.log(`  ${i + 1}. ${step}`));
}

export function printDrift(drift: DriftReport): void {
  console.log(pc.bold("\nDrift vs your existing PrivacyInfo.xcprivacy:"));
  if (drift.missing.length === 0 && drift.extra.length === 0) {
    console.log(pc.green("  ✓ No drift detected."));
  }
  for (const t of drift.missing) {
    console.log(`  ${pc.red("MISSING")} ${t} ${pc.dim("(collected but not declared)")}`);
  }
  for (const t of drift.extra) {
    console.log(`  ${pc.yellow("EXTRA")}   ${t} ${pc.dim("(declared but no SDK found)")}`);
  }
  if (drift.trackingMismatch) {
    console.log(
      `  ${pc.red("TRACKING")} declared=${drift.trackingMismatch.declared} ` +
        `detected=${drift.trackingMismatch.detected}`,
    );
  }
}
