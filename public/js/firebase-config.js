// ============================================================================
// firebase-config.js — Firebase 웹 클라이언트 설정
//
// ⚠️ 여기 들어가는 값(apiKey 등)은 "비밀"이 아닙니다. Firebase 웹 API 키는
//    클라이언트에 노출되는 게 정상이며, 보안은 Firestore 보안 규칙 +
//    Authentication 승인 도메인으로 강제합니다. (서비스 계정 키와는 다릅니다.)
//
// 채우는 법: Firebase 콘솔 → 프로젝트 설정 → 일반 → 내 앱 → 웹 앱 →
//            "SDK 설정 및 구성" → 구성(Config)에서 복사.
//   웹 앱이 없으면 "앱 추가 → 웹"으로 먼저 등록하세요.
// ============================================================================
export const firebaseConfig = {
  apiKey: "AIzaSyB15rtcXLy0inEpLdSOE792L5RgqrYIqxo",
  authDomain: "survival-e6d7b.firebaseapp.com",
  projectId: "survival-e6d7b",
  storageBucket: "survival-e6d7b.firebasestorage.app",
  messagingSenderId: "675462178844",
  appId: "1:675462178844:web:6fd55a7fda46f1d11017d9",
  measurementId: "G-QTQ6Y066BN",
};

// 위 값이 채워지면 자동으로 클라우드 기능(구글 로그인 + Firestore 기록)이 켜집니다.
// 채우기 전에는 게임이 오프라인(localStorage) 모드로 정상 동작합니다.
export const CLOUD_ENABLED = true;
