import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parsePrivacyManifest } from "../manifest.js";
import type { Ecosystem, HarvestedManifest } from "../types.js";

const SEARCH_ROOTS = ["ios/Pods", "ios", "node_modules", ".symlinks"];
const MAX_DEPTH = 6;

export interface HarvestResult {
  manifests: HarvestedManifest[];
  /** Files that exist but could not be parsed as a privacy manifest. */
  errors: string[];
}

/**
 * Find and parse the PrivacyInfo.xcprivacy files SDKs ship themselves
 * (required by Apple for listed SDKs). These are the single best source of
 * truth: read them directly instead of guessing from the KB.
 */
export function harvestPrivacyManifests(projectRoot: string): HarvestResult {
  // Search roots overlap (ios contains ios/Pods) — dedupe with a Set.
  const found = new Set<string>();
  for (const root of SEARCH_ROOTS) {
    const start = join(projectRoot, root);
    if (existsSync(start)) walk(start, 0, found);
  }

  const manifests: HarvestedManifest[] = [];
  const errors: string[] = [];
  for (const path of [...found].sort()) {
    try {
      manifests.push(parseManifest(projectRoot, path));
    } catch {
      errors.push(path);
    }
  }
  return { manifests, errors };
}

function walk(dir: string, depth: number, acc: Set<string>): void {
  if (depth > MAX_DEPTH) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      walk(full, depth + 1, acc);
    } else if (name === "PrivacyInfo.xcprivacy") {
      acc.add(full);
    }
  }
}

function parseManifest(projectRoot: string, path: string): HarvestedManifest {
  return {
    path,
    owner: attributeOwner(relative(projectRoot, path).split(sep)),
    ...parsePrivacyManifest(readFileSync(path, "utf8")),
  };
}

/**
 * Derive the owning dependency from the manifest's path:
 *   ios/Pods/<PodName>/**            -> pod
 *   node_modules/<pkg | @scope/pkg>/** -> npm (innermost node_modules wins)
 *   .symlinks/plugins/<pubName>/**   -> pub (Flutter iOS plugin symlinks)
 * Anything else (Target Support Files, the app's own manifest) has no owner.
 */
function attributeOwner(
  segments: string[],
): { ecosystem: Ecosystem; name: string } | undefined {
  const fileIndex = segments.length - 1;

  const nmIndex = segments.lastIndexOf("node_modules");
  if (nmIndex !== -1) {
    if (nmIndex + 1 >= fileIndex) return undefined;
    const first = segments[nmIndex + 1];
    if (first.startsWith("@")) {
      if (nmIndex + 2 >= fileIndex) return undefined;
      return { ecosystem: "npm", name: `${first}/${segments[nmIndex + 2]}` };
    }
    return { ecosystem: "npm", name: first };
  }

  const podsIndex = segments.indexOf("Pods");
  if (podsIndex !== -1) {
    if (podsIndex + 1 >= fileIndex) return undefined;
    const name = segments[podsIndex + 1];
    if (name === "Target Support Files") return undefined;
    return { ecosystem: "pod", name };
  }

  const symlinksIndex = segments.indexOf(".symlinks");
  if (symlinksIndex !== -1 && segments[symlinksIndex + 1] === "plugins") {
    if (symlinksIndex + 2 >= fileIndex) return undefined;
    return { ecosystem: "pub", name: segments[symlinksIndex + 2] };
  }

  return undefined;
}
