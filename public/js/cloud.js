// ============================================================================
// cloud.js — Firebase Auth(구글 로그인) + Firestore(클라우드 세이브/기록)
//
// 설계 원칙:
//  - Firebase SDK는 top-level이 아니라 init 시점에 "동적 import"로 불러온다.
//    → 설정/네트워크가 없으면 게임은 오프라인으로 정상 동작(테스트도 통과).
//  - 모든 외부 호출은 실패해도 게임을 막지 않도록 방어적으로 처리한다.
// ============================================================================
import { firebaseConfig, CLOUD_ENABLED } from "./firebase-config.js";

const SDK = "https://www.gstatic.com/firebasejs/11.0.2";

let fb = null;          // { app, auth, db, authMod, fsMod }
let user = null;        // 현재 로그인 사용자 (없으면 null)
let enabled = false;    // 클라우드 사용 가능 여부
let authReady = false;
const authCallbacks = [];

export function isCloudConfigured() {
  return !!(CLOUD_ENABLED && firebaseConfig &&
    firebaseConfig.apiKey && !String(firebaseConfig.apiKey).includes("REPLACE"));
}
export function cloudEnabled() { return enabled; }
export function getCurrentUser() { return user; }

export function onAuthChange(cb) {
  authCallbacks.push(cb);
  if (authReady) cb(user);
}
function emitAuth() { authReady = true; for (const cb of authCallbacks) cb(user); }

// 초기화 — 설정/네트워크 없으면 조용히 오프라인 모드
export async function initCloud() {
  if (!isCloudConfigured()) { emitAuth(); return { ok: false, reason: "not_configured" }; }
  try {
    const [appMod, authMod, fsMod] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore.js`),
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    const auth = authMod.getAuth(app);
    const db = fsMod.getFirestore(app);
    fb = { app, auth, db, authMod, fsMod };
    enabled = true;
    authMod.onAuthStateChanged(auth, u => { user = u; emitAuth(); });
    return { ok: true };
  } catch (e) {
    console.warn("[cloud] 초기화 실패 — 오프라인 모드로 진행:", e?.message || e);
    enabled = false;
    emitAuth();
    return { ok: false, reason: "init_error", error: e };
  }
}

export async function signInWithGoogle() {
  if (!enabled) throw new Error("cloud_disabled");
  const provider = new fb.authMod.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const res = await fb.authMod.signInWithPopup(fb.auth, provider);
  return res.user;
}

export async function signOutUser() {
  if (enabled) await fb.authMod.signOut(fb.auth);
}

// ---- Firestore: 클라우드 세이브 ----
export async function saveCloud(state) {
  if (!enabled || !user) return false;
  const { doc, setDoc, serverTimestamp } = fb.fsMod;
  try {
    await setDoc(doc(fb.db, "users", user.uid, "saves", "current"), {
      state, day: state.day, updatedAt: serverTimestamp(),
    });
    await setDoc(doc(fb.db, "users", user.uid), {
      displayName: user.displayName || "", email: user.email || "",
      photoURL: user.photoURL || "", updatedAt: serverTimestamp(),
    }, { merge: true });
    return true;
  } catch (e) { console.warn("[cloud] 세이브 실패:", e?.message || e); return false; }
}

export async function loadCloud() {
  if (!enabled || !user) return null;
  const { doc, getDoc } = fb.fsMod;
  try {
    const snap = await getDoc(doc(fb.db, "users", user.uid, "saves", "current"));
    return snap.exists() ? (snap.data().state || null) : null;
  } catch (e) { console.warn("[cloud] 세이브 로드 실패:", e?.message || e); return null; }
}

export async function clearCloudSave() {
  if (!enabled || !user) return;
  const { doc, deleteDoc } = fb.fsMod;
  try { await deleteDoc(doc(fb.db, "users", user.uid, "saves", "current")); }
  catch (e) { console.warn("[cloud] 세이브 삭제 실패:", e?.message || e); }
}

// ---- Firestore: 완료 기록(런 히스토리) ----
export async function recordRun(summary) {
  if (!enabled || !user) return;
  const { collection, addDoc, doc, getDoc, setDoc, serverTimestamp } = fb.fsMod;
  try {
    await addDoc(collection(fb.db, "users", user.uid, "runs"), {
      ...summary, endedAt: serverTimestamp(),
    });
    // 최고 기록 갱신 (read-then-write)
    const profRef = doc(fb.db, "users", user.uid);
    const prof = await getDoc(profRef);
    const prevBest = (prof.exists() && prof.data().bestDays) || 0;
    const prevTotal = (prof.exists() && prof.data().totalRuns) || 0;
    await setDoc(profRef, {
      bestDays: Math.max(prevBest, summary.daysSurvived || 0),
      totalRuns: prevTotal + 1,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (e) { console.warn("[cloud] 기록 저장 실패:", e?.message || e); }
}

export async function listRuns(n = 20) {
  if (!enabled || !user) return [];
  const { collection, query, orderBy, limit, getDocs } = fb.fsMod;
  try {
    const q = query(collection(fb.db, "users", user.uid, "runs"), orderBy("endedAt", "desc"), limit(n));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { console.warn("[cloud] 기록 조회 실패:", e?.message || e); return []; }
}

export async function getProfile() {
  if (!enabled || !user) return null;
  const { doc, getDoc } = fb.fsMod;
  try {
    const snap = await getDoc(doc(fb.db, "users", user.uid));
    return snap.exists() ? snap.data() : null;
  } catch (e) { return null; }
}
