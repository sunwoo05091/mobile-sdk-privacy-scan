import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { DetectedDependency } from "../types.js";

/**
 * Detect a React Native project's JS-layer dependencies from package.json.
 * The native iOS/Android layers are framework-independent — see native.ts.
 * Returns [] if this isn't an RN project.
 */
export function detectReactNative(projectRoot: string): DetectedDependency[] {
  if (!isReactNativeProject(projectRoot)) return [];
  const pkgPath = join(projectRoot, "package.json");
  let pkg: { dependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  } catch {
    return [];
  }
  return Object.entries(pkg.dependencies ?? {}).map(([name, version]) => ({
    name,
    ecosystem: "npm" as const,
    version: version.replace(/^[\^~]/, ""),
    direct: true,
    source: "package.json",
  }));
}

export function isReactNativeProject(projectRoot: string): boolean {
  const pkgPath = join(projectRoot, "package.json");
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    return Boolean(deps["react-native"] || deps["expo"]);
  } catch {
    return false;
  }
}
