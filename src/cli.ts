#!/usr/bin/env node
import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { Command } from "commander";
import pc from "picocolors";
import { scanProject } from "./detect/index.js";
import { generateAppleManifest } from "./generate/appleManifest.js";
import {
  buildPlayRows,
  generatePlayMarkdown,
} from "./generate/playDataSafety.js";
import { detectDrift } from "./drift.js";
import { printScanSummary, printDrift } from "./report.js";
import { kbMeta } from "./kb/index.js";

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

    const outDir = resolve(root, opts.out);
    mkdirSync(outDir, { recursive: true });

    const applePlist = generateAppleManifest(result.resolved);
    writeFileSync(join(outDir, "PrivacyInfo.xcprivacy"), applePlist);

    const rows = buildPlayRows(result.resolved);
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
        JSON.stringify({ result, playRows: rows }, null, 2),
      );
    }

    console.log(
      pc.bold(`\nDrafts written to ${pc.cyan(opts.out + "/")}`) +
        `\n  • PrivacyInfo.xcprivacy\n  • play-data-safety.md`,
    );

    if (opts.compare) {
      const drift = detectDrift(resolve(root, opts.compare), result.resolved);
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

function finish(
  result: { unknown: unknown[] },
  code: number,
): never {
  console.log(pc.dim(`\n${kbMeta().note}`));
  process.exit(code);
}

program.parseAsync();
