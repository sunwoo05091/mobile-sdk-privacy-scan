import pc from "picocolors";
import { effectiveAppleData } from "./appleData.js";
import type { ScanResult } from "./types.js";
import type { DriftReport } from "./drift.js";

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
      pc.bold(pc.yellow("\nUnrecognized dependencies — review these by hand:")),
    );
    for (const dep of result.unknown.slice(0, 25)) {
      console.log(`  ${pc.yellow("?")} ${dep.name} ${pc.dim(`(${dep.ecosystem})`)}`);
    }
    if (result.unknown.length > 25) {
      console.log(pc.dim(`  … and ${result.unknown.length - 25} more`));
    }
  }
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
