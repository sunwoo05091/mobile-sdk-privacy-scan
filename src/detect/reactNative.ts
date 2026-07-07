import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { DetectedDependency } from "../types.js";

/** Parse package.json dependencies (JS layer). */
function detectNpm(projectRoot: string): DetectedDependency[] {
  const pkgPath = join(projectRoot, "package.json");
  if (!existsSync(pkgPath)) return [];
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

/** Parse the top-level PODS entries from ios/Podfile.lock (native iOS layer). */
function detectPods(projectRoot: string): DetectedDependency[] {
  const candidates = [
    join(projectRoot, "ios", "Podfile.lock"),
    join(projectRoot, "Podfile.lock"),
  ];
  const lockPath = candidates.find((p) => existsSync(p));
  if (!lockPath) return [];

  let doc: { PODS?: Array<string | Record<string, unknown>> };
  try {
    doc = parseYaml(readFileSync(lockPath, "utf8")) as typeof doc;
  } catch {
    return [];
  }

  const out: DetectedDependency[] = [];
  for (const item of doc.PODS ?? []) {
    // Entries are either "PodName (1.2.3)" or { "PodName (1.2.3)": [deps...] }.
    const spec = typeof item === "string" ? item : Object.keys(item)[0];
    if (!spec) continue;
    const m = spec.match(/^(.+?)\s+\(([^)]+)\)$/);
    const name = (m ? m[1] : spec).trim();
    out.push({
      name,
      ecosystem: "pod",
      version: m?.[2],
      direct: false, // Podfile.lock flattens direct + transitive together.
      source: "ios/Podfile.lock",
    });
  }
  return out;
}

/** Rough parse of android/app/build.gradle implementation deps (native Android). */
function detectGradle(projectRoot: string): DetectedDependency[] {
  const candidates = [
    join(projectRoot, "android", "app", "build.gradle"),
    join(projectRoot, "android", "build.gradle"),
  ];
  const out: DetectedDependency[] = [];
  for (const gradlePath of candidates) {
    if (!existsSync(gradlePath)) continue;
    const text = readFileSync(gradlePath, "utf8");
    // matches: implementation 'group:artifact:version'
    const re =
      /(?:implementation|api|compileOnly)\s*[('"]+([\w.\-]+):([\w.\-]+):?([\w.\-]+)?/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      out.push({
        name: `${match[1]}:${match[2]}`,
        ecosystem: "gradle",
        version: match[3],
        direct: true,
        source: gradlePath.replace(projectRoot + "/", ""),
      });
    }
  }
  return out;
}

/**
 * Detect a React Native project's dependencies across JS + native layers.
 * Returns [] if this isn't an RN project.
 */
export function detectReactNative(projectRoot: string): DetectedDependency[] {
  if (!isReactNativeProject(projectRoot)) return [];
  return [
    ...detectNpm(projectRoot),
    ...detectPods(projectRoot),
    ...detectGradle(projectRoot),
  ];
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
