// Capability plugins (camera, location, microphone, contacts…) signal that
// the APP collects data through its own features. We can point at it — only
// the developer can declare it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DetectedDependency } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface CapabilityRule {
  ecosystem: string;
  name: string;
  collects: string;
}

export interface CapabilityHint {
  package: string;
  ecosystem: string;
  collects: string;
}

function loadRules(): CapabilityRule[] {
  const candidates = [
    join(__dirname, "kb", "capabilities.json"),
    join(__dirname, "..", "src", "kb", "capabilities.json"),
  ];
  for (const p of candidates) {
    try {
      return (JSON.parse(readFileSync(p, "utf8")) as { packages: CapabilityRule[] })
        .packages;
    } catch {
      /* try next */
    }
  }
  throw new Error("Could not locate capabilities.json");
}

const rules = loadRules();

export function detectCapabilities(scan: {
  detected: DetectedDependency[];
}): CapabilityHint[] {
  const out: CapabilityHint[] = [];
  for (const rule of rules) {
    const dep = scan.detected.find(
      (d) =>
        d.ecosystem === rule.ecosystem &&
        d.name.toLowerCase() === rule.name.toLowerCase(),
    );
    if (dep) {
      out.push({
        package: dep.name,
        ecosystem: dep.ecosystem,
        collects: rule.collects,
      });
    }
  }
  return out;
}
