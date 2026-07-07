// Output language. Default English; `--lang ko` switches the CLI chrome to
// Korean. Gettext-style: the English literal IS the catalog key, so a missing
// translation falls back to English instead of breaking. Technical
// identifiers (NSPrivacy…, [manifest], reason codes, KB-sourced sentences)
// stay English on purpose — they must match Apple/Google docs and grep.
export type Lang = "en" | "ko";

let lang: Lang = "en";

export function setLang(l: string): void {
  lang = l === "ko" ? "ko" : "en";
}

/** Translate a fixed phrase. */
export function t(key: string): string {
  return lang === "ko" ? (KO[key] ?? key) : key;
}

/** Translate a phrase with {token} placeholders. */
export function tf(key: string, vars: Record<string, string | number>): string {
  let out = t(key);
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

const KO: Record<string, string> = {
  "Scanning {dir} …": "{dir} 스캔 중 …",
  "Project type: ": "프로젝트 유형: ",
  "unknown (no Flutter/RN markers found)": "알 수 없음 (Flutter/RN 흔적 없음)",
  "Dependencies scanned: ": "스캔한 의존성: ",
  "Known SDKs: ": "인식된 SDK: ",
  "Unrecognized: ": "미인식: ",

  "Coverage:": "커버리지:",
  "— NOT SCANNED": "— 스캔 안 됨",
  "  ⚠ Results are PARTIAL — {n} layer(s) invisible to this scan. SDKs living there are missing from everything below.":
    "  ⚠ 부분 결과입니다 — 레이어 {n}개가 이 스캔에 보이지 않습니다. 거기 있는 SDK는 아래 모든 결과에서 빠져 있습니다.",
  "Flutter packages (pubspec.lock)": "Flutter 패키지 (pubspec.lock)",
  "iOS native pods (Podfile.lock)": "iOS 네이티브 pod (Podfile.lock)",
  "Android dependencies (build.gradle)": "Android 의존성 (build.gradle)",
  "SDK-shipped privacy manifests": "SDK가 배포한 프라이버시 매니페스트",
  "run `flutter pub get` to create pubspec.lock": "`flutter pub get`으로 pubspec.lock을 생성하세요",
  "run `pod install` (or commit ios/Podfile.lock)": "`pod install`을 실행하세요 (또는 ios/Podfile.lock 커밋)",
  "Expo managed workflow: run `npx expo prebuild` first — native SDKs are INVISIBLE to this scan until the ios/ project exists":
    "Expo managed 워크플로우: 먼저 `npx expo prebuild`를 실행하세요 — ios/ 프로젝트가 생기기 전엔 네이티브 SDK가 이 스캔에 전혀 보이지 않습니다",
  "Expo managed workflow: run `npx expo prebuild` first — the android/ project does not exist yet":
    "Expo managed 워크플로우: 먼저 `npx expo prebuild`를 실행하세요 — android/ 프로젝트가 아직 없습니다",
  "android/ project not found": "android/ 프로젝트가 없습니다",
  "run `pod install`, then re-scan to read each SDK's own declaration":
    "`pod install` 후 재스캔하면 SDK 자체 선언을 직접 읽습니다",

  "Recognized SDKs (data-collecting):": "인식된 SDK (데이터 수집):",
  " — Play data unknown, check manually": " — Play 데이터 미상, 수동 확인 필요",
  "Privacy manifests shipped by dependencies: {n} parsed": "의존성이 배포한 프라이버시 매니페스트: {n}개 파싱",
  " ({a} attributed, {o} unattributed{e})": " (귀속 {a}, 미귀속 {o}{e})",
  ", {n} unparseable": ", 파싱 불가 {n}",
  "unattributed: ": "미귀속: ",
  "  … and {n} more": "  … 외 {n}개",

  "Unrecognized direct dependencies — review these by hand ({n}):":
    "미인식 직접 의존성 — 직접 확인이 필요합니다 ({n}개):",
  "  suppressed {t} noise packages: {a} transitive, {b} dev-only, {c} platform shards, {d} known utilities (SDKs among them are still matched via the KB and shipped manifests)":
    "  노이즈 패키지 {t}개 생략: 전이 {a}, dev 전용 {b}, 플랫폼 구현체 {c}, 알려진 유틸 {d} (그 안의 SDK는 KB·배포 매니페스트로 여전히 매칭됩니다)",

  "Required-reason APIs (ITMS-91053) used by your dependencies:":
    "의존성이 사용하는 required-reason API (ITMS-91053):",
  "✓ covered by the package's own manifest": "✓ 패키지 자체 매니페스트로 커버됨",
  "⚠ no shipped manifest declares it — update the package, or declare {cat} ({reasons}) in YOUR PrivacyInfo.xcprivacy":
    "⚠ 어떤 배포 매니페스트도 선언하지 않음 — 패키지를 업데이트하거나, 앱의 PrivacyInfo.xcprivacy에 {cat} ({reasons})를 직접 선언하세요",

  "Your app's own data collection (app features, not SDKs):":
    "앱 자체 데이터 수집 (SDK가 아닌 앱 기능):",
  "  Added to both drafts with Linked=false + AppFunctionality — REVIEW them:\n  set Linked=true if tied to user identity, and fix purposes/shared.":
    "  두 초안 모두에 Linked=false + AppFunctionality로 추가했습니다 — 반드시 검토하세요:\n  사용자 신원과 연결되면 Linked=true로 바꾸고, 목적/공유 여부를 수정하세요.",

  "Missing iOS permission strings (crash / rejection risk):":
    "누락된 iOS 권한 문구 (크래시/리젝 위험):",
  "required by {x}": "{x} 때문에 필요",

  "Possibly unused dependencies": "미사용 의심 의존성",
  " (declared, but no import found in your source):": " (선언됐지만 소스에서 import를 찾지 못함):",
  "— data-collecting SDK: it still ships in your binary and forces privacy declarations. Remove it if truly unused.":
    "— 데이터 수집 SDK: 안 써도 바이너리에 실리고 프라이버시 신고 부담을 만듭니다. 정말 미사용이면 제거하세요.",
  "  Import-scanning has false positives (assets, codegen, native-only use).\n  Remove one at a time and prove it: pub get / install -> codegen -> analyze -> build.":
    "  import 스캔에는 가짜 양성이 있습니다 (에셋, codegen, 네이티브 전용 사용).\n  하나씩 제거하고 증명하세요: pub get / install → codegen → analyze → build.",

  "Review notes:": "검토 노트:",
  "declare cross-app tracking: iOS requires the ATT prompt (NSUserTrackingUsageDescription) before any tracking, and their tracking domains are blocked until the user consents.":
    "앱 간 추적을 선언합니다: iOS는 추적 전 ATT 프롬프트(NSUserTrackingUsageDescription)를 요구하며, 사용자가 동의할 때까지 추적 도메인이 차단됩니다.",
  "ship a manifest that declares NO data collection. Vendors often under-declare (\"depends on app configuration\") — review what your configuration actually sends.":
    "매니페스트에 수집 데이터가 없다고 선언합니다. 벤더는 흔히 과소 선언합니다(\"앱 설정에 달림\") — 실제 설정이 뭘 보내는지 검토하세요.",
  "no shipped manifest was readable here — data comes from our knowledge base. Re-scan after `pod install` to read the SDK's own declaration.":
    "여기서는 배포 매니페스트를 읽지 못했습니다 — 지식베이스 데이터입니다. `pod install` 후 재스캔하면 SDK 자체 선언을 읽습니다.",
  "{n} dependency manifest(s) could not be parsed — those SDKs' declarations are effectively missing.":
    "의존성 매니페스트 {n}개를 파싱하지 못했습니다 — 해당 SDK의 선언은 사실상 없는 상태입니다.",

  "Privacy delta vs committed baseline (.privacy-baseline.json):":
    "커밋된 베이스라인 대비 프라이버시 변화 (.privacy-baseline.json):",
  "  ✓ no change in privacy posture": "  ✓ 프라이버시 상태 변화 없음",
  "+ tracking turned ON": "+ 추적이 켜졌습니다",
  "- tracking turned off": "- 추적이 꺼졌습니다",
  "  ⚠ Collection EXPANDED. Update your store declarations, then re-baseline\n    with --update-baseline to acknowledge. (exit 1)":
    "  ⚠ 수집이 확대됐습니다. 스토어 신고를 갱신한 뒤 --update-baseline으로\n    재베이스라인하여 승인하세요. (exit 1)",

  "Drift vs your existing PrivacyInfo.xcprivacy:": "기존 PrivacyInfo.xcprivacy 대비 드리프트:",
  "  ✓ No drift detected.": "  ✓ 드리프트 없음.",
  "(collected but not declared)": "(수집되지만 미신고)",
  "(declared but no SDK found)": "(신고됐지만 해당 SDK 없음)",
  "\n✗ Undeclared collection found — this would likely be rejected. (exit 1)":
    "\n✗ 미신고 수집 발견 — 심사에서 거절될 가능성이 높습니다. (exit 1)",

  "Trust boundary — read this before submitting:": "신뢰 경계 — 제출 전에 꼭 읽으세요:",
  "✓ verified": "✓ 검증됨",
  "~ curated": "~ 큐레이션",
  "✗ yours": "✗ 당신 몫",
  "[manifest] entries: read from the SDK's own shipped declaration (as truthful as the vendor made it)":
    "[manifest] 항목: SDK가 직접 배포한 선언을 읽음 (벤더가 정직한 만큼만 정확)",
  "[KB seed] entries and all Play rows: our research — verify against vendor docs / Play SDK Index":
    "[KB seed] 항목과 모든 Play 행: 우리 조사 — 벤더 문서/Play SDK Index로 검증하세요",
  "Linked-to-identity, purposes, tracking intent, backend-collected data (login, IDs):":
    "신원 연결(Linked), 목적, 추적 의도, 백엔드 수집 데이터(로그인, 신원정보):",
  "no scanner can decide these. Drafts are a reviewed starting point — not legal advice.":
    "어떤 스캐너도 판단할 수 없습니다. 초안은 검토용 시작점일 뿐 — 법률 자문이 아닙니다.",

  "Next steps:": "다음 할 일:",
  "No app privacy manifest found — add {file} to your Xcode app target as a starting point.":
    "앱 프라이버시 매니페스트가 없습니다 — {file}을 Xcode 앱 타겟에 추가해 시작하세요.",
  "Existing manifest found ({file}) — re-run with --compare {file} to gate drift in CI.":
    "기존 매니페스트 발견 ({file}) — --compare {file}로 재실행하면 CI에서 드리프트를 막을 수 있습니다.",
  "Resolve the ⚠ required-reason warnings above — missing declarations trigger ITMS-91053 at upload.":
    "위의 ⚠ required-reason 경고를 해결하세요 — 미신고는 업로드 시 ITMS-91053을 유발합니다.",
  "Add the missing Info.plist permission strings ({keys}) — apps crash at runtime and App Review rejects without them.":
    "누락된 Info.plist 권한 문구({keys})를 추가하세요 — 없으면 런타임 크래시가 나고 심사에서 거절됩니다.",
  "Review the app-feature entries added to both drafts: set Linked=true where data ties to user identity, fix purposes, and mark Shared if sent to third parties.":
    "두 초안에 추가된 앱 기능 수집 항목을 검토하세요: 신원과 연결되면 Linked=true, 목적 수정, 제3자 전송 시 Shared 표시.",
  "Data collected through your own backend (accounts, login, identity verification — names, phone numbers, national IDs) is invisible to scanning: add it to both forms yourself.":
    "백엔드로 수집하는 데이터(계정, 로그인, 본인인증 — 이름, 전화번호, 신원번호)는 스캔에 잡히지 않습니다: 두 양식에 직접 추가하세요.",
  "Remove unused data-collecting SDKs if confirmed ({pkgs}) — they inflate your privacy declarations for nothing.":
    "미사용이 확인되면 데이터 수집 SDK({pkgs})를 제거하세요 — 쓸데없이 프라이버시 신고만 부풀립니다.",
  "ios/Pods is missing — run `pod install` and re-scan so SDK-shipped privacy manifests can be read directly.":
    "ios/Pods가 없습니다 — `pod install` 후 재스캔하면 SDK가 배포한 매니페스트를 직접 읽습니다.",

  "Drafts written to {dir}": "초안 생성 완료: {dir}",
  "(add to your Xcode app target)": "(Xcode 앱 타겟에 추가)",
  "(ASC App Privacy questionnaire — web form only)": "(ASC App Privacy 설문 답안 — 웹 양식 전용)",
  "(Play Console → Data safety → Import from CSV)": "(Play Console → 데이터 보안 → CSV 가져오기)",
  "(human-readable summary)": "(사람이 읽는 요약)",
  "  ⚠ not mapped into the CSV (declare by hand): {items}": "  ⚠ CSV에 매핑되지 않음 (직접 신고 필요): {items}",
  "  ✍ {n} CSV questions are left for YOU to answer — checklist at the bottom of play-data-safety.md":
    "  ✍ CSV 문항 {n}개는 직접 답해야 합니다 — 체크리스트: play-data-safety.md 하단",
  "Baseline written: ": "베이스라인 저장: ",
  " — commit it; future scans fail CI when collection expands.":
    " — 커밋하세요. 이후 수집이 확대되면 스캔이 CI를 실패시킵니다.",

  "No stable codes found in that text. Paste the full rejection mail — the useful parts look like ITMS-91053 and NSPrivacyAccessedAPICategory…":
    "그 텍스트에서 안정적인 코드를 찾지 못했습니다. 리젝 메일 전문을 붙여넣으세요 — ITMS-91053, NSPrivacyAccessedAPICategory… 같은 부분이 필요합니다.",
  "  Triggered by: ": "  유발 원인: ",
  "  In YOUR project this likely comes from:": "  이 프로젝트에서 유력한 원인:",
  "— its own manifest declares this; if the error persists, YOUR app code also uses the API: declare it app-side.":
    "— 자체 매니페스트가 이미 선언합니다. 에러가 계속되면 앱 코드도 이 API를 쓰는 것: 앱 쪽에 선언하세요.",
  "— no shipped manifest covers it. Fix: update the package, or declare {cat} ({reasons}) in your PrivacyInfo.xcprivacy.":
    "— 커버하는 배포 매니페스트가 없습니다. 해결: 패키지를 업데이트하거나, PrivacyInfo.xcprivacy에 {cat} ({reasons})를 선언하세요.",
  "  No known package in this project maps to it — your own native/app code (or an SDK we don't know) calls the API. Declare the reason app-side.":
    "  이 프로젝트에서 매핑되는 패키지가 없습니다 — 앱 자체 코드(또는 우리가 모르는 SDK)가 이 API를 호출합니다. 앱 쪽에 사유를 선언하세요.",
  "  Approved reasons:": "  승인된 사유 코드:",
  "Collected data types mentioned: ": "언급된 수집 데이터 타입: ",
  "  These belong in NSPrivacyCollectedDataTypes. Run a scan with --compare against your manifest to see exactly what's missing.\n":
    "  NSPrivacyCollectedDataTypes에 들어갈 항목입니다. --compare로 스캔하면 정확히 뭐가 빠졌는지 나옵니다.\n",
  "Reason definitions: ": "사유 코드 정의: ",
};
