// Shared helpers for the test suite. Not a test file (no .test.js suffix).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const FLUTTER_FIXTURE = fileURLToPath(
  new URL("./fixtures/flutter_app", import.meta.url),
);
export const RN_FIXTURE = fileURLToPath(
  new URL("./fixtures/rn_app", import.meta.url),
);
export const INCOMPLETE_MANIFEST = fileURLToPath(
  new URL("./fixtures/manifests/incomplete.xcprivacy", import.meta.url),
);
export const CLI = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

/** Create a temp dir and register cleanup on the given test context. */
export function tempDir(t, prefix = "sps-test-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Minimal HarvestedManifest factory for unit tests. */
export function harvestedManifest(overrides = {}) {
  return {
    path: "/fake/PrivacyInfo.xcprivacy",
    tracking: false,
    trackingDomains: [],
    apple: [],
    accessedApiCategories: [],
    ...overrides,
  };
}

/** Minimal ResolvedSdk factory for generator/drift unit tests. */
export function resolvedSdk(entryOverrides) {
  const entry = {
    id: "test-sdk",
    name: "Test SDK",
    aliases: { npm: ["test-sdk"] },
    tracking: false,
    trackingDomains: [],
    apple: [],
    play: [],
    source: "test",
    ...entryOverrides,
  };
  return {
    dependency: {
      name: entry.aliases.npm?.[0] ?? entry.id,
      ecosystem: "npm",
      direct: true,
      source: "package.json",
    },
    entry,
  };
}
