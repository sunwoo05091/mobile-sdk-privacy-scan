#!/usr/bin/env node
// Regenerate .github/assets/demo.svg from a real scan of the RN fixture.
// Maintainer tool: run after output-format changes so the README demo
// never lies about what the CLI prints.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env, NO_COLOR: "1" };
delete env.FORCE_COLOR;

const raw = execFileSync(
  process.execPath,
  [join(root, "dist", "cli.js"), join(root, "test", "fixtures", "rn_app"), "--out", join(root, "tools", ".cache", "demo-out")],
  { encoding: "utf8", env },
);

const lines = [
  "$ npx sdk-privacy-scan ./my-app",
  "",
  ...raw
    .split("\n")
    .filter((l) => !l.startsWith("Scanning "))
    .map((l) => l.replace(root + "/test/fixtures/rn_app", "./my-app").replace(/\/var\/folders\/\S+/g, "privacy-out/")),
];

const color = (line) => {
  const t = line.trim();
  if (line.startsWith("$")) return "#7ee787";
  if (t.startsWith("✓") || t.startsWith("✓")) return "#7ee787";
  if (t.startsWith("✗") || t.startsWith("⚠") || t.startsWith("!")) return "#ff7b72";
  if (t.startsWith("?")) return "#e3b341";
  if (t.startsWith("•") || t.startsWith("·")) return "#c9d1d9";
  if (/^(Coverage|Recognized|Privacy manifests|Unrecognized|Required-reason|Your app|Possibly unused|Review notes|Drafts written|Next steps|Trust boundary|Privacy delta)/.test(t)) return "#79c0ff";
  if (/^(TRACKING|MISSING|CONFIG|UNVERIFIED|CONSERVATIVE|MALFORMED)/.test(t)) return "#ffa657";
  if (/^\d+\./.test(t)) return "#d2a8ff";
  return "#8b949e";
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const LH = 19;
const PAD = 18;
const W = 860;
const H = PAD * 2 + 34 + lines.length * LH;

const text = lines
  .map((l, i) => {
    const y = PAD + 34 + i * LH;
    const shown = l.length > 108 ? l.slice(0, 105) + "…" : l;
    return `<text x="${PAD}" y="${y}" fill="${color(l)}">${esc(shown)}</text>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" rx="10" fill="#0d1117" stroke="#30363d"/>
<circle cx="22" cy="20" r="6" fill="#ff5f57"/><circle cx="42" cy="20" r="6" fill="#febc2e"/><circle cx="62" cy="20" r="6" fill="#28c840"/>
<text x="${W / 2}" y="24" fill="#8b949e" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="12">sdk-privacy-scan</text>
<g font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="12.5">
${text}
</g>
</svg>
`;

mkdirSync(join(root, ".github", "assets"), { recursive: true });
writeFileSync(join(root, ".github", "assets", "demo.svg"), svg);
console.log(`demo.svg: ${lines.length} lines, ${W}x${H}`);
