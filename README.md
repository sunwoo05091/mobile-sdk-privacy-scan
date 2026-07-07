# sdk-privacy-scan

**English** • [한국어](./README.ko.md)

[![npm](https://img.shields.io/npm/v/sdk-privacy-scan)](https://www.npmjs.com/package/sdk-privacy-scan)
[![CI](https://github.com/sunwoo05091/mobile-sdk-privacy-scan/actions/workflows/ci.yml/badge.svg)](https://github.com/sunwoo05091/mobile-sdk-privacy-scan/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![node](https://img.shields.io/node/v/sdk-privacy-scan)](package.json)

**App-store privacy declarations, generated from your lockfiles.**
One scan of a React Native / Flutter project → Apple `PrivacyInfo.xcprivacy`,
App Store Connect answers, and an importable Google Play Data Safety CSV —
plus a CI gate that fails when your privacy posture silently expands.
Runs **fully locally**: no upload, no backend, no account.

```bash
npx sdk-privacy-scan ./my-app
```

![demo](https://raw.githubusercontent.com/sunwoo05091/mobile-sdk-privacy-scan/main/.github/assets/demo.svg?v=3)

---

## Why

Apple and Google both make you declare what every third-party SDK in your app
collects. In practice that means reading dozens of vendor docs by hand — and a
missed declaration is one of the most common App Review rejections
(`ITMS-91053`). This tool automates the mechanical part and points at exactly
the judgment calls only you can make.

| | By hand | sdk-privacy-scan |
| --- | --- | --- |
| Find every SDK across pub / npm / pods / gradle | hours | one scan |
| What each SDK collects | vendor docs, guesswork | the SDK's **own shipped manifest**, read directly |
| Apple manifest + ASC answers + Play CSV | copy-paste | generated, with evidence per answer |
| Catching regressions in PRs | nobody does | committed baseline + exit 1 |

## How it works

```
lockfiles ─▶ detect ─▶ harvest ─▶ resolve ─▶ generate ─▶ gate
```

1. **Detect** dependencies in every layer: `pubspec.lock`, `package.json`,
   `ios/Podfile.lock`, `android/**/build.gradle` — and report **coverage**
   loudly when a layer can't be scanned (Expo managed, missing lockfiles).
2. **Harvest** the `PrivacyInfo.xcprivacy` files SDKs ship inside their own
   packages, parse them, attribute them to the owning dependency. The SDK's
   own declaration **replaces** our knowledge-base entry — read, don't guess.
3. **Resolve** everything else against a bundled, auto-verified knowledge base
   (50 SDKs; the Apple side of 47 of them is harvested from real artifacts).
4. **Generate** four deliverables (below), pre-filling everything provable and
   marking every judgment call `REVIEW`.
5. **Gate** CI: manifest drift (`--compare`) and privacy-posture expansion
   (`.privacy-baseline.json`) exit 1.

## What you get

| File | Goes to |
| --- | --- |
| `PrivacyInfo.xcprivacy` | your Xcode app target (bundle manifest) |
| `app-store-connect-answers.md` | ASC → App Privacy web questionnaire (it has no import/API) |
| `play-data-safety.csv` | Play Console → App content → Data safety → **Import from CSV** |
| `play-data-safety.md` | humans reviewing the above |

## Beyond the drafts

- **Required-reason APIs (`ITMS-91053`)** — packages that touch UserDefaults /
  file timestamps / disk space are cross-checked against the manifests they
  ship: ✓ covered, or the exact category + reason code you must declare.
- **Your app's own collection** — triangulated from capability packages,
  `Info.plist` usage keys, and `AndroidManifest` permissions (catches packages
  we've never heard of).
- **Missing permission strings** — `record` without
  `NSMicrophoneUsageDescription`, tracking SDKs without the ATT prompt:
  crash/rejection warnings before App Review finds them.
- **Possibly-unused dependencies** — a declared-but-never-imported SDK still
  ships in your binary and inflates your privacy label for nothing.
- **Review notes** — `TRACKING` (ATT required), `CONFIG` (AdMob/Mixpanel-style
  "depends on your setup", with the exact setting to check), `UNVERIFIED`,
  `MALFORMED`.

## CI: lock your privacy posture

```bash
npx sdk-privacy-scan . --update-baseline   # acknowledge current posture, commit the file
```

Commit `.privacy-baseline.json`. From then on, any PR that adds an SDK, a data
type, tracking, or an uncovered required-reason API **fails CI (exit 1)** until
the team updates the store declarations and re-baselines — lockfile semantics
for privacy.

```yaml
# .github/workflows/privacy.yml
- uses: sunwoo05091/mobile-sdk-privacy-scan@main
  with:
    path: .
    args: --compare ios/Runner/PrivacyInfo.xcprivacy
```

## Rejected anyway? Paste the mail

Apple's rejection mails (`ITMS-91053` …) are cryptic. `explain` decodes them —
keyed on the **stable category codes only**, never the mail wording — and,
given your project, names the culprit and the fix:

```bash
npx sdk-privacy-scan explain "…ITMS-91053: Missing API declaration …
NSPrivacyAccessedAPICategoryFileTimestamp…" --project .
```

```
ITMS-91053 — Missing API declaration: your app calls a required-reason API …

NSPrivacyAccessedAPICategoryFileTimestamp (File timestamps)
  In YOUR project this likely comes from:
    ✗ react-native-fs — no shipped manifest covers it. Fix: update the
      package, or declare …FileTimestamp (C617.1) in your PrivacyInfo.xcprivacy.
  Approved reasons:
    C617.1  Timestamps of files inside the app's own container (the common case)
```

Piping works too: `pbpaste | npx sdk-privacy-scan explain -p .`

## Korean output

```bash
npx sdk-privacy-scan ./my-app --lang ko    # 모든 안내 문구가 한국어로 출력됩니다
```

Default is English; technical identifiers (`NSPrivacy…`, reason codes) stay
English in both languages so they always match Apple/Google docs.

## Trust boundary

No scanner can make privacy declarations 100% correct — the tool says so
explicitly at the end of every scan:

| Tier | Covers | Trust |
| --- | --- | --- |
| ✓ verified | `[manifest]` entries — the SDK's own shipped declaration | as truthful as the vendor made it (broken/empty ones are flagged) |
| ~ curated | `[KB seed]` entries, all Play rows | our research — verify against vendor docs / Play SDK Index |
| ✗ yours | linked-to-identity, purposes, tracking intent, backend data | undecidable by any scanner — marked `REVIEW`/`VERIFY` |

Generated files are **drafts to review — not legal advice, not a compliance
guarantee.**

## The knowledge base

`src/kb/data.json` — 50 SDKs. The Apple side is **auto-harvested from each
SDK's real distribution artifact** by `tools/kb-build.mjs` (CocoaPods trunk →
podspec → download → read the shipped manifest), stamped with pod version and
date. The Play side is curated and must be verified against the
[Play SDK Index](https://play.google.com/sdks). To add an SDK: add a skeleton
entry (id, name, aliases, curated Play rows) and run:

```bash
node tools/kb-build.mjs                # verify: diff KB vs shipped manifests
node tools/kb-build.mjs --write        # apply + stamp lastVerified
```

## CLI reference

```bash
npx sdk-privacy-scan [dir]                     # scan, write drafts to ./privacy-out
  -o, --out <dir>                              # output directory
  --compare <PrivacyInfo.xcprivacy>            # drift gate: exit 1 on undeclared collection
  --update-baseline                            # write .privacy-baseline.json (commit it)
  --json                                       # machine-readable scan.json
  --lang <en|ko>                               # output language (default: en)

npx sdk-privacy-scan explain "<rejection mail>" -p .   # decode ITMS-91053 etc.
  # names the API category, the culprit package in YOUR project, and the fix
```

## Roadmap

- Grow the KB past 50 entries; required-reason detection from source
- Optional remote KB refresh (opt-in) — offline-first stays the default

## License

[MIT](./LICENSE) — the Play CSV template is derived from
[fastlane-plugin-google_data_safety](https://github.com/owenbean400/fastlane-plugin-google_data_safety) (MIT).
