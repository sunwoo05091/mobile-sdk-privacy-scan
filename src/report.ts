import pc from "picocolors";
import { effectiveAppleData } from "./appleData.js";
import { t, tf } from "./i18n.js";
import type { ScanResult } from "./types.js";
import type { DriftReport } from "./drift.js";
import type { RequiredReasonSuggestion } from "./requiredReasons.js";
import type { CapabilityHint, PermissionWarning } from "./capabilities.js";
import type { UnusedDependency } from "./unused.js";

export function printScanSummary(result: ScanResult): void {
  const types =
    result.projectType.length > 0
      ? result.projectType.join(" + ")
      : t("unknown (no Flutter/RN markers found)");
  console.log(pc.bold(`\n${t("Project type: ")}${pc.cyan(types)}`));
  console.log(
    `${t("Dependencies scanned: ")}${pc.bold(String(result.detected.length))}  ` +
      `| ${t("Known SDKs: ")}${pc.bold(pc.green(String(result.resolved.length)))}  ` +
      `| ${t("Unrecognized: ")}${pc.bold(pc.yellow(String(result.unknown.length)))}`,
  );

  // Never be silently blind: say which layers could actually be scanned.
  if (result.coverage.length) {
    const blind = result.coverage.filter((c) => !c.ok);
    console.log(pc.bold(`\n${t("Coverage:")}`));
    for (const c of result.coverage) {
      if (c.ok) {
        console.log(`  ${pc.green("✓")} ${pc.dim(t(c.layer))}`);
      } else {
        console.log(
          `  ${pc.red("✗")} ${t(c.layer)} ${pc.red(pc.bold(t("— NOT SCANNED")))}` +
            (c.hint ? pc.dim(`: ${t(c.hint)}`) : ""),
        );
      }
    }
    if (blind.length) {
      console.log(
        pc.red(
          tf(
            "  ⚠ Results are PARTIAL — {n} layer(s) invisible to this scan. SDKs living there are missing from everything below.",
            { n: blind.length },
          ),
        ),
      );
    }
  }

  if (result.resolved.length) {
    console.log(pc.bold(`\n${t("Recognized SDKs (data-collecting):")}`));
    for (const r of result.resolved) {
      const eff = effectiveAppleData(r);
      const provenance =
        eff.provenance === "manifest"
          ? pc.cyan("[manifest]")
          : pc.yellow("[KB seed]");
      const tracking = eff.tracking ? pc.red(" [tracking]") : "";
      const playGap =
        r.entry.play.length === 0
          ? pc.yellow(t(" — Play data unknown, check manually"))
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
        "\n" +
          tf("Privacy manifests shipped by dependencies: {n} parsed", {
            n: result.harvestedManifests.length,
          }),
      ) +
        pc.dim(
          tf(" ({a} attributed, {o} unattributed{e})", {
            a: attributed.length,
            o: orphans.length,
            e: result.harvestErrors.length
              ? tf(", {n} unparseable", { n: result.harvestErrors.length })
              : "",
          }),
        ),
    );
    for (const m of orphans.slice(0, 5)) {
      console.log(`  ${pc.blue("·")} ${pc.dim(`${t("unattributed: ")}${m.path}`)}`);
    }
    if (orphans.length > 5) {
      console.log(pc.dim(tf("  … and {n} more", { n: orphans.length - 5 })));
    }
  }

  if (result.unknown.length) {
    console.log(
      pc.bold(
        pc.yellow(
          "\n" +
            tf("Unrecognized direct dependencies — review these by hand ({n}):", {
              n: result.unknown.length,
            }),
        ),
      ),
    );
    for (const dep of result.unknown.slice(0, 25)) {
      console.log(`  ${pc.yellow("?")} ${dep.name} ${pc.dim(`(${dep.ecosystem})`)}`);
    }
    if (result.unknown.length > 25) {
      console.log(pc.dim(tf("  … and {n} more", { n: result.unknown.length - 25 })));
    }
  }

  const s = result.suppressed;
  const suppressedTotal = s.dev + s.transitive + s.shards + s.utilities;
  if (suppressedTotal > 0) {
    console.log(
      pc.dim(
        tf(
          "  suppressed {t} noise packages: {a} transitive, {b} dev-only, {c} platform shards, {d} known utilities (SDKs among them are still matched via the KB and shipped manifests)",
          { t: suppressedTotal, a: s.transitive, b: s.dev, c: s.shards, d: s.utilities },
        ),
      ),
    );
  }
}

export function printRequiredReasons(
  suggestions: RequiredReasonSuggestion[],
): void {
  if (!suggestions.length) return;
  console.log(
    pc.bold(`\n${t("Required-reason APIs (ITMS-91053) used by your dependencies:")}`),
  );
  for (const sug of suggestions) {
    const status = sug.covered
      ? pc.green(t("✓ covered by the package's own manifest"))
      : pc.yellow(
          tf(
            "⚠ no shipped manifest declares it — update the package, or declare {cat} ({reasons}) in YOUR PrivacyInfo.xcprivacy",
            { cat: sug.category, reasons: sug.reasons.join(", ") },
          ),
        );
    console.log(
      `  ${pc.cyan("•")} ${sug.package} ${pc.dim(`(${sug.note})`)}\n    ${status}`,
    );
  }
}

export function printCapabilities(hints: CapabilityHint[]): void {
  if (!hints.length) return;
  console.log(
    pc.bold(`\n${t("Your app's own data collection (app features, not SDKs):")}`),
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
      t(
        "  Added to both drafts with Linked=false + AppFunctionality — REVIEW them:\n  set Linked=true if tied to user identity, and fix purposes/shared.",
      ),
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
        t(
          "declare cross-app tracking: iOS requires the ATT prompt (NSUserTrackingUsageDescription) before any tracking, and their tracking domains are blocked until the user consents.",
        ),
    );
  }

  const silent = result.resolved.filter((r) => {
    const eff = effectiveAppleData(r);
    return eff.provenance === "manifest" && eff.apple.length === 0 && !eff.tracking;
  });
  if (silent.length) {
    lines.push(
      `${pc.yellow("CONSERVATIVE")} ${silent.map((r) => r.entry.name).join(", ")} ` +
        t(
          'ship a manifest that declares NO data collection. Vendors often under-declare ("depends on app configuration") — review what your configuration actually sends.',
        ),
    );
  }

  const seeded = result.resolved.filter(
    (r) => effectiveAppleData(r).provenance === "kb",
  );
  if (seeded.length) {
    lines.push(
      `${pc.yellow("UNVERIFIED")} ${seeded.map((r) => r.entry.name).join(", ")}: ` +
        t(
          "no shipped manifest was readable here — data comes from our knowledge base. Re-scan after `pod install` to read the SDK's own declaration.",
        ),
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
      `${pc.red("MALFORMED")} ` +
        tf(
          "{n} dependency manifest(s) could not be parsed — those SDKs' declarations are effectively missing.",
          { n: result.harvestErrors.length },
        ),
    );
  }

  if (!lines.length) return;
  console.log(pc.bold(`\n${t("Review notes:")}`));
  for (const l of lines) console.log(`  ${l}`);
}

export function printPermissionWarnings(warnings: PermissionWarning[]): void {
  if (!warnings.length) return;
  console.log(
    pc.bold(pc.red(`\n${t("Missing iOS permission strings (crash / rejection risk):")}`)),
  );
  for (const w of warnings) {
    console.log(
      `  ${pc.red("✗")} ${pc.bold(w.missingKey)} ${pc.dim(
        tf("required by {x}", { x: w.because.join("; ") }),
      )}`,
    );
  }
}

export function printUnused(unused: UnusedDependency[]): void {
  if (!unused.length) return;
  console.log(
    pc.bold(`\n${t("Possibly unused dependencies")}`) +
      pc.dim(t(" (declared, but no import found in your source):")),
  );
  for (const u of [...unused].sort((a, b) => Number(b.knownSdk) - Number(a.knownSdk))) {
    if (u.knownSdk) {
      console.log(
        `  ${pc.red("!")} ${u.package} ${pc.red(
          t(
            "— data-collecting SDK: it still ships in your binary and forces privacy declarations. Remove it if truly unused.",
          ),
        )}`,
      );
    } else {
      console.log(`  ${pc.dim("·")} ${u.package} ${pc.dim(`(${u.ecosystem})`)}`);
    }
  }
  console.log(
    pc.dim(
      t(
        "  Import-scanning has false positives (assets, codegen, native-only use).\n  Remove one at a time and prove it: pub get / install -> codegen -> analyze -> build.",
      ),
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
  if (delta.trackingTurnedOn) changes.push(pc.red(t("+ tracking turned ON")));
  if (delta.trackingTurnedOff) changes.push(pc.green(t("- tracking turned off")));
  if (delta.newUncoveredReasons.length) {
    changes.push(`${pc.red("+")} uncovered required-reason APIs: ${delta.newUncoveredReasons.join(", ")}`);
  }

  console.log(pc.bold(`\n${t("Privacy delta vs committed baseline (.privacy-baseline.json):")}`));
  if (!changes.length) {
    console.log(pc.green(t("  ✓ no change in privacy posture")));
    return;
  }
  for (const c of changes) console.log(`  ${c}`);
  if (delta.expanded) {
    console.log(
      pc.red(
        t(
          "  ⚠ Collection EXPANDED. Update your store declarations, then re-baseline\n    with --update-baseline to acknowledge. (exit 1)",
        ),
      ),
    );
  }
}

export function printExplanation(
  e: import("./explain.js").Explanation,
  hasProject: boolean,
): void {
  if (e.empty) {
    console.log(
      pc.yellow(
        t(
          "No stable codes found in that text. Paste the full rejection mail — the useful parts look like ITMS-91053 and NSPrivacyAccessedAPICategory…",
        ),
      ),
    );
    return;
  }

  for (const { code, meaning } of e.itms) {
    console.log(`${pc.bold(pc.red(code))} — ${meaning}\n`);
  }

  for (const c of e.categories) {
    console.log(pc.bold(`${pc.cyan(c.category)} (${c.label})`));
    console.log(`${t("  Triggered by: ")}${pc.dim(c.trigger)}`);
    if (c.culprits.length) {
      console.log(pc.bold(t("  In YOUR project this likely comes from:")));
      for (const culprit of c.culprits) {
        console.log(
          culprit.covered
            ? `    ${pc.green("✓")} ${culprit.package} ${t(
                "— its own manifest declares this; if the error persists, YOUR app code also uses the API: declare it app-side.",
              )}`
            : `    ${pc.red("✗")} ${culprit.package} ${tf(
                "— no shipped manifest covers it. Fix: update the package, or declare {cat} ({reasons}) in your PrivacyInfo.xcprivacy.",
                { cat: c.category, reasons: culprit.reasons.join(", ") },
              )}`,
        );
      }
    } else if (hasProject) {
      console.log(
        pc.yellow(
          t(
            "  No known package in this project maps to it — your own native/app code (or an SDK we don't know) calls the API. Declare the reason app-side.",
          ),
        ),
      );
    }
    console.log(pc.bold(t("  Approved reasons:")));
    for (const [code, desc] of Object.entries(c.reasons)) {
      console.log(`    ${pc.green(code)} ${pc.dim(desc)}`);
    }
    console.log();
  }

  if (e.collectedTypes.length) {
    console.log(
      pc.bold(t("Collected data types mentioned: ")) + e.collectedTypes.join(", "),
    );
    console.log(
      pc.dim(
        t(
          "  These belong in NSPrivacyCollectedDataTypes. Run a scan with --compare against your manifest to see exactly what's missing.\n",
        ),
      ),
    );
  }

  console.log(pc.dim(`${t("Reason definitions: ")}${e.docsUrl}`));
}

export function printNextSteps(steps: string[]): void {
  if (!steps.length) return;
  console.log(pc.bold(pc.cyan(`\n${t("Next steps:")}`)));
  steps.forEach((step, i) => console.log(`  ${i + 1}. ${step}`));
}

/** The explicit trust boundary: what this scan proves vs what only you can decide. */
export function printTrustBoundary(): void {
  console.log(pc.bold(`\n${t("Trust boundary — read this before submitting:")}`));
  console.log(
    `  ${pc.green(t("✓ verified"))}   ${pc.dim(
      t(
        "[manifest] entries: read from the SDK's own shipped declaration (as truthful as the vendor made it)",
      ),
    )}`,
  );
  console.log(
    `  ${pc.yellow(t("~ curated"))}    ${pc.dim(
      t(
        "[KB seed] entries and all Play rows: our research — verify against vendor docs / Play SDK Index",
      ),
    )}`,
  );
  console.log(
    `  ${pc.red(t("✗ yours"))}      ${pc.dim(
      t(
        "Linked-to-identity, purposes, tracking intent, backend-collected data (login, IDs):",
      ),
    )}\n               ${pc.dim(
      t(
        "no scanner can decide these. Drafts are a reviewed starting point — not legal advice.",
      ),
    )}`,
  );
}

export function printDrift(drift: DriftReport): void {
  console.log(pc.bold(`\n${t("Drift vs your existing PrivacyInfo.xcprivacy:")}`));
  if (drift.missing.length === 0 && drift.extra.length === 0) {
    console.log(pc.green(t("  ✓ No drift detected.")));
  }
  for (const type of drift.missing) {
    console.log(
      `  ${pc.red("MISSING")} ${type} ${pc.dim(t("(collected but not declared)"))}`,
    );
  }
  for (const type of drift.extra) {
    console.log(
      `  ${pc.yellow("EXTRA")}   ${type} ${pc.dim(t("(declared but no SDK found)"))}`,
    );
  }
  if (drift.trackingMismatch) {
    console.log(
      `  ${pc.red("TRACKING")} declared=${drift.trackingMismatch.declared} ` +
        `detected=${drift.trackingMismatch.detected}`,
    );
  }
}
