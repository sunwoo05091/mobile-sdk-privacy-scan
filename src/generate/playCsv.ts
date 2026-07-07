// Google Play Data Safety CSV — importable in Play Console (App content →
// Data safety → Import from CSV). We fill Google's own exported template:
// every row is [questionId, responseId, responseValue, requirement, label];
// multiple-choice questions have one row per choice, TRUE marks a selection.
// Judgment questions (user control, ephemeral-?, URLs, encryption) stay blank
// for the developer — a draft must not invent answers we cannot know.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { PlayRow } from "./playDataSafety.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

type TemplateRow = [string, string | null, string | null, string | null, string | null];

function loadTemplate(): TemplateRow[] {
  const candidates = [
    join(__dirname, "..", "kb", "playCsvTemplate.json"),
    join(__dirname, "..", "..", "src", "kb", "playCsvTemplate.json"),
  ];
  for (const p of candidates) {
    try {
      return (JSON.parse(readFileSync(p, "utf8")) as { rows: TemplateRow[] }).rows;
    } catch {
      /* try next */
    }
  }
  throw new Error("Could not locate playCsvTemplate.json");
}

const template = loadTemplate();

/** Our Play "Data type" labels → Google's response IDs (from their template). */
const TYPE_ID: Record<string, string> = {
  "Device or other IDs": "PSL_DEVICE_ID",
  "App interactions": "PSL_USER_INTERACTION",
  "In-app search history": "PSL_IN_APP_SEARCH_HISTORY",
  "Crash logs": "PSL_CRASH_LOGS",
  "Diagnostics": "PSL_PERFORMANCE_DIAGNOSTICS",
  "Precise location": "PSL_PRECISE_LOCATION",
  "Approximate location": "PSL_APPROX_LOCATION",
  "Photos": "PSL_PHOTOS",
  "Videos": "PSL_VIDEOS",
  "Voice or sound recordings": "PSL_AUDIO",
  "Contacts": "PSL_CONTACTS",
  "Health info": "PSL_HEALTH",
  "Fitness info": "PSL_FITNESS",
  "User payment info": "PSL_CREDIT_DEBIT_BANK_ACCOUNT_NUMBER",
  "Purchase history": "PSL_PURCHASE_HISTORY",
  "Name": "PSL_NAME",
  "Email address": "PSL_EMAIL",
  "Phone number": "PSL_PHONE",
  "User IDs": "PSL_USER_ACCOUNT",
  "Address": "PSL_ADDRESS",
  "Files and docs": "PSL_FILES_AND_DOCS",
};

/** Our purpose labels → Google's purpose response IDs. */
const PURPOSE_ID: Record<string, string> = {
  "App functionality": "PSL_APP_FUNCTIONALITY",
  "Analytics": "PSL_ANALYTICS",
  "Developer communications": "PSL_DEVELOPER_COMMUNICATIONS",
  "Fraud prevention, security, and compliance": "PSL_FRAUD_PREVENTION_SECURITY",
  "Advertising or marketing": "PSL_ADVERTISING",
  "Personalization": "PSL_PERSONALIZATION",
  "Account management": "PSL_ACCOUNT_MANAGEMENT",
};

export interface PlayCsvResult {
  csv: string;
  /** Rows whose type or purpose label we could not map — declare by hand. */
  unmapped: string[];
  /** Questions left blank on purpose — only the developer can answer them. */
  manualQuestions: ManualQuestion[];
}

export interface ManualQuestion {
  id: string;
  label: string;
  requirement: string;
}

export function generatePlayCsv(rows: PlayRow[]): PlayCsvResult {
  const unmapped: string[] = [];
  const selected = new Map<
    string,
    { collected: boolean; shared: boolean; purposes: Set<string> }
  >();

  for (const row of rows) {
    const typeId = TYPE_ID[row.type];
    if (!typeId) {
      unmapped.push(`${row.category} / ${row.type}`);
      continue;
    }
    const entry = selected.get(typeId) ?? {
      collected: false,
      shared: false,
      purposes: new Set<string>(),
    };
    entry.collected ||= row.collected;
    entry.shared ||= row.shared;
    for (const p of row.purposes) {
      const pid = PURPOSE_ID[p];
      if (pid) entry.purposes.add(pid);
      else unmapped.push(`${row.type}: purpose "${p}"`);
    }
    selected.set(typeId, entry);
  }

  const out = template.map((row) => {
    const [questionId, responseId, value, requirement, label] = row;
    let v = value;

    if (questionId === "Question ID (machine readable)") {
      // header row — keep as-is
    } else if (questionId === "PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA") {
      v = selected.size > 0 ? "TRUE" : "FALSE";
    } else if (questionId.startsWith("PSL_DATA_TYPES_") && responseId) {
      if (selected.has(responseId)) v = "TRUE";
    } else if (questionId.startsWith("PSL_DATA_USAGE_RESPONSES:")) {
      const [, typeId, usageQ] = questionId.split(":");
      const sel = selected.get(typeId);
      if (sel) {
        if (usageQ === "PSL_DATA_USAGE_COLLECTION_AND_SHARING") {
          if (responseId === "PSL_DATA_USAGE_ONLY_COLLECTED" && sel.collected) v = "TRUE";
          if (responseId === "PSL_DATA_USAGE_ONLY_SHARED" && sel.shared) v = "TRUE";
        } else if (usageQ === "DATA_USAGE_COLLECTION_PURPOSE" && sel.collected) {
          if (responseId && sel.purposes.has(responseId)) v = "TRUE";
        } else if (usageQ === "DATA_USAGE_SHARING_PURPOSE" && sel.shared) {
          if (responseId && sel.purposes.has(responseId)) v = "TRUE";
        }
        // EPHEMERAL and DATA_USAGE_USER_CONTROL stay blank: yours to answer.
      }
    }
    return [questionId, responseId, v, requirement, label];
  });

  return {
    csv: out.map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n",
    unmapped,
    manualQuestions: collectManualQuestions(selected),
  };
}

/**
 * The questions we deliberately leave blank: global form judgments
 * (encryption in transit, account creation, deletion URLs …) plus, for each
 * data type we marked collected, its user-control and ephemeral questions.
 */
function collectManualQuestions(
  selected: Map<string, unknown>,
): ManualQuestion[] {
  const out = new Map<string, ManualQuestion>();

  const questionLabel = (row: TemplateRow): string => {
    const label = row[4] ?? row[0];
    // Choice rows append "/ <choice>" — keep only the question part.
    return row[1] ? label.split(" / ").slice(0, -1).join(" / ") : label;
  };

  for (const row of template) {
    const [questionId, , , requirement] = row;
    if (questionId === "Question ID (machine readable)") continue;
    if (questionId === "PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA") continue;
    if (questionId.startsWith("PSL_DATA_TYPES_")) continue;

    if (questionId.startsWith("PSL_DATA_USAGE_RESPONSES:")) {
      const [, typeId, usageQ] = questionId.split(":");
      if (!selected.has(typeId)) continue; // form hides questions for unselected types
      if (usageQ !== "DATA_USAGE_USER_CONTROL" && usageQ !== "PSL_DATA_USAGE_EPHEMERAL") {
        continue; // collection/sharing/purposes: we answered those
      }
    }

    if (!out.has(questionId)) {
      out.set(questionId, {
        id: questionId,
        label: questionLabel(row),
        requirement: requirement ?? "OPTIONAL",
      });
    }
  }
  return [...out.values()];
}

function csvField(v: string | null): string {
  if (v === null || v === undefined) return "";
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
