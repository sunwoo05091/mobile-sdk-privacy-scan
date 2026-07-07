// Required-reason API (ITMS-91053) suggestions.
//
// Apple rejects uploads that call certain APIs (UserDefaults, file
// timestamps, disk space, boot time, keyboards) without an approved reason
// declared by WHOEVER ships the code. Plugins usually declare their own use
// in their own bundled manifest — so we suggest, and cross-check whether the
// package already covers itself. We never write these into the generated
// aggregate manifest: a reason code must match actual usage.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DetectedDependency, HarvestedManifest } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ReasonRule {
  ecosystem: string;
  name: string;
  category: string;
  reasons: string[];
  /** Extra package names whose shipped manifest counts as coverage
   *  (e.g. a plugin's iOS implementation package). */
  coveredBy: string[];
  note: string;
}

export interface RequiredReasonSuggestion {
  package: string;
  ecosystem: string;
  category: string;
  reasons: string[];
  note: string;
  /** true = a manifest shipped by the package already declares the category. */
  covered: boolean;
}

function loadRules(): ReasonRule[] {
  const candidates = [
    join(__dirname, "kb", "requiredReasons.json"),
    join(__dirname, "..", "src", "kb", "requiredReasons.json"),
  ];
  for (const p of candidates) {
    try {
      return (JSON.parse(readFileSync(p, "utf8")) as { packages: ReasonRule[] })
        .packages;
    } catch {
      /* try next */
    }
  }
  throw new Error("Could not locate requiredReasons.json");
}

const rules = loadRules();

export function suggestRequiredReasons(scan: {
  detected: DetectedDependency[];
  harvestedManifests: HarvestedManifest[];
}): RequiredReasonSuggestion[] {
  const out: RequiredReasonSuggestion[] = [];
  for (const rule of rules) {
    const dep = scan.detected.find(
      (d) =>
        d.ecosystem === rule.ecosystem &&
        d.name.toLowerCase() === rule.name.toLowerCase(),
    );
    if (!dep) continue;

    const owners = new Set(
      [rule.name, ...rule.coveredBy].map((n) => n.toLowerCase()),
    );
    const covered = scan.harvestedManifests.some(
      (m) =>
        m.owner &&
        owners.has(m.owner.name.toLowerCase()) &&
        m.accessedApiCategories.includes(rule.category),
    );

    out.push({
      package: dep.name,
      ecosystem: dep.ecosystem,
      category: rule.category,
      reasons: rule.reasons,
      note: rule.note,
      covered,
    });
  }
  return out;
}
