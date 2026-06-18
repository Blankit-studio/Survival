# 아포칼립스 캠프 생존 (Apocalypse Camp Survival)

> 탐사로 얻고, 파밍으로 욕심내고, 쉘터 방어로 대가를 치른다.

Fallout Shelter식 직관적 캠프 운영과 This War of Mine식 생존 압박을 결합한 **생존 경영 게임**의 MVP 프로토타입입니다. 매일 지급되는 **3장의 타로 카드**를 생존자에게 배정해 탐사·방어 결과를 변형합니다.

첨부된 기획서(`Apocalypse Camp Survival - GDD`)의 MVP 범위(GDD §14)와 개발 순서(§15)를 기준으로 구현했습니다.

---

## 게임 플레이

매일 같은 하루 루프를 반복합니다 (GDD §2.1):

```
아침 정산 → 타로 3장 지급 → 배치(탐사팀·카드·지역·깊이) → 탐사/작업 → 밤 위협 → 일일 리포트
```

**핵심 긴장**: 탐사팀과 야간 방어 인력은 **같은 생존자 풀을 공유**합니다. 강한 생존자를 밖으로 보낼수록 오늘 밤 캠프가 취약해집니다. "오늘 얻을 자원"과 "오늘 밤 잃을 수 있는 것" 사이에서 매일 선택해야 합니다.

세 가지 매일의 선택:
1. **누구를 내보낼 것인가** — 탐사 성공률 ↔ 방어 안정성
2. **얼마나 위험하게 파밍할 것인가** — 안전/균형/과감/끝까지 (보상↑ = 소음·피로·귀환위험↑)
3. **카드를 누구에게 줄 것인가** — 같은 카드도 생존자의 역할·특성·정신 상태에 따라 최종 효과가 달라짐 (GDD §7.3)

조작:
- 카드를 생존자에게 **드래그**하거나, 카드를 탭한 뒤 생존자를 탭해 배정 (모바일)
- 생존자 카드의 **탐사 보내기**로 팀 편성 (최대 3명)
- 탐사 준비 패널에서 지역·파밍 깊이 선택 → **예상 보상/소음/피로/귀환 위험** 4개 게이지 실시간 확인 (GDD §5.3)
- **하루 실행 ▶** 으로 결과 판정 → 리포트 확인 → 다음 날

진행은 자동으로 브라우저 `localStorage`에 저장됩니다 (GDD §10.3).

---

## 로컬 실행

빌드 스텝이 없습니다. 정적 파일이라 어떤 정적 서버로도 열 수 있습니다.

```bash
npm run dev          # http://localhost:5173 (npx serve 사용)
# 또는
python3 -m http.server 5173 --directory public
```

> ⚠ ES 모듈을 쓰므로 `file://` 로 직접 열면 동작하지 않습니다. 반드시 로컬 서버로 여세요.

테스트:

```bash
npm test             # 엔진 25일 자동 플레이 스모크 테스트
```

---

## 배포 (Firebase Hosting · private 저장소 OK)

Firebase Hosting은 GitHub 저장소의 공개/비공개 여부와 무관하게 배포됩니다. private 저장소에서도 GitHub Actions가 **서비스 계정 시크릿**으로 인증하므로 그대로 자동 배포됩니다.

### 1) Firebase 프로젝트 준비

1. [Firebase 콘솔](https://console.firebase.google.com)에서 프로젝트 생성
2. **Hosting** 활성화
3. 로컬에서 한 번만 (선택): `npx firebase login && npx firebase init hosting` — 이미 `firebase.json`/`.firebaserc`가 있으니 덮어쓰지 마세요. `.firebaserc`의 `YOUR_FIREBASE_PROJECT_ID`만 실제 프로젝트 ID로 바꾸면 됩니다.

### 2) 수동 배포 (가장 간단)

```bash
npx firebase login
npx firebase deploy --only hosting --project <YOUR_PROJECT_ID>
```

### 3) GitHub Actions 자동 배포 (push 시 자동)

`.github/workflows/firebase-hosting.yml` 이 `main`/`master` push 또는 수동 실행 시 배포합니다. 프로젝트 ID(`survival-e6d7b`)는 워크플로우에 이미 지정되어 있으므로, 저장소에 **Secret 하나만** 등록하면 됩니다:

| 종류 | 이름 | 값 |
|------|------|----|
| **Secret** | `FIREBASE_SERVICE_ACCOUNT` | Firebase 서비스 계정 키 **JSON 전체** |

> 🔐 서비스 계정 키는 **절대 저장소에 커밋하지 마세요.** 오직 GitHub Secrets에만 보관합니다.

서비스 계정 키 발급:
- Firebase 콘솔 → 프로젝트 설정 → **서비스 계정** → "새 비공개 키 생성" → 받은 JSON 내용 전체를 위 Secret에 붙여넣기
- (또는 `firebase init hosting:github` 가 자동으로 서비스 계정과 시크릿을 만들어 줍니다)

등록 위치: 저장소 → **Settings → Secrets and variables → Actions** → Secrets 탭 / Variables 탭

PR을 열면 `firebase-preview.yml` 이 임시 미리보기 URL을 코멘트로 남깁니다.

---

## 로그인 & 클라우드 기록 (Firebase Auth + Firestore)

구글 로그인(선택) 시 **진행 상황이 클라우드에 자동 저장**되어 어느 기기에서든 이어할 수 있고, **완료된 게임 기록**(생존 일수·결과)이 남습니다. 로그인하지 않으면 기존처럼 브라우저 `localStorage`로 오프라인 플레이됩니다. 설정이 안 되어 있으면 자동으로 오프라인 모드로 동작합니다.

설정에 필요한 콘솔 작업(한 번만):

### 1) 웹 앱 등록 + 설정값 입력
Firebase 콘솔 → 프로젝트 설정 → 일반 → **내 앱 → 웹 앱 추가** → "SDK 설정 및 구성"의 **Config** 객체를 복사해 `public/js/firebase-config.js`의 `firebaseConfig`에 붙여넣습니다.

> 🔓 이 값(`apiKey` 등)은 **비밀이 아닙니다.** Firebase 웹 API 키는 클라이언트에 노출되는 게 정상이며, 보안은 아래 Firestore 규칙 + Auth 승인 도메인으로 강제됩니다. (서비스 계정 키와 다름)

### 2) 구글 로그인 활성화
콘솔 → **Authentication → Sign-in method → Google → 사용 설정** (지원 이메일 지정).
→ **승인된 도메인**에 `survival-e6d7b.web.app`, `survival-e6d7b.firebaseapp.com`, `localhost`가 포함되어 있는지 확인 (보통 자동 등록).

### 3) Firestore 생성 + 보안 규칙 배포
콘솔 → **Firestore Database → 데이터베이스 만들기**(프로덕션 모드).
보안 규칙은 저장소의 `firestore.rules`에 들어 있습니다 (각 사용자는 자기 데이터만 접근):

```bash
npx firebase deploy --only firestore:rules --project survival-e6d7b
```

### 데이터 구조

```
users/{uid}                      프로필 { displayName, email, photoURL, bestDays, totalRuns }
users/{uid}/saves/current        현재 게임 클라우드 세이브 { state, day, updatedAt }
users/{uid}/runs/{autoId}        완료 기록 { daysSurvived, result, survivors, endedAt }
```

---

## 프로젝트 구조

```
public/
  index.html          화면 골격 (타이틀 / 게임 / 리포트·메뉴 모달)
  styles.css          대시보드 중심 UI 스타일 (GDD §11)
  404.html
  js/
    data.js           콘텐츠·밸런싱 테이블 (생존자·타로12·지역5·이벤트20·위협5·시설6, GDD §16.1 데이터 기반)
    engine.js         게임 상태 + 매니저 + 판정 공식 + 저장 (GDD §4.3, §6.4, §8.2)
    ui.js             렌더링 + 드래그앤드롭 카드 배정 + 리포트 + 인증/기록 UI
    main.js           컨트롤러 (하루 루프 흐름, UI ↔ 엔진 ↔ 클라우드 연결)
    cloud.js          Firebase Auth(구글 로그인) + Firestore(세이브/기록) 래퍼
    firebase-config.js  Firebase 웹 설정 (콘솔 Config 붙여넣기)
test/
  smoke.test.js          엔진 자동 플레이 검증
  ui.integration.test.js jsdom 브라우저 흐름 검증
firebase.json .firebaserc           Firebase Hosting + Firestore 설정
firestore.rules firestore.indexes.json  Firestore 보안 규칙 / 인덱스
.github/workflows/    자동 배포 / PR 미리보기
```

### GDD 매핑

| GDD 시스템 | 구현 위치 |
|-----------|----------|
| 하루 루프 / DayManager | `engine.js` `startDay`, `runDay` |
| 타로 변환 필터 (역할·특성·정신) | `engine.js` `convertCardForSurvivor` + `data.js` `*_MULTIPLIER` |
| 탐사 판정 (탐사력/위험/보상/귀환) | `engine.js` `previewExpedition`, `runDay` |
| 파밍 깊이·소음·피로 | `data.js` `DEPTHS`, 4개 게이지 `ui.js` |
| 쉘터 방어 판정 | `engine.js` `runDay`(야간), `applyThreatOutcome` |
| 자원 경제·보관 한도 | `engine.js` `addResources`, `capResources` |
| 난이도 상승 곡선 | `data.js` `TUNING`, `forecastThreat` |
| 로컬 저장 | `engine.js` `saveGame`/`loadGame` |

---

## MVP 이후 (GDD §12, §15 Phase 5)

이번 빌드는 **싱글 생존 루프**까지입니다. GDD 권고대로 다음 단계는 초기 생존 루프를 해치지 않는 **비동기 PvP 확장**입니다:

- 비동기 약탈 (상대 캠프 AI 방어 공격)
- 분쟁 탐사 지역, 교역/동맹, 시즌 랭킹
- 서버 권한 판정으로 전환 (탐사·카드 드로우·약탈 결과 서버 확정, GDD §10.3)

밸런싱 수치는 전부 `data.js` (`TUNING`, 카드/지역/배율 테이블)에 모여 있어 스프레드시트처럼 조정할 수 있습니다 (GDD §16.2).
