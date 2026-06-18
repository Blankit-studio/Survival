// 엔진 스모크 테스트 — 25일 자동 플레이로 크래시/이상치 검증 (Node에서 실행)
// localStorage 미사용 경로만 호출하므로 브라우저 없이 동작.
import {
  newGame, startDay, runDay, previewExpedition, aliveSurvivors, convertCardForSurvivor,
} from "../public/js/engine.js";

let failures = 0;
const assert = (cond, msg) => { if (!cond) { console.error("  ✗ " + msg); failures++; } };

function autoPlan(state) {
  const alive = aliveSurvivors(state);
  if (!alive.length) return;
  // 절반은 탐사, 절반은 방어
  const teamSize = Math.min(2, Math.max(1, Math.floor(alive.length / 2)));
  state.plan.team = alive.slice(0, teamSize).map(s => s.id);
  // 지역/깊이 무작위
  const regions = ["suburb", "market", "hospital", "checkpoint", "subway"];
  state.plan.regionId = regions[state.day % regions.length];
  const depths = ["safe", "balanced", "aggressive", "all_out"];
  state.plan.depthId = depths[state.day % depths.length];
  // 카드 3장을 alive에 순서대로 배정
  state.assignments = {};
  state.cards.forEach((c, i) => { state.assignments[c.id] = alive[i % alive.length].id; });
}

console.log("▶ 25일 자동 플레이 스모크 테스트");
const state = newGame();
startDay(state);

let lastDay = 0;
for (let i = 0; i < 25 && !state.gameOver; i++) {
  autoPlan(state);

  // 미리보기 검증
  const pv = previewExpedition(state);
  if (pv) {
    assert(pv.injuryChance >= 5 && pv.injuryChance <= 90, `day${state.day} injuryChance 범위`);
    assert(pv.returnRisk >= 0 && pv.returnRisk <= 100, `day${state.day} returnRisk 범위`);
    assert(pv.expectedLoot >= 0, `day${state.day} expectedLoot 음수 아님`);
  }

  const report = runDay(state);
  assert(report && report.night, `day${report?.day} 야간 리포트 존재`);

  // 자원 비음수 / 사기 0~100
  for (const [k, v] of Object.entries(state.resources)) {
    assert(typeof v === "number" && !Number.isNaN(v), `자원 ${k} 숫자`);
    if (k !== "morale") assert(v >= 0, `자원 ${k} 비음수 (${v})`);
  }
  assert(state.resources.morale >= 0 && state.resources.morale <= 100, "사기 0~100");

  // 시설 내구도 0~100
  for (const [k, f] of Object.entries(state.facilities)) {
    assert(f.durability >= 0 && f.durability <= 100, `시설 ${k} 내구도 범위 (${f.durability})`);
  }

  lastDay = report.day;
  if (!state.gameOver) startDay(state);
}

// 타로 변환 검증: 같은 카드, 다른 캐릭터 → 다른 결과 (GDD 8.3: 20-40% 체감차)
const tower = (await import("../public/js/data.js")).TAROT.find(c => c.id === "the_tower");
const soldier = state.survivors.find(s => s.role === "soldier");
const medic = state.survivors.find(s => s.role === "medic");
if (soldier && medic) {
  const a = convertCardForSurvivor(tower, soldier);
  const b = convertCardForSurvivor(tower, medic);
  assert(JSON.stringify(a.effects) !== JSON.stringify(b.effects), "타로 변환: 역할별 결과 상이");
  console.log(`  · The Tower / 군인 combat=${a.effects.combat} vs 의사 combat=${b.effects.combat}`);
}

console.log(`\n결과: ${lastDay}일 진행, 생존자 ${aliveSurvivors(state).length}명, gameOver=${state.gameOver}`);
if (failures === 0) { console.log("✔ 모든 어서션 통과"); process.exit(0); }
else { console.error(`✗ ${failures}개 어서션 실패`); process.exit(1); }
