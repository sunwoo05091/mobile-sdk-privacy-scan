import type { PlayCollectedType, ResolvedSdk } from "../types.js";

export interface PlayRow extends PlayCollectedType {
  /** which SDKs contributed this row, for traceability */
  from: string[];
}

/** Aggregate Play Data Safety rows across all resolved SDKs. */
export function buildPlayRows(resolved: ResolvedSdk[]): PlayRow[] {
  const merged = new Map<string, PlayRow>();
  for (const { entry } of resolved) {
    for (const p of entry.play) {
      const key = `${p.category}|${p.type}`;
      const existing = merged.get(key);
      if (existing) {
        existing.collected ||= p.collected;
        existing.shared ||= p.shared;
        existing.purposes = Array.from(
          new Set([...existing.purposes, ...p.purposes]),
        );
        existing.from.push(entry.name);
      } else {
        merged.set(key, { ...p, purposes: [...p.purposes], from: [entry.name] });
      }
    }
  }
  return Array.from(merged.values()).sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.type.localeCompare(b.type),
  );
}

/** Rows for data the APP collects through its own features (capability hints). */
export function capabilityPlayRows(
  hints: { play: { category: string; type: string }[]; evidence: string[] }[],
): PlayRow[] {
  const merged = new Map<string, PlayRow>();
  for (const h of hints) {
    for (const p of h.play) {
      const key = `${p.category}|${p.type}`;
      const existing = merged.get(key);
      const from = `your app (${h.evidence.join(", ")}) — VERIFY`;
      if (existing) {
        if (!existing.from.includes(from)) existing.from.push(from);
      } else {
        merged.set(key, {
          category: p.category,
          type: p.type,
          collected: true,
          shared: false, // REVIEW: set true if sent to third parties
          purposes: ["App functionality"],
          from: [from],
        });
      }
    }
  }
  return [...merged.values()];
}

export function generatePlayMarkdown(
  rows: PlayRow[],
  /** SDKs (harvested-only) we have no Play data for — the user must check. */
  manualCheck: string[] = [],
  /** CSV questions left blank on purpose — the developer's checklist. */
  manualQuestions: { id: string; label: string; requirement: string }[] = [],
): string {
  const lines = [
    "# Google Play Data Safety — draft",
    "",
    "> Auto-generated draft. Verify every row against the Play SDK Index and your",
    "> actual SDK configuration before submitting in Play Console. Not legal advice.",
    "",
    "| Category | Data type | Collected | Shared | Purposes | From |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.category} | ${r.type} | ${r.collected ? "Yes" : "No"} | ${
        r.shared ? "Yes" : "No"
      } | ${r.purposes.join(", ")} | ${r.from.join(", ")} |`,
    );
  }
  if (manualQuestions.length) {
    const order = (r: string) =>
      r === "REQUIRED" ? 0 : r === "MAYBE_REQUIRED" ? 1 : r === "OPTIONAL" ? 3 : 2;
    lines.push(
      "",
      "## ✍️ Answer these yourself — left blank in play-data-safety.csv",
      "",
      "The scanner fills only what it can prove. These questions need YOUR",
      "answer, either in the CSV before importing or in the Play Console form",
      "after importing:",
      "",
      "| Must answer? | Question | Question ID |",
      "| --- | --- | --- |",
      ...[...manualQuestions]
        .sort((a, b) => order(a.requirement) - order(b.requirement))
        .map(
          (q) =>
            `| ${q.requirement === "REQUIRED" ? "**REQUIRED**" : q.requirement} | ${q.label} | \`${q.id}\` |`,
        ),
    );
  }
  if (manualCheck.length) {
    lines.push(
      "",
      "## Check manually — no Play data available",
      "",
      "These SDKs ship an Apple privacy manifest but are not in the knowledge",
      "base, so their Play Data Safety impact is unknown. Look each one up on",
      "the [Google Play SDK Index](https://play.google.com/sdks):",
      "",
      ...manualCheck.map((name) => `- ${name}`),
    );
  }
  lines.push("");
  return lines.join("\n");
}
