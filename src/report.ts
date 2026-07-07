import pc from "picocolors";
import { effectiveAppleData } from "./appleData.js";
import type { ScanResult } from "./types.js";
import type { DriftReport } from "./drift.js";
import type { RequiredReasonSuggestion } from "./requiredReasons.js";
import type { CapabilityHint, PermissionWarning } from "./capabilities.js";
import type { UnusedDependency } from "./unused.js";

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

  // Never be silently blind: say which layers could actually be scanned.
  if (result.coverage.length) {
    const blind = result.coverage.filter((c) => !c.ok);
    console.log(pc.bold("\nCoverage:"));
    for (const c of result.coverage) {
      if (c.ok) {
        console.log(`  ${pc.green("✓")} ${pc.dim(c.layer)}`);
      } else {
        console.log(
          `  ${pc.red("✗")} ${c.layer} ${pc.red(pc.bold("— NOT SCANNED"))}` +
            (c.hint ? pc.dim(`: ${c.hint}`) : ""),
        );
      }
    }
    if (blind.length) {
      console.log(
        pc.red(
          `  ⚠ Results are PARTIAL — ${blind.length} layer(s) invisible to this scan. ` +
            "SDKs living there are missing from everything below.",
        ),
      );
    }
  }

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
      `  ${pc.magenta("•")} ${pc.bold(h.collects)} ${pc.dim(
        `← ${h.evidence.join(", ")}`,
      )}`,
    );
  }
  console.log(
    pc.dim(
      "  Added to both drafts with Linked=false + AppFunctionality — REVIEW them:\n" +
        "  set Linked=true if tied to user identity, and fix purposes/shared.",
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

  // "Depends on app configuration" SDKs: say exactly what to check.
  for (const r of result.resolved) {
    if (r.entry.configNote) {
      lines.push(`${pc.cyan("CONFIG")} ${r.entry.name}: ${r.entry.configNote}`);
    }
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

export function printPermissionWarnings(warnings: PermissionWarning[]): void {
  if (!warnings.length) return;
  console.log(
    pc.bold(pc.red("\nMissing iOS permission strings (crash / rejection risk):")),
  );
  for (const w of warnings) {
    console.log(
      `  ${pc.red("✗")} ${pc.bold(w.missingKey)} ${pc.dim(
        `required by ${w.because.join("; ")}`,
      )}`,
    );
  }
}

export function printUnused(unused: UnusedDependency[]): void {
  if (!unused.length) return;
  console.log(
    pc.bold("\nPossibly unused dependencies") +
      pc.dim(" (declared, but no import found in your source):"),
  );
  for (const u of [...unused].sort((a, b) => Number(b.knownSdk) - Number(a.knownSdk))) {
    if (u.knownSdk) {
      console.log(
        `  ${pc.red("!")} ${u.package} ${pc.red(
          "— data-collecting SDK: it still ships in your binary and forces privacy declarations. Remove it if truly unused.",
        )}`,
      );
    } else {
      console.log(`  ${pc.dim("·")} ${u.package} ${pc.dim(`(${u.ecosystem})`)}`);
    }
  }
  console.log(
    pc.dim(
      "  Import-scanning has false positives (assets, codegen, native-only use).\n" +
        "  Remove one at a time and prove it: pub get / install -> codegen -> analyze -> build.",
    ),
  );
}

export function printBaselineDelta(
  delta: import("./baseline.js").BaselineDelta,
): void {
  const changes: string[] = [];
  if (delta.addedSdks.length) changes.push(`${pc.red("+")} SDKs: ${delta.addedSdks.join(", ")}`);
  if (delta.removedSdks.length) changes.push(`${pc.green("-")} SDKs: ${delta.removedSdks.join(", ")}`);
  if (delta.addedTypes.length) changes.push(`${pc.red("+")} data types: ${delta.addedTypes.join(", ")}`);
  if (delta.removedTypes.length) changes.push(`${pc.green("-")} data types: ${delta.removedTypes.join(", ")}`);
  if (delta.trackingTurnedOn) changes.push(pc.red("+ tracking turned ON"));
  if (delta.trackingTurnedOff) changes.push(pc.green("- tracking turned off"));
  if (delta.newUncoveredReasons.length) {
    changes.push(`${pc.red("+")} uncovered required-reason APIs: ${delta.newUncoveredReasons.join(", ")}`);
  }

  console.log(pc.bold("\nPrivacy delta vs committed baseline (.privacy-baseline.json):"));
  if (!changes.length) {
    console.log(pc.green("  ✓ no change in privacy posture"));
    return;
  }
  for (const c of changes) console.log(`  ${c}`);
  if (delta.expanded) {
    console.log(
      pc.red(
        "  ⚠ Collection EXPANDED. Update your store declarations, then re-baseline\n" +
          "    with --update-baseline to acknowledge. (exit 1)",
      ),
    );
  }
}

/** The explicit trust boundary: what this scan proves vs what only you can decide. */
export function printTrustBoundary(): void {
  console.log(pc.bold("\nTrust boundary — read this before submitting:"));
  console.log(
    `  ${pc.green("✓ verified")}   ${pc.dim(
      "[manifest] entries: read from the SDK's own shipped declaration (as truthful as the vendor made it)",
    )}`,
  );
  console.log(
    `  ${pc.yellow("~ curated")}    ${pc.dim(
      "[KB seed] entries and all Play rows: our research — verify against vendor docs / Play SDK Index",
    )}`,
  );
  console.log(
    `  ${pc.red("✗ yours")}      ${pc.dim(
      "Linked-to-identity, purposes, tracking intent, backend-collected data (login, IDs):",
    )}\n               ${pc.dim(
      "no scanner can decide these. Drafts are a reviewed starting point — not legal advice.",
    )}`,
  );
}

export function printExplanation(
  e: import("./explain.js").Explanation,
  hasProject: boolean,
): void {
  if (e.empty) {
    console.log(
      pc.yellow(
        "No stable codes found in that text. Paste the full rejection mail — " +
          "the useful parts look like ITMS-91053 and NSPrivacyAccessedAPICategory…",
      ),
    );
    return;
  }

  for (const { code, meaning } of e.itms) {
    console.log(`${pc.bold(pc.red(code))} — ${meaning}\n`);
  }

  for (const c of e.categories) {
    console.log(pc.bold(`${pc.cyan(c.category)} (${c.label})`));
    console.log(`  Triggered by: ${pc.dim(c.trigger)}`);
    if (c.culprits.length) {
      console.log(pc.bold("  In YOUR project this likely comes from:"));
      for (const culprit of c.culprits) {
        console.log(
          culprit.covered
            ? `    ${pc.green("✓")} ${culprit.package} — its own manifest declares this; ` +
                `if the error persists, YOUR app code also uses the API: declare it app-side.`
            : `    ${pc.red("✗")} ${culprit.package} — no shipped manifest covers it. Fix: update ` +
                `the package, or declare ${c.category} (${culprit.reasons.join(", ")}) in your PrivacyInfo.xcprivacy.`,
        );
      }
    } else if (hasProject) {
      console.log(
        pc.yellow(
          "  No known package in this project maps to it — your own native/app " +
            "code (or an SDK we don't know) calls the API. Declare the reason app-side.",
        ),
      );
    }
    console.log(pc.bold("  Approved reasons:"));
    for (const [code, desc] of Object.entries(c.reasons)) {
      console.log(`    ${pc.green(code)} ${pc.dim(desc)}`);
    }
    console.log();
  }

  if (e.collectedTypes.length) {
    console.log(
      pc.bold("Collected data types mentioned: ") + e.collectedTypes.join(", "),
    );
    console.log(
      pc.dim(
        "  These belong in NSPrivacyCollectedDataTypes. Run a scan with " +
          "--compare against your manifest to see exactly what's missing.\n",
      ),
    );
  }

  console.log(pc.dim(`Reason definitions: ${e.docsUrl}`));
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
