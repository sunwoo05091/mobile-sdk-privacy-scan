// `explain` — paste an App Review rejection mail, get told what it means and
// (with a project path) which dependency caused it and how to fix it.
//
// We key ONLY on stable identifiers (ITMS-xxxxx numbers and
// NSPrivacyAccessedAPICategory… / NSPrivacyCollectedDataType… constants).
// Apple rewrites its mail wording; the codes don't change.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { suggestRequiredReasons } from "./requiredReasons.js";
import type { ScanResult } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface CategoryInfo {
  label: string;
  trigger: string;
  reasons: Record<string, string>;
}

interface CategoryKb {
  _meta: { docs: string };
  itms: Record<string, string>;
  categories: Record<string, CategoryInfo>;
}

function loadKb(): CategoryKb {
  const candidates = [
    join(__dirname, "kb", "requiredReasonCategories.json"),
    join(__dirname, "..", "src", "kb", "requiredReasonCategories.json"),
  ];
  for (const p of candidates) {
    try {
      return JSON.parse(readFileSync(p, "utf8")) as CategoryKb;
    } catch {
      /* try next */
    }
  }
  throw new Error("Could not locate requiredReasonCategories.json");
}

const kb = loadKb();

export interface ExtractedCodes {
  itms: string[];
  categories: string[];
  collectedTypes: string[];
}

export function extractCodes(text: string): ExtractedCodes {
  const uniq = (m: RegExpMatchArray | string[] | null) => [...new Set(m ?? [])];
  return {
    itms: uniq(text.match(/ITMS-\d{5}/g)),
    categories: uniq(text.match(/NSPrivacyAccessedAPICategory[A-Za-z]+/g)),
    collectedTypes: uniq(text.match(/NSPrivacyCollectedDataType(?!Purpose)[A-Za-z]+/g)),
  };
}

export interface CategoryExplanation {
  category: string;
  label: string;
  trigger: string;
  reasons: Record<string, string>;
  /** Packages in the scanned project that likely cause this category. */
  culprits: { package: string; covered: boolean; reasons: string[] }[];
}

export interface Explanation {
  itms: { code: string; meaning: string }[];
  categories: CategoryExplanation[];
  collectedTypes: string[];
  docsUrl: string;
  /** Nothing recognized in the pasted text. */
  empty: boolean;
}

export function explain(
  text: string,
  scan?: Pick<ScanResult, "detected" | "harvestedManifests">,
): Explanation {
  const codes = extractCodes(text);
  const suggestions = scan ? suggestRequiredReasons(scan) : [];

  const categories: CategoryExplanation[] = codes.categories.map((category) => {
    const info = kb.categories[category];
    return {
      category,
      label: info?.label ?? category,
      trigger: info?.trigger ?? "Not in our category KB — check Apple's docs.",
      reasons: info?.reasons ?? {},
      culprits: suggestions
        .filter((s) => s.category === category)
        .map((s) => ({ package: s.package, covered: s.covered, reasons: s.reasons })),
    };
  });

  return {
    itms: codes.itms.map((code) => ({
      code,
      meaning: kb.itms[code] ?? "Unknown ITMS code — check App Store Connect's rejection details.",
    })),
    categories,
    collectedTypes: codes.collectedTypes,
    docsUrl: kb._meta.docs,
    empty:
      codes.itms.length === 0 &&
      codes.categories.length === 0 &&
      codes.collectedTypes.length === 0,
  };
}
