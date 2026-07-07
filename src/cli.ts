#!/usr/bin/env node
import { existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { Command } from "commander";
import pc from "picocolors";
import { scanProject } from "./detect/index.js";
import { generateAppleManifest } from "./generate/appleManifest.js";
import {
  buildPlayRows,
  capabilityPlayRows,
  generatePlayMarkdown,
} from "./generate/playDataSafety.js";
import { detectDrift } from "./drift.js";
import { suggestRequiredReasons } from "./requiredReasons.js";
import { capabilityAppleTypes, detectCapabilities } from "./capabilities.js";
import { findUnusedDependencies } from "./unused.js";
import {
  printScanSummary,
  printDrift,
  printRequiredReasons,
  printCapabilities,
  printInsights,
  printNextSteps,
  printTrustBoundary,
  printUnused,
} from "./report.js";

const program = new Command();

program
  .name("sdk-privacy-scan")
  .description(
    "Scan a React Native or Flutter project for third-party SDKs and generate " +
      "Apple privacy manifest + Google Play Data Safety drafts. Runs fully locally.",
  )
  .version("0.1.0")
  .argument("[projectDir]", "path to the app project", ".")
  .option("-o, --out <dir>", "output directory for generated drafts", "privacy-out")
  .option(
    "--compare <path>",
    "existing PrivacyInfo.xcprivacy to check for drift",
  )
  .option("--json", "also write a machine-readable scan.json", false)
  .action((projectDir: string, opts) => {
    const root = resolve(projectDir);
    console.log(pc.dim(`Scanning ${root} …`));

    const result = scanProject(root);
    printScanSummary(result);

    const requiredReasons = suggestRequiredReasons(result);
    printRequiredReasons(requiredReasons);

    const capabilities = detectCapabilities(result, root);
    printCapabilities(capabilities);

    const unused = findUnusedDependencies(root, result);
    printUnused(unused);
    printInsights(result);

    // The draft must not contradict our own warnings: fill uncovered
    // required-reason suggestions and app-feature collection into it.
    const uncoveredApis = requiredReasons
      .filter((s) => !s.covered)
      .map((s) => ({ category: s.category, reasons: s.reasons }));
    const appCollected = capabilityAppleTypes(capabilities);

    const outDir = resolve(root, opts.out);
    mkdirSync(outDir, { recursive: true });

    const applePlist = generateAppleManifest(result.resolved, {
      accessedApis: uncoveredApis,
      appCollected,
    });
    writeFileSync(join(outDir, "PrivacyInfo.xcprivacy"), applePlist);

    const rows = [
      ...buildPlayRows(result.resolved),
      ...capabilityPlayRows(capabilities),
    ].sort(
      (a, b) =>
        a.category.localeCompare(b.category) || a.type.localeCompare(b.type),
    );
    const manualCheck = result.resolved
      .filter((r) => r.entry.play.length === 0)
      .map((r) => r.entry.name);
    writeFileSync(
      join(outDir, "play-data-safety.md"),
      generatePlayMarkdown(rows, manualCheck),
    );

    if (opts.json) {
      writeFileSync(
        join(outDir, "scan.json"),
        JSON.stringify(
          { result, playRows: rows, requiredReasons, capabilities, unused },
          null,
          2,
        ),
      );
    }

    console.log(
      pc.bold(`\nDrafts written to ${pc.cyan(opts.out + "/")}`) +
        `\n  • PrivacyInfo.xcprivacy\n  • play-data-safety.md`,
    );

    printNextSteps(
      buildNextSteps(root, opts, result, requiredReasons, capabilities, unused),
    );

    if (opts.compare) {
      const drift = detectDrift(
        resolve(root, opts.compare),
        result.resolved,
        appCollected,
      );
      printDrift(drift);
      // Rejection-grade drift: undeclared data types, or NSPrivacyTracking=false
      // while detected SDKs declare tracking. (Over-declaration only warns.)
      const underDeclaredTracking =
        drift.trackingMismatch !== undefined &&
        drift.trackingMismatch.detected &&
        !drift.trackingMismatch.declared;
      if (drift.missing.length > 0 || underDeclaredTracking) {
        console.log(
          pc.red(
            "\n✗ Undeclared collection found — this would likely be rejected. (exit 1)",
          ),
        );
        finish(result, 1);
      }
    }

    finish(result, 0);
  });

/** Turn scan findings into a short, ordered to-do list for the developer. */
function buildNextSteps(
  root: string,
  opts: { out: string; compare?: string },
  result: { projectType: string[]; harvestedManifests: unknown[] },
  requiredReasons: { covered: boolean }[],
  capabilities: unknown[],
  unused: { package: string; knownSdk: boolean }[] = [],
): string[] {
  const steps: string[] = [];

  const appManifest = findAppManifest(root);
  if (!appManifest) {
    steps.push(
      `No app privacy manifest found — add ${opts.out}/PrivacyInfo.xcprivacy ` +
        `to your Xcode app target as a starting point.`,
    );
  } else if (!opts.compare) {
    steps.push(
      `Existing manifest found (${relative(root, appManifest)}) — re-run with ` +
        `--compare ${relative(root, appManifest)} to gate drift in CI.`,
    );
  }

  if (requiredReasons.some((s) => !s.covered)) {
    steps.push(
      "Resolve the ⚠ required-reason warnings above — missing declarations " +
        "trigger ITMS-91053 at upload.",
    );
  }

  if (capabilities.length) {
    steps.push(
      "Review the app-feature entries added to both drafts: set Linked=true " +
        "where data ties to user identity, fix purposes, and mark Shared if " +
        "sent to third parties.",
    );
  }

  if (result.projectType.length > 0) {
    steps.push(
      "Data collected through your own backend (accounts, login, identity " +
        "verification — names, phone numbers, national IDs) is invisible to " +
        "scanning: add it to both forms yourself.",
    );
  }

  const unusedSdks = unused.filter((u) => u.knownSdk);
  if (unusedSdks.length) {
    steps.push(
      `Remove unused data-collecting SDKs if confirmed ` +
        `(${unusedSdks.map((u) => u.package).join(", ")}) — they inflate your ` +
        `privacy declarations for nothing.`,
    );
  }

  if (
    result.projectType.length > 0 &&
    result.harvestedManifests.length === 0 &&
    !existsSync(join(root, "ios", "Pods"))
  ) {
    steps.push(
      "ios/Pods is missing — run `pod install` and re-scan so SDK-shipped " +
        "privacy manifests can be read directly.",
    );
  }

  return steps;
}

/** The app's own PrivacyInfo.xcprivacy, e.g. ios/Runner/PrivacyInfo.xcprivacy. */
function findAppManifest(root: string): string | undefined {
  const iosDir = join(root, "ios");
  let entries: string[];
  try {
    entries = readdirSync(iosDir);
  } catch {
    return undefined;
  }
  for (const name of entries) {
    if (name === "Pods" || name.startsWith(".")) continue;
    const candidate = join(iosDir, name, "PrivacyInfo.xcprivacy");
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

function finish(
  result: { unknown: unknown[] },
  code: number,
): never {
  printTrustBoundary();
  process.exit(code);
}

program.parseAsync();
