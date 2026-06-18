// ============================================================================
// main.js — 진입점 / 컨트롤러
// 게임 상태를 소유하고, UI 핸들러를 엔진에 연결한다 (DayManager 흐름).
// ============================================================================
import {
  newGame, startDay, runDay, repairFacility, saveGame, loadGame, clearSave,
  hasSave, aliveSurvivors,
} from "./engine.js";
import {
  render, bindHandlers, showReport, hideReport, showGameOver, hideGameOver,
  showScreen, toast,
} from "./ui.js";

let state = null;

function rerender() {
  if (!state) return;
  render(state);
  if (state.gameOver) showGameOver(state);
}

// ---- 흐름 ----
function beginGame(loaded) {
  state = loaded || newGame();
  if (!loaded) startDay(state);   // 새 게임: 1일차 아침 정산 + 카드 지급
  showScreen("game-screen");
  rerender();
}

function doRunDay() {
  if (!state || state.gameOver) return;
  const report = runDay(state);          // 탐사 + 야간 방어 + 리포트
  saveGame(state);
  showReport(state, report);
  // 리포트 닫기 전까지 화면 갱신은 유지
}

function nextDay() {
  hideReport();
  if (state.gameOver) { showGameOver(state); return; }
  startDay(state);                        // 다음 날 아침 정산 + 카드 지급
  saveGame(state);
  rerender();
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
  unassignCard(cardId) {
    delete state.assignments[cardId];
    rerender();
  },
  pickCard(cardId) {
    state._pickCard = state._pickCard === cardId ? null : cardId;
    rerender();
  },
  selectRegion(regionId) { state.plan.regionId = regionId; rerender(); },
  selectDepth(depthId) { state.plan.depthId = depthId; rerender(); },
  repair(key) {
    if (repairFacility(state, key)) { saveGame(state); rerender(); }
    else toast("자재가 부족합니다 (자재 2 필요).");
  },
});

// ---- 버튼 ----
document.getElementById("btn-new").onclick = () => {
  if (hasSave() && !confirm("저장된 게임을 덮어쓰고 새로 시작할까요?")) return;
  clearSave();
  beginGame(null);
};
document.getElementById("btn-continue").onclick = () => {
  const loaded = loadGame();
  if (!loaded) { toast("저장된 게임이 없습니다."); return; }
  beginGame(loaded);
};
document.getElementById("btn-run").onclick = doRunDay;
document.getElementById("btn-report-close").onclick = nextDay;
document.getElementById("btn-over-restart").onclick = () => {
  hideGameOver(); clearSave(); showScreen("title-screen");
  document.getElementById("btn-continue").disabled = true;
};
document.getElementById("btn-save").onclick = () => { saveGame(state); toast("저장되었습니다."); };

// 메뉴
const menuModal = document.getElementById("menu-modal");
document.getElementById("btn-menu").onclick = () => menuModal.classList.add("active");
document.getElementById("btn-menu-close").onclick = () => menuModal.classList.remove("active");
document.getElementById("btn-menu-save").onclick = () => { saveGame(state); toast("저장되었습니다."); menuModal.classList.remove("active"); };
document.getElementById("btn-menu-quit").onclick = () => { saveGame(state); menuModal.classList.remove("active"); showScreen("title-screen"); document.getElementById("btn-continue").disabled = !hasSave(); };
document.getElementById("btn-menu-help").onclick = () => {
  const box = document.getElementById("help-box");
  box.hidden = !box.hidden;
  box.innerHTML = `
    <h4>하루 루프</h4>아침 정산 → 타로 3장 지급 → 배치(탐사팀·카드·지역·깊이) → 탐사/작업 → 밤 위협 → 리포트.
    <h4>핵심 긴장</h4>탐사에 보낸 인원만큼 밤 방어가 약해집니다. 같은 인력 풀을 공유하므로 매일 선택해야 합니다.
    <h4>타로</h4>같은 카드도 생존자의 역할·특성·정신 상태에 따라 최종 효과가 달라집니다. 강한 카드(탑)는 정신이 낮은 캐릭터에게 위험합니다.
    <h4>파밍 깊이</h4>깊게 팔수록 보상이 늘지만 소음·피로·귀환 위험이 함께 오릅니다.
    <h4>실패</h4>식량 부족 → 사기 하락 → 도난/탈주, 방어 실패 → 부상/시설 파손. 누적 붕괴로 전원 사망 시 게임 오버.`;
};

// 시작 시 이어하기 가능 여부
document.getElementById("btn-continue").disabled = !hasSave();

// 키보드 단축키
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && document.getElementById("report-modal").classList.contains("active")) nextDay();
});

showScreen("title-screen");
