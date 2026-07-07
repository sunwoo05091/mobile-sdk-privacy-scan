# sdk-privacy-scan

Scan a **React Native** or **Flutter** project for third-party SDKs and generate
**Apple privacy manifest** (`PrivacyInfo.xcprivacy`) and **Google Play Data Safety**
drafts — then check them for drift. Runs **fully locally**: no upload, no backend.

Like Prism, it's a plain CLI you run and it works immediately:

```bash
npx sdk-privacy-scan            # scan the current directory
npx sdk-privacy-scan ./my-app   # scan a specific project
```

## What it does

1. **Detects** dependencies across every layer of an app:
   - Flutter: `pubspec.lock`
   - React Native: `package.json` + `ios/Podfile.lock` + `android/**/build.gradle`
2. **Harvests** any `PrivacyInfo.xcprivacy` that SDKs already ship inside their
   packages on disk, parses it, and attributes it to the owning dependency.
   The SDK's own declaration is the best source of truth — it **replaces** the
   knowledge-base entry for that SDK (read it, don't guess). SDKs that ship a
   manifest but aren't in the KB still contribute to the Apple aggregate.
3. **Resolves** each remaining dependency against a bundled knowledge base that
   maps an SDK to the data it collects, across pub / npm / pod names.
4. **Generates** a merged `PrivacyInfo.xcprivacy` and a `play-data-safety.md` draft.
5. **Detects drift**: `--compare` your existing manifest to flag data types that
   SDKs collect but you never declared, and tracking under-declaration
   (the things that get apps rejected).
6. **Flags required-reason APIs** (ITMS-91053): known packages that touch
   UserDefaults / file timestamps / disk space are cross-checked against the
   manifests they ship — you get a ✓ or a "declare this yourself" warning.

## Usage

```bash
# generate drafts into ./privacy-out
npx sdk-privacy-scan ./my-app

# CI gate: fail (exit 1) if your manifest is missing declarations
npx sdk-privacy-scan ./my-app --compare ios/MyApp/PrivacyInfo.xcprivacy

# also emit machine-readable scan.json
npx sdk-privacy-scan ./my-app --json
```

## Architecture

```
src/
  cli.ts                 CLI entry (the npx bin)
  types.ts               shared types
  appleData.ts           precedence: harvested manifest beats KB entry
  detect/
    flutter.ts           pubspec.lock parser
    reactNative.ts       package.json + Podfile.lock + gradle parser
    harvest.ts           find + parse PrivacyInfo.xcprivacy shipped by deps
    index.ts             orchestrate + resolve against the KB
  kb/
    data.json            bundled knowledge base (ships in the package)
    index.ts             loader + alias index
  generate/
    appleManifest.ts     -> PrivacyInfo.xcprivacy
    playDataSafety.ts    -> play-data-safety.md
  drift.ts               compare declared vs detected
  report.ts              terminal output
```

The knowledge base (`src/kb/data.json`) is the heart of the project — and its moat.
It ships inside the package so the tool works offline. Extend it via pull requests.

## The knowledge base

`src/kb/data.json` has two kinds of data with different provenance:

- **Apple side** (`apple`, `tracking`, `trackingDomains`): auto-harvested from
  each SDK's own shipped `PrivacyInfo.xcprivacy` by `tools/kb-build.mjs`.
  Each entry's `source` names the exact pod + version it came from and
  `lastVerified` says when. Entries whose artifacts ship no manifest (e.g.
  Firebase Analytics 12.x binaries) keep curated seed data and say so.
- **Play side** (`play`): curated by hand and **must be verified** against the
  [Google Play SDK Index](https://play.google.com/sdks) — Google has no
  machine-readable equivalent of privacy manifests.

Data collection varies by SDK version and by how each app configures the SDK.
Generated files are **drafts to review — not legal advice, not a compliance
guarantee.**

### Maintaining the KB (maintainers only)

```bash
node tools/kb-build.mjs                # verify: diff KB vs shipped manifests, exit 1 on drift
node tools/kb-build.mjs --write        # apply harvested data + stamp lastVerified
node tools/kb-build.mjs --ids sentry   # limit to specific entry ids
```

The tool downloads pod artifacts from CocoaPods (network!), extracts them into
`tools/.cache/`, and reads the privacy manifests they ship. The scanner itself
never touches the network — only the refreshed `data.json` ships in the package.
To add an SDK: add a skeleton entry (id, name, aliases, curated `play` rows,
empty `apple`) and run the tool with `--write`.

## Roadmap

- Keep growing the KB past 50 entries (Apple's "required manifest" list is the target set)
- Grow the required-reason package mapping; detect API use from source as a fallback
- Optional remote KB refresh (opt-in), keeping offline-first as the default

## License

Apache-2.0
