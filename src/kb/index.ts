import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Ecosystem, KbEntry } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface KbFile {
  _meta: { note: string; schemaVersion: number; generatedFor: string };
  entries: KbEntry[];
}

// The bundled KB ships inside the package so the tool works fully offline.
// data.json lives in src/ and is copied to the published package via `files`.
function loadKbFile(): KbFile {
  // dist/kb/index.js -> ../../src/kb/data.json
  const candidates = [
    join(__dirname, "data.json"),
    join(__dirname, "..", "..", "src", "kb", "data.json"),
  ];
  for (const p of candidates) {
    try {
      return JSON.parse(readFileSync(p, "utf8")) as KbFile;
    } catch {
      /* try next */
    }
  }
  throw new Error("Could not locate bundled knowledge base (data.json).");
}

const kb = loadKbFile();

/** Index of "ecosystem::alias" (lowercased) -> KbEntry for fast lookup. */
const aliasIndex = new Map<string, KbEntry>();
for (const entry of kb.entries) {
  for (const [eco, names] of Object.entries(entry.aliases)) {
    for (const name of names ?? []) {
      aliasIndex.set(`${eco}::${name.toLowerCase()}`, entry);
    }
  }
}

export function lookup(ecosystem: Ecosystem, name: string): KbEntry | undefined {
  return aliasIndex.get(`${ecosystem}::${name.toLowerCase()}`);
}

export function kbMeta() {
  return kb._meta;
}

export function allEntries(): KbEntry[] {
  return kb.entries;
}
