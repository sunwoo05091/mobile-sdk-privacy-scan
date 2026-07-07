// Possibly-unused dependency detection (local, grep-based).
//
// A declared package with no import in the app's own source is dead weight —
// and if it's a data-collecting SDK, it's a privacy liability: it still ships
// in the binary and still forces manifest/label declarations. Import-grepping
// has false positives (asset packages, codegen), so results are "possibly
// unused", direct MAIN dependencies only, with a skip-list for known
// non-imported package types.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { isPlatformShard } from "./detect/index.js";
import type { DetectedDependency, ResolvedSdk } from "./types.js";

export interface UnusedDependency {
  package: string;
  ecosystem: "pub" | "npm";
  /** true = it resolves in our KB, i.e. a known data-collecting SDK. */
  knownSdk: boolean;
}

// Packages that are legitimately used without any source import.
const NEVER_IMPORTED = new Set([
  "cupertino_icons", // font asset via pubspec
  "flutter_launcher_icons", // build-time tool
  "flutter_native_splash", // build-time tool
  "react-native", // the framework
  "expo", // the framework
]);

// Codegen annotation packages are used via their annotations, not imports
// (e.g. @JsonSerializable arrives through freezed's re-exports). If a marker
// appears anywhere in the source, the package is in use.
const ANNOTATION_MARKERS: Record<string, string[]> = {
  json_annotation: ["@JsonSerializable", "@JsonKey", "@JsonValue", "@JsonEnum"],
  freezed_annotation: ["@freezed", "@Freezed"],
  riverpod_annotation: ["@riverpod", "@Riverpod"],
  injectable: ["@injectable", "@Injectable", "@module"],
};

const MAX_FILES = 5000;
const MAX_FILE_SIZE = 1024 * 1024;

export function findUnusedDependencies(
  projectRoot: string,
  scan: { detected: DetectedDependency[]; resolved: ResolvedSdk[] },
): UnusedDependency[] {
  const out: UnusedDependency[] = [];
  const knownIds = new Map(
    scan.resolved.map((r) => [
      `${r.dependency.ecosystem}::${r.dependency.name.toLowerCase()}`,
      true,
    ]),
  );
  const isKnown = (d: DetectedDependency) =>
    knownIds.has(`${d.ecosystem}::${d.name.toLowerCase()}`) ||
    scan.resolved.some((r) =>
      Object.values(r.entry.aliases)
        .flat()
        .some((a) => a?.toLowerCase() === d.name.toLowerCase()),
    );

  // Platform implementation shards (foo_android …) are wired up by the build
  // system, never imported — pinning one directly is normal, not "unused".
  const detectedNames = new Set(scan.detected.map((d) => d.name.toLowerCase()));

  // --- Flutter: package:<name>/ imports in lib/ ---
  const pubDeps = scan.detected.filter(
    (d) =>
      d.ecosystem === "pub" &&
      d.scope === "main" &&
      !NEVER_IMPORTED.has(d.name) &&
      !isPlatformShard(d.name, detectedNames),
  );
  if (pubDeps.length) {
    const dartSource = readSources(join(projectRoot, "lib"), [".dart"]);
    if (dartSource !== undefined) {
      for (const dep of pubDeps) {
        if (dartSource.includes(`package:${dep.name}/`)) continue;
        const markers = ANNOTATION_MARKERS[dep.name];
        if (markers && markers.some((m) => dartSource.includes(m))) continue;
        out.push({ package: dep.name, ecosystem: "pub", knownSdk: isKnown(dep) });
      }
    }
  }

  // --- React Native: from '<pkg>' / require('<pkg>') in JS/TS sources ---
  const npmDeps = scan.detected.filter(
    (d) => d.ecosystem === "npm" && !NEVER_IMPORTED.has(d.name),
  );
  if (npmDeps.length) {
    const jsSource = readJsSources(projectRoot);
    if (jsSource !== undefined) {
      const specifiers = new Set<string>();
      const re = /(?:from\s+|require\s*\(\s*|import\s*\(\s*)["']([^"']+)["']/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(jsSource)) !== null) {
        const spec = m[1];
        // "pkg/sub/path" -> "pkg", "@scope/pkg/sub" -> "@scope/pkg"
        const parts = spec.split("/");
        specifiers.add(
          spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0],
        );
      }
      for (const dep of npmDeps) {
        if (!specifiers.has(dep.name)) {
          out.push({ package: dep.name, ecosystem: "npm", knownSdk: isKnown(dep) });
        }
      }
    }
  }

  return out;
}

/** Concatenated source under `dir`, or undefined when there is none to read. */
function readSources(dir: string, exts: string[]): string | undefined {
  const chunks: string[] = [];
  let fileCount = 0;
  const walk = (d: string, depth: number) => {
    if (depth > 8 || fileCount >= MAX_FILES) return;
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name.startsWith(".")) continue;
      const full = join(d, name);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        walk(full, depth + 1);
      } else if (exts.includes(extname(name)) && s.size <= MAX_FILE_SIZE) {
        fileCount++;
        try {
          chunks.push(readFileSync(full, "utf8"));
        } catch {
          /* unreadable file — skip */
        }
      }
    }
  };
  walk(dir, 0);
  return fileCount > 0 ? chunks.join("\n") : undefined;
}

function readJsSources(projectRoot: string): string | undefined {
  const exts = [".js", ".jsx", ".ts", ".tsx"];
  const chunks: string[] = [];
  let found = false;

  // Root-level entry files + common source dirs, skipping build output.
  let rootEntries: string[] = [];
  try {
    rootEntries = readdirSync(projectRoot);
  } catch {
    return undefined;
  }
  for (const name of rootEntries) {
    if (name.startsWith(".") || ["node_modules", "ios", "android", "dist", "build"].includes(name)) {
      continue;
    }
    const full = join(projectRoot, name);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      const sub = readSources(full, exts);
      if (sub !== undefined) {
        chunks.push(sub);
        found = true;
      }
    } else if (exts.includes(extname(name)) && s.size <= MAX_FILE_SIZE) {
      try {
        chunks.push(readFileSync(full, "utf8"));
        found = true;
      } catch {
        /* skip */
      }
    }
  }
  return found ? chunks.join("\n") : undefined;
}
