// ============================================================================
// main.js — AFTERFALL 컨트롤러 (멀티 스크린 내비 + 하루 루프 + 클라우드)
// ============================================================================
import {
  newGame, startDay, runDay, repairFacility, saveGame, loadGame, clearSave,
  hasSave, aliveSurvivors,
} from "./engine.js";
import {
  render, bindHandlers, showReport, hideReport, showGameOver, hideGameOver,
  showScreen, toast, renderAuth, setRecordsState,
} from "./ui.js";
import {
  initCloud, onAuthChange, getCurrentUser, cloudEnabled,
  signInWithGoogle, signOutUser, saveCloud, loadCloud, clearCloudSave,
  recordRun, listRuns, getProfile,
} from "./cloud.js";

let state = null;
let profile = null;
let cloudSaveTimer = null;

function rerender() {
  if (!state) return;
  render(state);
  if (state.gameOver) { maybeRecordGameOver(); showGameOver(state); }
}

function persist(immediate) {
  if (!state) return;
  saveGame(state);
  if (cloudEnabled() && getCurrentUser()) {
    clearTimeout(cloudSaveTimer);
    if (immediate) saveCloud(state);
    else cloudSaveTimer = setTimeout(() => saveCloud(state), 1500);
  }
}

// ---- 흐름 ----
function beginGame(loaded) {
  state = loaded || newGame();
  if (!loaded) startDay(state);
  state._view = "shelter";
  showScreen("app");
  rerender();
  persist(true);
}

function doEndDay() {
  if (!state || state.gameOver) return;
  const report = runDay(state);
  if (state.gameOver) maybeRecordGameOver();
  persist(true);
  showReport(state, report);
}

function nextDay() {
  hideReport();
  if (state.gameOver) { showGameOver(state); return; }
  startDay(state);
  state._view = "shelter";
  persist(true);
  rerender();
}

function maybeRecordGameOver() {
  if (!state || !state.gameOver || state._recorded) return;
  state._recorded = true;
  if (cloudEnabled() && getCurrentUser()) {
    recordRun({
      daysSurvived: Math.max(0, state.day - 1), result: "over",
      survivors: aliveSurvivors(state).length, day: state.day,
    }).then(() => clearCloudSave()).then(refreshProfile);
  }
}

async function continueGame() {
  let loaded = null;
  if (cloudEnabled() && getCurrentUser()) loaded = await loadCloud();
  if (!loaded) loaded = loadGame();
  if (!loaded) { toast("저장된 게임이 없습니다."); return; }
  beginGame(loaded);
}

function updateContinueButton() {
  const btn = document.getElementById("btn-continue");
  btn.disabled = !(hasSave() || (cloudEnabled() && getCurrentUser()));
}

// ---- 핸들러 ----
bindHandlers({
  navTo(view) {
    if (!state) return;
    state._view = view;
    rerender();
    if (view === "records") refreshRecords();
  },
  toggleTeam(svId) {
    const sv = state.survivors.find(s => s.id === svId);
    if (!sv || !sv.alive) return;
    const team = state.plan.team; const i = team.indexOf(svId);
    if (i >= 0) team.splice(i, 1);
    else { if (team.length >= 3) { toast("탐사팀은 최대 3명입니다."); return; } team.push(svId); }
    rerender();
  },
  assignCard(cardId, svId) {
    const sv = state.survivors.find(s => s.id === svId);
    if (!sv || !sv.alive) return;
    state.assignments[cardId] = svId; state._pickCard = null; rerender();
  },
  unassignCard(cardId) { delete state.assignments[cardId]; rerender(); },
  pickCard(cardId) { state._pickCard = state._pickCard === cardId ? null : cardId; rerender(); },
  selectRegion(regionId) { state.plan.regionId = regionId; rerender(); },
  selectDepth(depthId) { state.plan.depthId = depthId; rerender(); },
  repair(key) {
    if (repairFacility(state, key)) { persist(); rerender(); }
    else toast("자재가 부족합니다 (자재 2 필요).");
  },
  repairAll() {
    let any = false;
    for (const key of Object.keys(state.facilities)) {
      while (state.facilities[key].durability < 100 && state.resources.materials >= 2) {
        if (repairFacility(state, key)) any = true; else break;
      }
    }
    if (any) { persist(); rerender(); toast("수리를 진행했습니다."); }
    else toast("수리할 곳이 없거나 자재가 부족합니다.");
  },
  endDay() { doEndDay(); },
  async signIn() {
    if (!cloudEnabled()) { toast("클라우드가 설정되지 않았습니다."); return; }
    try { await signInWithGoogle(); toast("로그인되었습니다."); }
    catch (e) { console.warn(e); toast("로그인이 취소되었거나 실패했습니다."); }
  },
  async signOut() { try { await signOutUser(); toast("로그아웃되었습니다."); } catch (e) { console.warn(e); } },
});

// ---- 인증 ----
async function refreshProfile() {
  profile = cloudEnabled() && getCurrentUser() ? await getProfile() : null;
  renderAuth({ enabled: cloudEnabled(), user: getCurrentUser(), profile });
}
async function refreshRecords() {
  setRecordsState({ enabled: cloudEnabled(), user: getCurrentUser(), loading: true });
  if (state) render(state);
  if (!cloudEnabled() || !getCurrentUser()) { setRecordsState({ enabled: cloudEnabled(), user: getCurrentUser(), loading: false }); if (state) render(state); return; }
  const [runs, prof] = await Promise.all([listRuns(20), getProfile()]);
  profile = prof;
  setRecordsState({ enabled: true, user: getCurrentUser(), runs, profile: prof, loading: false });
  if (state) render(state);
}

onAuthChange(async (user) => {
  renderAuth({ enabled: cloudEnabled(), user, profile });
  setRecordsState({ enabled: cloudEnabled(), user, runs: [], profile });
  updateContinueButton();
  if (user) { await refreshProfile(); if (state && !state.gameOver) saveCloud(state); if (state && state._view === "records") refreshRecords(); }
});

// ---- 버튼 ----
document.getElementById("btn-new").onclick = () => {
  if (hasSave() && !confirm("저장된 게임을 덮어쓰고 새로 시작할까요?")) return;
  clearSave(); beginGame(null);
};
document.getElementById("btn-continue").onclick = continueGame;
document.getElementById("btn-report-close").onclick = nextDay;
document.getElementById("btn-over-restart").onclick = () => { hideGameOver(); clearSave(); showScreen("title-screen"); updateContinueButton(); };
document.getElementById("btn-save").onclick = () => { persist(true); toast("저장되었습니다."); };
const recClose = document.getElementById("btn-records-close"); if (recClose) recClose.onclick = () => document.getElementById("records-modal").classList.remove("active");

// 메뉴
const menuModal = document.getElementById("menu-modal");
document.getElementById("btn-menu").onclick = () => menuModal.classList.add("active");
document.getElementById("btn-menu-close").onclick = () => menuModal.classList.remove("active");
document.getElementById("btn-menu-save").onclick = () => { persist(true); toast("저장되었습니다."); menuModal.classList.remove("active"); };
document.getElementById("btn-menu-quit").onclick = () => { persist(true); menuModal.classList.remove("active"); showScreen("title-screen"); updateContinueButton(); };
document.getElementById("btn-menu-help").onclick = () => {
  const box = document.getElementById("help-box");
  box.hidden = !box.hidden;
  box.innerHTML = `
    <h4>하루 루프</h4>아침 정산 → 타로 3장 지급 → 배치(탐사·방어·카드) → 하루 종료 시 탐사/야간 방어 판정 → 보고.
    <h4>핵심 긴장</h4>탐사에 보낸 인원만큼 밤 방어가 약해집니다. 같은 인력 풀을 공유하므로 매일 선택해야 합니다.
    <h4>생존자 합류</h4>초반 3명으로 시작, 탐사 이벤트(구조·합류)로 인원이 늘어납니다.
    <h4>화면</h4>쉘터(개요) · 탐사(지역/팀/카드) · 방어(야간 경계) · 생존자 · 타로 · 기록.
    <h4>타로</h4>같은 카드도 생존자의 역할·특성·정신에 따라 최종 효과가 달라집니다.
    <h4>클라우드</h4>구글 로그인 시 진행과 기록이 클라우드에 저장됩니다 (선택).`;
};

document.addEventListener("keydown", e => {
  if (e.key === "Enter" && document.getElementById("report-modal").classList.contains("active")) nextDay();
});

// ---- 부팅 ----
renderAuth({ enabled: false, user: null, profile: null });
setRecordsState({ enabled: false, user: null });
updateContinueButton();
showScreen("title-screen");
initCloud();
