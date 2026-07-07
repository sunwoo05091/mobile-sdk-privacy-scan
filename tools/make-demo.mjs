#!/usr/bin/env node
// Regenerate .github/assets/demo.svg — an ANIMATED terminal recording:
// the command types itself, then real scan output (RN fixture) streams in.
// Pure SVG+CSS (no gif, no deps); loops with an end hold. Maintainer tool:
// re-run after output-format changes so the README demo never lies.
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

const CMD = "npx sdk-privacy-scan ./my-app";
const lines = raw
  .split("\n")
  .filter((l) => !l.startsWith("Scanning "))
  .map((l) =>
    l
      .replace(root + "/test/fixtures/rn_app", "./my-app")
      .replace(/\/var\/folders\/\S+/g, "privacy-out/"),
  );

// ---- timeline (seconds) --------------------------------------------------
const TYPE_START = 0.6;
const TYPE_STEP = 0.055;
const OUT_START = TYPE_START + CMD.length * TYPE_STEP + 0.5;
const OUT_STEP = 0.065;
const OUT_END = OUT_START + lines.length * OUT_STEP;
const HOLD = 8; // stay readable before the loop resets
const TOTAL = OUT_END + HOLD;

const pct = (s) => ((s / TOTAL) * 100).toFixed(3);

const color = (line) => {
  const t = line.trim();
  if (t.startsWith("✓")) return "#7ee787";
  if (t.startsWith("✗") || t.startsWith("⚠") || t.startsWith("!")) return "#ff7b72";
  if (t.startsWith("?")) return "#e3b341";
  if (t.startsWith("•") || t.startsWith("·")) return "#c9d1d9";
  if (/^(Coverage|Recognized|Privacy manifests|Unrecognized|Required-reason|Your app|Possibly unused|Review notes|Drafts written|Next steps|Trust boundary|Privacy delta|Project type|Dependencies)/.test(t)) return "#79c0ff";
  if (/^(TRACKING|MISSING|CONFIG|UNVERIFIED|CONSERVATIVE|MALFORMED)/.test(t)) return "#ffa657";
  if (/^\d+\./.test(t)) return "#d2a8ff";
  return "#8b949e";
};

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const LH = 19;
const PAD = 18;
const W = 860;
const TOP = PAD + 34;
const H = TOP + (lines.length + 2) * LH + PAD;

let css = `text{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px}`;
let body = "";
let k = 0;

// helper: element visible from t seconds until the loop resets
const appear = (t) => {
  const name = `a${k++}`;
  css += `@keyframes ${name}{0%,${pct(t)}%{opacity:0}${pct(t + 0.01)}%,98%{opacity:1}100%{opacity:0}}`;
  return `opacity:0;animation:${name} ${TOTAL}s linear infinite`;
};

// prompt + typed command (one <text> per character so it "types")
body += `<text x="${PAD}" y="${TOP}" fill="#7ee787" style="${appear(0)}">$</text>`;
for (let i = 0; i < CMD.length; i++) {
  const x = PAD + (i + 2) * 7.55;
  body += `<text x="${x}" y="${TOP}" fill="#e6edf3" style="${appear(TYPE_START + i * TYPE_STEP)}">${esc(CMD[i])}</text>`;
}
// blinking cursor while typing, gone when output starts
css += `@keyframes blink{0%,${pct(OUT_START)}%{opacity:1}${pct(OUT_START + 0.01)}%,100%{opacity:0}}`;
css += `@keyframes caret{50%{fill:transparent}}`;
body += `<rect x="${PAD + (CMD.length + 2) * 7.55 + 2}" y="${TOP - 11}" width="7" height="14" fill="#e6edf3" style="animation:blink ${TOTAL}s linear infinite,caret 1s steps(1) infinite"/>`;

// streamed output
lines.forEach((l, j) => {
  const y = TOP + (j + 2) * LH;
  const shown = l.length > 108 ? l.slice(0, 105) + "…" : l;
  body += `<text x="${PAD}" y="${y}" fill="${color(l)}" style="${appear(OUT_START + j * OUT_STEP)}">${esc(shown)}</text>`;
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>${css}</style>
<rect width="${W}" height="${H}" rx="10" fill="#0d1117" stroke="#30363d"/>
<circle cx="22" cy="20" r="6" fill="#ff5f57"/><circle cx="42" cy="20" r="6" fill="#febc2e"/><circle cx="62" cy="20" r="6" fill="#28c840"/>
<text x="${W / 2}" y="24" fill="#8b949e" text-anchor="middle" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="12">sdk-privacy-scan — ${lines.length} lines, fully local</text>
${body}
</svg>
`;

mkdirSync(join(root, ".github", "assets"), { recursive: true });
writeFileSync(join(root, ".github", "assets", "demo.svg"), svg);
console.log(
  `demo.svg: animated, ${lines.length} lines, ${(TOTAL).toFixed(1)}s loop, ${W}x${H}`,
);
