import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { DetectedDependency } from "../types.js";

interface PubspecLock {
  packages?: Record<
    string,
    { dependency?: string; version?: string; source?: string }
  >;
}

/**
 * Parse a Flutter project's pubspec.lock.
 * Returns [] if this isn't a Flutter project (no pubspec.lock).
 */
export function detectFlutter(projectRoot: string): DetectedDependency[] {
  const lockPath = join(projectRoot, "pubspec.lock");
  if (!existsSync(lockPath)) return [];

  let lock: PubspecLock;
  try {
    lock = parseYaml(readFileSync(lockPath, "utf8")) as PubspecLock;
  } catch {
    return [];
  }

  const out: DetectedDependency[] = [];
  for (const [name, info] of Object.entries(lock.packages ?? {})) {
    const dep = info.dependency ?? "";
    // "direct main" = a runtime dependency the app declares itself.
    const direct = dep.startsWith("direct");
    out.push({
      name,
      ecosystem: "pub",
      version: info.version,
      direct,
      source: "pubspec.lock",
    });
  }
  return out;
}

export function isFlutterProject(projectRoot: string): boolean {
  return existsSync(join(projectRoot, "pubspec.yaml"));
}
