// ============================================================================
// main.js — 진입점 / 컨트롤러
// 게임 상태를 소유하고, UI 핸들러를 엔진에 연결한다 (DayManager 흐름).
// 클라우드(구글 로그인 + Firestore)는 선택 — 없으면 localStorage 오프라인.
// ============================================================================
import {
  newGame, startDay, runDay, repairFacility, saveGame, loadGame, clearSave,
  hasSave, aliveSurvivors,
} from "./engine.js";
import {
  render, bindHandlers, showReport, hideReport, showGameOver, hideGameOver,
  showScreen, toast, renderAuth, showRecords, hideRecords,
} from "./ui.js";
import {
  initCloud, onAuthChange, getCurrentUser, cloudEnabled,
  signInWithGoogle, signOutUser, saveCloud, loadCloud, clearCloudSave,
  recordRun, listRuns, getProfile,
} from "./cloud.js";

let state = null;
let profile = null;          // 클라우드 사용자 프로필(최고 기록 등)
let cloudSaveTimer = null;

function rerender() {
  if (!state) return;
  render(state);
  if (state.gameOver) { maybeRecordGameOver(); showGameOver(state); }
}

// 저장: 로컬 즉시 + 클라우드(디바운스)
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
  if (!loaded) startDay(state);   // 새 게임: 1일차 아침 정산 + 카드 지급
  showScreen("game-screen");
  rerender();
  persist(true);
}

function doRunDay() {
  if (!state || state.gameOver) return;
  const report = runDay(state);          // 탐사 + 야간 방어 + 리포트
  if (state.gameOver) maybeRecordGameOver();
  persist(true);
  showReport(state, report);
}

function nextDay() {
  hideReport();
  if (state.gameOver) { showGameOver(state); return; }
  startDay(state);                        // 다음 날 아침 정산 + 카드 지급
  persist(true);
  rerender();
}

// 게임 오버 시 1회만 기록 + 클라우드 세이브 정리
function maybeRecordGameOver() {
  if (!state || !state.gameOver || state._recorded) return;
  state._recorded = true;
  if (cloudEnabled() && getCurrentUser()) {
    recordRun({
      daysSurvived: Math.max(0, state.day - 1),
      result: "over",
      survivors: aliveSurvivors(state).length,
      day: state.day,
    }).then(() => clearCloudSave()).then(() => refreshProfile());
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
  // 로그인 상태면 클라우드 세이브 존재 가능성 → 활성화, 클릭 시 해소
  btn.disabled = !(hasSave() || (cloudEnabled() && getCurrentUser()));
}

// ---- 핸들러 (UI → 엔진) ----
bindHandlers({
  toggleTeam(svId) {
    const sv = state.survivors.find(s => s.id === svId);
    if (!sv || !sv.alive) return;
    const team = state.plan.team;
    const i = team.indexOf(svId);
    if (i >= 0) team.splice(i, 1);
    else { if (team.length >= 3) { toast("탐사팀은 최대 3명입니다."); return; } team.push(svId); }
    rerender();
  },
  assignCard(cardId, svId) {
    const sv = state.survivors.find(s => s.id === svId);
    if (!sv || !sv.alive) return;
    state.assignments[cardId] = svId;
    state._pickCard = null;
    rerender();
  },
  unassignCard(cardId) { delete state.assignments[cardId]; rerender(); },
  pickCard(cardId) { state._pickCard = state._pickCard === cardId ? null : cardId; rerender(); },
  selectRegion(regionId) { state.plan.regionId = regionId; rerender(); },
  selectDepth(depthId) { state.plan.depthId = depthId; rerender(); },
  repair(key) {
    if (repairFacility(state, key)) { persist(); rerender(); }
    else toast("자재가 부족합니다 (자재 2 필요).");
  },
  async signIn() {
    if (!cloudEnabled()) { toast("클라우드가 설정되지 않았습니다."); return; }
    try { await signInWithGoogle(); toast("로그인되었습니다."); }
    catch (e) { console.warn(e); toast("로그인이 취소되었거나 실패했습니다."); }
  },
  async signOut() {
    try { await signOutUser(); toast("로그아웃되었습니다."); } catch (e) { console.warn(e); }
  },
  openRecords() { openRecordsModal(); },
});

// ---- 인증 상태 변화 ----
async function refreshProfile() {
  profile = cloudEnabled() && getCurrentUser() ? await getProfile() : null;
  renderAuth({ enabled: cloudEnabled(), user: getCurrentUser(), profile });
}

onAuthChange(async (user) => {
  renderAuth({ enabled: cloudEnabled(), user, profile });
  updateContinueButton();
  if (user) {
    await refreshProfile();
    // 진행 중인 게임이 있으면 즉시 클라우드에 동기화
    if (state && !state.gameOver) saveCloud(state);
  }
});

// ---- 기록 모달 ----
async function openRecordsModal() {
  showRecords({ loading: true, enabled: cloudEnabled(), user: getCurrentUser() });
  if (!cloudEnabled() || !getCurrentUser()) {
    showRecords({ enabled: cloudEnabled(), user: getCurrentUser() });
    return;
  }
  const [runs, prof] = await Promise.all([listRuns(20), getProfile()]);
  profile = prof;
  showRecords({ enabled: true, user: getCurrentUser(), runs, profile: prof });
}

// ---- 버튼 ----
document.getElementById("btn-new").onclick = () => {
  if (hasSave() && !confirm("저장된 게임을 덮어쓰고 새로 시작할까요?")) return;
  clearSave();
  beginGame(null);
};
document.getElementById("btn-continue").onclick = continueGame;
document.getElementById("btn-run").onclick = doRunDay;
document.getElementById("btn-report-close").onclick = nextDay;
document.getElementById("btn-over-restart").onclick = () => {
  hideGameOver(); clearSave(); showScreen("title-screen"); updateContinueButton();
};
document.getElementById("btn-save").onclick = () => { persist(true); toast("저장되었습니다."); };
document.getElementById("btn-records").onclick = openRecordsModal;
document.getElementById("btn-records-close").onclick = hideRecords;

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
    <h4>하루 루프</h4>아침 정산 → 타로 3장 지급 → 배치(탐사팀·카드·지역·깊이) → 탐사/작업 → 밤 위협 → 리포트.
    <h4>핵심 긴장</h4>탐사에 보낸 인원만큼 밤 방어가 약해집니다. 같은 인력 풀을 공유하므로 매일 선택해야 합니다.
    <h4>생존자 합류</h4>초반에는 3명으로 시작합니다. 탐사 중 특정 이벤트(구조·합류 제안 등)로 새 생존자가 캠프에 합류해 인원이 늘어납니다.
    <h4>타로</h4>같은 카드도 생존자의 역할·특성·정신 상태에 따라 최종 효과가 달라집니다. 강한 카드(탑)는 정신이 낮은 캐릭터에게 위험합니다.
    <h4>파밍 깊이</h4>깊게 팔수록 보상이 늘지만 소음·피로·귀환 위험이 함께 오릅니다.
    <h4>클라우드</h4>구글 로그인 시 진행과 완료 기록이 클라우드에 저장되어 어느 기기에서든 이어집니다 (선택).
    <h4>실패</h4>식량 부족 → 사기 하락 → 도난/탈주, 방어 실패 → 부상/시설 파손. 누적 붕괴로 전원 사망 시 게임 오버.`;
};

// 키보드 단축키
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && document.getElementById("report-modal").classList.contains("active")) nextDay();
});

// ---- 부팅 ----
renderAuth({ enabled: false, user: null, profile: null }); // 초기: 오프라인 표시
updateContinueButton();
showScreen("title-screen");
initCloud(); // 비동기 — 성공 시 onAuthChange가 인증 UI를 갱신
