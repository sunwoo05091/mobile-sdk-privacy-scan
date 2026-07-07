// Native-layer detectors. These are framework-independent: Flutter and React
// Native projects both carry ios/Podfile.lock and android/**/build.gradle.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { DetectedDependency } from "../types.js";

/** Parse the top-level PODS entries from ios/Podfile.lock (native iOS layer). */
export function detectPods(projectRoot: string): DetectedDependency[] {
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
export function detectGradle(projectRoot: string): DetectedDependency[] {
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
