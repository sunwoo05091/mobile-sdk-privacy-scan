// Integrity checks for the bundled knowledge base — the project's core asset.
// These invariants must hold for every entry, now and as the KB grows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { allEntries, lookup, kbMeta } from "../dist/kb/index.js";

test("KB loads and has meta", () => {
  assert.ok(allEntries().length >= 5);
  const meta = kbMeta();
  assert.equal(meta.schemaVersion, 1);
  assert.ok(meta.note.length > 0);
});

test("KB entry ids are unique", () => {
  const ids = allEntries().map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("no alias resolves to two different entries", () => {
  const seen = new Map(); // "eco::alias" -> entry id
  for (const entry of allEntries()) {
    for (const [eco, names] of Object.entries(entry.aliases)) {
      for (const name of names ?? []) {
        const key = `${eco}::${name.toLowerCase()}`;
        assert.ok(
          !seen.has(key) || seen.get(key) === entry.id,
          `alias "${key}" is claimed by both "${seen.get(key)}" and "${entry.id}"`,
        );
        seen.set(key, entry.id);
      }
    }
  }
});

test("every entry has at least one alias and well-formed Apple declarations", () => {
  for (const entry of allEntries()) {
    const aliasCount = Object.values(entry.aliases).flat().length;
    assert.ok(aliasCount > 0, `${entry.id} has no aliases`);

    for (const t of entry.apple) {
      assert.match(
        t.type,
        /^NSPrivacyCollectedDataType[A-Z]/,
        `${entry.id}: bad Apple data type "${t.type}"`,
      );
      assert.ok(t.purposes.length > 0, `${entry.id}: ${t.type} has no purposes`);
      for (const p of t.purposes) {
        assert.match(
          p,
          /^NSPrivacyCollectedDataTypePurpose[A-Z]/,
          `${entry.id}: bad purpose "${p}"`,
        );
      }
    }
  }
});

test("every entry has well-formed Play declarations", () => {
  for (const entry of allEntries()) {
    for (const p of entry.play) {
      assert.ok(p.category.length > 0, `${entry.id}: empty Play category`);
      assert.ok(p.type.length > 0, `${entry.id}: empty Play type`);
      assert.ok(p.purposes.length > 0, `${entry.id}: Play row has no purposes`);
    }
  }
});

test("tracking SDKs must declare tracking domains", () => {
  for (const entry of allEntries()) {
    if (entry.tracking) {
      assert.ok(
        entry.trackingDomains.length > 0,
        `${entry.id} sets tracking=true but lists no tracking domains`,
      );
    }
  }
});

test("every entry states its provenance", () => {
  for (const entry of allEntries()) {
    assert.ok(entry.source.length > 0, `${entry.id} has no source note`);
  }
});

test("lookup is case-insensitive and ecosystem-scoped", () => {
  assert.equal(lookup("pod", "FirebaseAnalytics")?.id, "firebase-analytics");
  assert.equal(lookup("pod", "FIREBASEANALYTICS")?.id, "firebase-analytics");
  assert.equal(lookup("pub", "firebase_analytics")?.id, "firebase-analytics");
  assert.equal(lookup("npm", "FirebaseAnalytics"), undefined, "pod alias must not match in npm");
  assert.equal(lookup("npm", "left-pad"), undefined);
});
