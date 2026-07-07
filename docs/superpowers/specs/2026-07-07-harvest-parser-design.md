# Harvest 파서 설계 — SDK가 배포한 PrivacyInfo.xcprivacy를 읽어 KB보다 우선 적용

- 날짜: 2026-07-07
- 상태: 구현 완료 (2026-07-07, 테스트 60개 green)
- 선행 작업: 테스트 스위트 43개 (2026-07-07 완료), harvest 중복 수집 버그 수정

## 목표

의존성 폴더 안에서 발견한 `PrivacyInfo.xcprivacy` 파일을 **파싱**하고, 소유
SDK에 **귀속**시켜, Apple 쪽 데이터의 근거로 **KB 시드보다 우선 적용**한다.
"SDK 데이터는 추측 금지 — 읽을 수 있으면 읽는다"는 프로젝트 철학의 구현이다.

## 확정된 설계 결정

| 질문 | 결정 |
| --- | --- |
| KB 엔트리와 harvested 매니페스트가 둘 다 있을 때 | **교체.** harvested가 Apple 쪽 데이터(collected types, tracking, trackingDomains)를 완전히 대체. KB는 매니페스트 없는 SDK의 폴백. |
| KB에 없는 SDK가 매니페스트를 배포한 경우 | **집계에 포함.** synthetic 엔트리로 resolved에 추가하고 unknown에서 제거. Play 쪽 데이터는 없으므로 "수동 확인 필요"로 표시. |
| `NSPrivacyAccessedAPITypes` | **이번엔 미파싱.** 신고 주체가 SDK 번들 자신이므로 앱 매니페스트에 복사하면 과대 신고. 대신 생성 매니페스트의 빈 키 위에 "앱 자체 사용 API는 직접 신고 필요(ITMS-91053)" XML 주석 삽입. 앱 자체 required-reason 탐지는 별도 로드맵 기능. |

## 비목표 (이번 범위 아님)

- `NSPrivacyAccessedAPITypes` 파싱·집계
- 앱 자체 코드의 required-reason API 탐지
- KB 엔트리와 harvested 매니페스트의 불일치 경고 (자연스러운 후속 작업)
- 원격 KB 갱신

## 아키텍처

채택안: **파이프라인 모델 확장** (대안이었던 CLI 병합·KB 런타임 주입은
경계가 나빠지거나 정적 KB와 런타임 데이터의 출처 구분이 흐려져 기각).

```
harvest.ts   walk → 파일 발견 → plist 파싱 → 경로로 owner 귀속
                → HarvestedManifest[] + parseErrors[]
detect/index scanProject:
                harvested.owner ↔ detected 의존성 매칭
                  ├─ KB alias로 resolve되는 SDK → ResolvedSdk.harvested[]에 부착
                  ├─ KB에 없지만 detected와 일치 → synthetic 엔트리로 resolved 추가,
                  │                                unknown에서 제거
                  └─ 매칭 실패 → 경로만 리포트에 유지 (unattributed)
appleData.ts effectiveAppleData(resolved): harvested 있으면 그 union, 없으면 KB
generate/    appleManifest·drift 모두 effectiveAppleData만 통해 Apple 데이터 접근
```

### 타입 변경 (`src/types.ts`)

```ts
export interface HarvestedManifest {
  path: string;                                   // 절대 경로
  owner?: { ecosystem: Ecosystem; name: string }; // 경로에서 귀속 실패 시 없음
  tracking: boolean;                              // NSPrivacyTracking
  trackingDomains: string[];                      // NSPrivacyTrackingDomains
  apple: AppleCollectedType[];                    // NSPrivacyCollectedDataTypes
}

export interface ResolvedSdk {
  dependency: DetectedDependency;
  entry: KbEntry;
  harvested?: HarvestedManifest[];  // 이 SDK에 귀속된 매니페스트들
}

export interface ScanResult {
  // …기존 필드…
  harvestedManifests: HarvestedManifest[];  // 기존 string[]에서 변경 (breaking)
  harvestErrors: string[];                  // 파싱 실패한 파일 경로
}
```

`scan.json` 형태가 바뀌지만 v0.1.0 (미공개)이므로 하위 호환 부담 없음.

### 경로 귀속 규칙 (`harvest.ts`)

발견 경로의 세그먼트로 소유자를 결정한다:

| 패턴 | 귀속 |
| --- | --- |
| `ios/Pods/<PodName>/**` | `{ ecosystem: "pod", name: PodName }` |
| `node_modules/<pkg>/**`, `node_modules/@scope/<pkg>/**` | `{ ecosystem: "npm", name }` (스코프 포함 전체 이름) |
| `.symlinks/plugins/<pubName>/**` | `{ ecosystem: "pub", name: pubName }` |
| 그 외 (`Target Support Files` 등) | owner 없음 |

### 매칭 규칙 (`detect/index.ts`)

1. owner가 있는 각 매니페스트에 대해 `lookup(owner.ecosystem, owner.name)`으로
   KB 엔트리를 찾고, 같은 `entry.id`의 ResolvedSdk에 부착한다.
   같은 SDK의 여러 바이너리가 각자 매니페스트를 배포할 수 있으므로
   (예: FirebaseAnalytics + GoogleAppMeasurement) `harvested`는 배열이며
   `effectiveAppleData`가 union으로 병합한다.
2. KB에 없으면 detected 의존성과 `(ecosystem, name)` 대소문자 무시 비교로
   매칭한다. 일치하면 synthetic 엔트리를 만들어 resolved에 추가:
   ```ts
   {
     id: `harvested:${name}`, name, aliases: { [eco]: [name] },
     tracking, trackingDomains, apple,   // 매니페스트 값
     play: [],                           // Play는 알 수 없음 → 수동 확인
     source: `harvested from ${projectRoot 기준 상대 경로}`,
   }
   ```
   해당 의존성은 unknown에서 제거된다.
3. detected와도 매칭되지 않으면(락파일에 없는 잔존 Pods 등) 신뢰 근거가
   없으므로 집계에 넣지 않고 경로만 리포트에 표시한다.

### 우선순위 헬퍼 (`src/appleData.ts`, 신규)

```ts
export function effectiveAppleData(r: ResolvedSdk): {
  apple: AppleCollectedType[];
  tracking: boolean;
  trackingDomains: string[];
  provenance: "manifest" | "kb";
}
```

- `r.harvested`가 비어있지 않으면: 매니페스트들의 apple을 타입 단위 union
  (linked/tracking OR, purposes 합집합 — 기존 aggregate 병합과 동일 의미론),
  tracking은 OR, domains는 합집합. `provenance: "manifest"`.
- 없으면 KB 엔트리 값 그대로. `provenance: "kb"`.
- `generateAppleManifest`와 `detectDrift`는 이 헬퍼를 통해서만 Apple 데이터를
  읽는다 → 생성물과 drift 판정이 구조적으로 항상 일치.

### 파싱과 에러 처리 (`harvest.ts`)

- `plist.parse` 실패, 루트가 dict가 아님, 읽기 실패 → 해당 경로를
  `harvestErrors`에 넣고 계속 진행. 조용히 버리지 않는다.
- 키 누락은 방어적 기본값: `NSPrivacyTracking` 없음 → false, 배열 없음 → [].
- `NSPrivacyCollectedDataTypes` 항목에서 문자열이 아닌 type, 배열이 아닌
  purposes 등 형태가 어긋난 항목은 그 항목만 건너뛴다.

### 출력 변경

- **리포트** (`report.ts`):
  - SDK별 출처 태그: `[manifest]`(SDK 자신의 신고) / `[KB seed]`(검증 필요).
  - harvested-only SDK에 `Play: 수동 확인 필요` 표시.
  - harvest 요약: 파싱된 매니페스트 수, 귀속 실패 경로(최대 5개 + "… and N
    more"), 파싱 실패 수. 기존 리포트의 경로 나열(최대 10개)은 이 요약으로 대체.
- **생성 매니페스트** (`generate/appleManifest.ts`):
  - 빈 `NSPrivacyAccessedAPITypes` 위에 XML 주석 삽입 (plist.build는 주석을
    지원하지 않으므로 빌드된 XML 문자열에 후처리로 삽입):
    ```xml
    <!-- Required-reason APIs used by YOUR OWN app code must be declared here
         (e.g. UserDefaults via shared_preferences). Missing declarations
         trigger ITMS-91053. SDK-side API use is declared in each SDK's own
         bundled manifest and must NOT be copied here. -->
    ```
- **`play-data-safety.md`** (`generate/playDataSafety.ts`):
  - harvested-only SDK 목록을 "Play 데이터 수동 확인 필요" 섹션으로 추가
    (해당 SDK의 Play SDK Index 확인 안내).

### README

- "What it does" 2번 항목을 파싱·우선 적용 반영으로 갱신.
- Roadmap에서 "Parse harvested … prefer them over KB entries" 항목 제거.

## 테스트 계획

TDD로 진행: 각 동작에 대해 실패하는 테스트를 먼저 작성한다. 새 기능이므로
이번에는 red → green 사이클이 그대로 적용된다.

### 픽스처 추가 (`test/fixtures/rn_app/`)

- `ios/Pods/FBSDKCoreKit/PrivacyInfo.xcprivacy` — **KB 시드와 다른 내용**으로
  작성 (예: `OtherUsageData` 타입 추가, `graph.facebook.com` 도메인 추가)
  → 교체 의미론이 최종 산출물에서 관찰 가능.
- `Podfile.lock`에 `Mixpanel` pod 추가 + `ios/Pods/Mixpanel/PrivacyInfo.xcprivacy`
  — KB에 없는 SDK → harvested-only 경로 검증.
- Flutter 픽스처는 그대로 둔다 (KB-only 폴백 경로 커버).

### 유닛

- 귀속: pod / npm 스코프·비스코프 / `.symlinks` pub / 귀속 불가 각 케이스.
- 파싱: 정상, 키 누락 기본값, 손상 plist → harvestErrors 수집.
- `effectiveAppleData`: KB-only / 단일 harvested 교체 / 복수 harvested union /
  provenance 값.
- 매칭: KB alias 경유 부착, synthetic 엔트리 생성과 unknown 제거,
  detected에 없는 매니페스트는 미집계.

### E2E (CLI)

- RN 스캔: 최종 plist에 harvested 전용 타입(`OtherUsageData`)과 도메인 존재,
  Mixpanel이 resolved에 포함되고 unknown에 없음.
- `play-data-safety.md`에 Mixpanel 수동 확인 섹션 존재.
- 생성 매니페스트의 XML 주석(ITMS-91053) 존재 + `plist.parse` 왕복 무손상.
- 자기일관성: 방금 생성한 매니페스트와 `--compare` → drift 없음, exit 0
  (drift가 effectiveAppleData 기준으로 판정됨을 함께 검증).
- 기존 테스트 중 기대값이 바뀌는 것들(harvestedManifests 형태, RN resolved
  목록 등)은 의도적으로 갱신한다.

## 마이그레이션 / 리스크

- `ScanResult.harvestedManifests` 타입 변경은 breaking이지만 미공개 버전.
- 실제 프로젝트의 Pods에는 수십 개 매니페스트가 있을 수 있음 — 리포트는
  요약 수치 위주로 유지해 소음을 억제한다.
- 잔존 Pods(락파일과 불일치) 매니페스트를 집계에 넣지 않는 규칙이
  과소 신고를 만들 가능성은 낮음: 락파일에 없는 pod은 빌드에도 없다.
