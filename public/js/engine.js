// ============================================================================
// engine.js — 게임 상태 + 매니저 + 판정 공식 + 저장 (GDD 10, 16)
// 클라이언트 단일 판정(MVP). PvP 확장 시 서버 권한으로 이전 (GDD 10.3).
// ============================================================================
import {
  SURVIVORS, TAROT, REGIONS, REGION_ROLE_BONUS, DEPTHS, EXPED_EVENTS,
  THREAT_EVENTS, FACILITIES, START_RESOURCES, STORAGE_CAP, TUNING,
  ROLE_MULTIPLIER, TRAIT_MULTIPLIER, TRAIT_RISK_MULTIPLIER, CHANNEL_STAT,
} from "./data.js";

const SAVE_KEY = "acs_save_v1";
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = () => Math.random();
const pick = arr => arr[Math.floor(rand() * arr.length)];
const round1 = v => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------------
// 타로 변환 필터 (GDD 7.3, 8.2)
//   finalValue = base * roleMult * traitMult * (1 + statScaling)
//   risk 채널은 mentalState·trait 위험 배율 적용
// ---------------------------------------------------------------------------
export function convertCardForSurvivor(card, sv) {
  const out = { effects: {}, drawbacks: {}, notes: [] };
  const role = sv.role;
  const stats = sv.stats;

  const channelMult = (channel) => {
    let m = (ROLE_MULTIPLIER[channel] && ROLE_MULTIPLIER[channel][role]) || 1;
    for (const t of sv.traits) {
      const tm = TRAIT_MULTIPLIER[t];
      if (tm && tm[channel]) m *= tm[channel];
    }
    const statKey = CHANNEL_STAT[channel];
    if (statKey) m *= 1 + (stats[statKey] - 50) / 130; // statScaling ±~0.4
    return m;
  };

  for (const [ch, base] of Object.entries(card.effects || {})) {
    if (ch === "variance") { out.effects.variance = base; continue; }
    out.effects[ch] = round1(base * channelMult(ch));
  }

  // 정신 상태 위험 배율 (GDD 8.2)
  let riskMult = stats.mental >= 70 ? 0.85 : stats.mental >= 40 ? 1.0 : 1.25;
  for (const t of sv.traits) if (TRAIT_RISK_MULTIPLIER[t]) riskMult *= TRAIT_RISK_MULTIPLIER[t];

  for (const [ch, base] of Object.entries(card.drawbacks || {})) {
    let v = base;
    if (ch === "noise" || ch === "fatigue" || ch === "injuryRisk") v = base * riskMult;
    out.drawbacks[ch] = round1(v);
  }

  // The Tower 특수 규칙 (GDD 8.2)
  if (card.id === "the_tower" && stats.mental < 40) {
    out.drawbacks.injuryRisk = round1((out.drawbacks.injuryRisk || 0) + 15);
    out.notes.push("정신 불안 — 패닉 위험 급증");
  }
  return out;
}

// 카드를 한 생존자 관점의 채널 합으로 (effects-drawbacks 통합, +는 이득 −는 비용)
function cardChannelTotals(card, sv) {
  const conv = convertCardForSurvivor(card, sv);
  const t = {};
  for (const [k, v] of Object.entries(conv.effects)) t[k] = (t[k] || 0) + v;
  // loot 드로백(−)은 effects의 loot에 합산
  for (const [k, v] of Object.entries(conv.drawbacks)) {
    if (k === "loot") t.loot = (t.loot || 0) + v;
    else t[k] = (t[k] || 0) + v; // noise/fatigue/injuryRisk 누적(양수=비용)
  }
  return { totals: t, conv };
}

// ---------------------------------------------------------------------------
// 게임 상태
// ---------------------------------------------------------------------------
export function newGame() {
  return {
    day: 1,
    gameOver: false,
    victory: false,
    resources: { ...START_RESOURCES },
    survivors: SURVIVORS.map(s => ({
      ...s, stats: { ...s.stats }, traits: [...s.traits],
      condition: { injury: 0, fatigue: 10, infection: 0 },
      alive: true,
    })),
    facilities: Object.fromEntries(
      Object.entries(FACILITIES).map(([k, v]) => [k, { durability: v.durability }])
    ),
    storageCap: STORAGE_CAP,
    // 일일 임시 상태
    cards: [],            // 오늘 지급된 3장
    assignments: {},      // cardId -> survivorId
    plan: { team: [], regionId: REGIONS[0].id, depthId: "balanced" },
    lastNoise: 0,
    lastDefenders: 7,
    lastThreatForecast: null,
    log: [],              // 일일 리포트 항목
    history: [],          // 지난 리포트들
  };
}

export function aliveSurvivors(state) {
  return state.survivors.filter(s => s.alive);
}

// 아침 정산 (GDD 2.1) + 카드 지급
export function startDay(state) {
  state.log = [];
  const alive = aliveSurvivors(state);
  const pop = alive.length;

  // 소비
  const foodNeed = round1(pop * TUNING.foodPerSurvivor);
  const waterNeed = round1(pop * TUNING.waterPerSurvivor);
  let starve = false, thirst = false;
  state.resources.food = round1(state.resources.food - foodNeed);
  state.resources.water = round1(state.resources.water - waterNeed);
  if (state.resources.food < 0) { starve = true; state.resources.food = 0; }
  if (state.resources.water < 0) { thirst = true; state.resources.water = 0; }

  // 정수 시설 물 생산
  if (state.facilities.purifier.durability > 30) {
    state.resources.water = round1(state.resources.water + TUNING.purifierWater);
  }

  // 부상/감염/피로 처리 (의무실 회복)
  const infirmary = state.facilities.infirmary.durability > 30;
  for (const s of alive) {
    if (infirmary) {
      s.condition.injury = clamp(s.condition.injury - TUNING.infirmaryHeal, 0, 100);
      s.condition.infection = clamp(s.condition.infection - 8, 0, 100);
    }
    // 감염 악화
    if (s.condition.infection > 0) {
      s.condition.infection = clamp(s.condition.infection + 6, 0, 100);
      if (s.condition.infection >= 100) killSurvivor(state, s, "감염으로 사망");
    }
  }

  // 사기 압박 (GDD 13.3 moralePressure)
  const injuryCount = alive.filter(s => s.condition.injury > 40).length;
  const leaderBonus = alive.some(s => s.role === "leader") ? 10 : 0;
  let moraleDelta = -(/*base unrest*/ 2);
  if (starve) moraleDelta -= 8;
  if (thirst) moraleDelta -= 6;
  moraleDelta -= injuryCount * 3;
  moraleDelta += leaderBonus * 0.5;
  state.resources.morale = clamp(round1(state.resources.morale + moraleDelta), 0, 100);

  if (starve) state.log.push({ t: "warn", m: `식량 부족! 사기가 떨어졌다 (-${8})` });
  if (thirst) state.log.push({ t: "warn", m: `물 부족! 사기가 떨어졌다 (-${6})` });
  state.log.push({ t: "info", m: `아침 정산: 식량 -${foodNeed}, 물 -${waterNeed} (생존자 ${pop}명)` });

  // 위협 예고
  state.lastThreatForecast = forecastThreat(state);
  state.log.push({ t: "info", m: `오늘 밤 위협도 예고: ${state.lastThreatForecast.label} (위협력 ≈ ${state.lastThreatForecast.power})` });

  // 카드 3장 지급 (리롤 없음, GDD 8.3)
  state.cards = drawCards(3);
  state.assignments = {};
  state.plan = { team: [], regionId: state.plan.regionId, depthId: state.plan.depthId };

  // 사기 0 → 탈주 (누적 붕괴, GDD 2.3)
  if (state.resources.morale <= 0 && pop > 1) {
    const deserter = pick(alive);
    deserter.alive = false;
    state.log.push({ t: "danger", m: `${deserter.name}이(가) 절망 속에 캠프를 떠났다 (탈주).` });
  }

  checkGameOver(state);
  return state;
}

function drawCards(n) {
  const pool = [...TAROT];
  const out = [];
  for (let i = 0; i < n && pool.length; i++) {
    out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  }
  return out;
}

function forecastThreat(state) {
  const pop = aliveSurvivors(state).length;
  const stored = totalStored(state);
  const power = round1(
    TUNING.baseThreat + state.day * TUNING.threatPerDay +
    pop * TUNING.threatPerPop + stored * TUNING.threatPerStored
  );
  const label = power < 25 ? "낮음" : power < 45 ? "중간" : power < 65 ? "높음" : "매우 높음";
  return { power, label };
}

function totalStored(state) {
  const r = state.resources;
  return r.food + r.water + r.materials + r.medicine + r.parts + r.ammo;
}

// ---------------------------------------------------------------------------
// 탐사 미리보기 (GDD 4.3, 5.3 — 4개 게이지)
// ---------------------------------------------------------------------------
export function previewExpedition(state) {
  const team = state.plan.team.map(id => state.survivors.find(s => s.id === id)).filter(Boolean);
  const region = REGIONS.find(r => r.id === state.plan.regionId);
  const depth = DEPTHS.find(d => d.id === state.plan.depthId);
  if (!team.length) return null;

  const cardsBySv = cardsBySurvivor(state);

  // 탐사력
  let power = 0;
  for (const sv of team) {
    const ps = region.primaryStats.map(k => sv.stats[k]);
    power += (ps.reduce((a, b) => a + b, 0) / ps.length) * 0.55;
    power += (REGION_ROLE_BONUS[region.id] && REGION_ROLE_BONUS[region.id][sv.role]) || 0;
    power -= sv.condition.injury * 0.12 + sv.condition.fatigue * 0.06;
    for (const card of (cardsBySv[sv.id] || [])) {
      const { totals } = cardChannelTotals(card, sv);
      power += (totals.combat || 0) * 0.6;
    }
  }

  // 보상/소음/피로/위험 집계
  let lootMultPct = 0, noise = depth.noise, fatigue = depth.fatigue, stealth = 0, mobility = 0;
  let variance = 0, injuryRiskCard = 0;
  for (const sv of team) {
    for (const card of (cardsBySv[sv.id] || [])) {
      const { totals } = cardChannelTotals(card, sv);
      lootMultPct += (totals.loot || 0);
      stealth += (totals.stealth || 0);
      mobility += (totals.mobility || 0);
      variance += (totals.variance || 0);
      noise += (totals.noise || 0);
      fatigue += (totals.fatigue || 0);
      injuryRiskCard += (totals.injuryRisk || 0);
    }
  }
  noise = Math.max(0, noise - stealth * 0.5);

  const teamFatigue = team.reduce((a, s) => a + s.condition.fatigue, 0) / team.length;
  const riskScore = region.danger + noise * 0.4 + teamFatigue * 0.15 - stealth * 0.6;
  const injuryChance = clamp(riskScore - power * 0.4 + injuryRiskCard, 5, 85);

  const lootQuality = region.lootQuality * depth.lootMult * (1 + lootMultPct / 100);
  const expectedLoot = round1(lootQuality * (2.2 + power * 0.02));

  const carriedWeight = expectedLoot;
  const returnRisk = clamp(
    region.distance + carriedWeight * 0.2 + depth.time * 0.3 - mobility * 0.5, 0, 100
  );

  return {
    team, region, depth,
    power: round1(power),
    expectedLoot,
    noise: round1(noise),
    fatigue: round1(fatigue),
    injuryChance: round1(injuryChance),
    returnRisk: round1(returnRisk),
    variance, stealth: round1(stealth),
  };
}

function cardsBySurvivor(state) {
  const map = {};
  for (const [cardId, svId] of Object.entries(state.assignments)) {
    if (!svId) continue;
    const card = state.cards.find(c => c.id === cardId);
    if (!card) continue;
    (map[svId] ||= []).push(card);
  }
  return map;
}

// ---------------------------------------------------------------------------
// 하루 실행: 탐사 + 야간 방어 + 리포트 (GDD 2.1)
// ---------------------------------------------------------------------------
export function runDay(state) {
  const report = { day: state.day, exped: null, night: null, tarot: [], warnings: [] };
  const cardsBySv = cardsBySurvivor(state);
  const teamIds = new Set(state.plan.team);

  // ---- 탐사 실행 ----
  const preview = previewExpedition(state);
  if (preview) {
    const region = preview.region;
    const ctx = {
      lootBonus: 0, noise: 0, risk: 0, fatigue: 0, intel: 0, morale: 0,
      injuryRisk: 0, infectionRisk: 0, returnRisk: 0, time: 0, combatNeed: 0,
    };
    // 이벤트 (지역 풀 + 공통)
    const pool = EXPED_EVENTS.filter(e => e.region === region.id || e.region === "any");
    const ev = pick(pool);
    const evResult = ev.apply(ctx);

    // 최종 수치 (미리보기 + 이벤트 보정)
    const varianceRoll = 1 + (preview.variance / 100) * (rand() * 2 - 1);
    let loot = preview.expectedLoot * (1 + ctx.lootBonus / 100) * varianceRoll;
    loot = Math.max(0, round1(loot));
    const injuryChance = clamp(preview.injuryChance + ctx.risk * 0.4 + ctx.injuryRisk, 5, 90);
    const returnRisk = clamp(preview.returnRisk + ctx.returnRisk, 0, 100);

    // 보상 분배
    const gained = distributeLoot(region, loot);
    addResources(state, gained);

    // 부상/감염/피로 적용
    const injuries = [];
    for (const sv of preview.team) {
      sv.condition.fatigue = clamp(sv.condition.fatigue + preview.fatigue + ctx.fatigue, 0, 100);
      if (rand() * 100 < injuryChance) {
        const sev = 20 + Math.floor(rand() * 35);
        sv.condition.injury = clamp(sv.condition.injury + sev, 0, 100);
        injuries.push(`${sv.name} 부상(-${sev})`);
        if (sv.condition.injury >= 100) killSurvivor(state, sv, "탐사 중 사망");
      }
      if (ctx.infectionRisk > 0 && rand() * 100 < ctx.infectionRisk) {
        sv.condition.infection = clamp(sv.condition.infection + 25, 0, 100);
        injuries.push(`${sv.name} 감염!`);
      }
    }
    // 귀환 위험
    if (rand() * 100 < returnRisk) {
      const victim = pick(preview.team);
      const sev = 15 + Math.floor(rand() * 25);
      victim.condition.injury = clamp(victim.condition.injury + sev, 0, 100);
      injuries.push(`귀환 중 ${victim.name} 부상(-${sev})`);
      addResources(state, { intel: -Math.min(state.resources.intel, 1) });
    }
    state.resources.morale = clamp(state.resources.morale + ctx.morale, 0, 100);
    state.resources.intel = round1(state.resources.intel + ctx.intel);

    state.lastNoise = round1(preview.noise + ctx.noise);
    report.exped = {
      region: region.name, depth: preview.depth.name, team: preview.team.map(s => s.name),
      event: { text: ev.text, result: evResult }, gained, injuries,
      noise: state.lastNoise, injuryChance: round1(injuryChance), returnRisk: round1(returnRisk),
    };
  } else {
    state.lastNoise = 0;
    report.exped = null;
  }

  // 카드 영향 요약 (GDD 11.3 Tarot Impact)
  for (const [cardId, svId] of Object.entries(state.assignments)) {
    if (!svId) continue;
    const card = state.cards.find(c => c.id === cardId);
    const sv = state.survivors.find(s => s.id === svId);
    if (!card || !sv) continue;
    const conv = convertCardForSurvivor(card, sv);
    report.tarot.push({ card: card.name, survivor: sv.name, conv });
  }

  // ---- 야간 방어 (GDD 6.4) ----
  const defenders = aliveSurvivors(state).filter(s => !teamIds.has(s.id));
  state.lastDefenders = defenders.length;
  let guardPower = 0, defMorale = 0, defMedicine = 0, defCraft = 0;
  for (const sv of defenders) {
    guardPower += ((sv.stats.hp + sv.stats.strength) / 2) * 0.35;
    guardPower -= sv.condition.injury * 0.1;
    for (const card of (cardsBySv[sv.id] || [])) {
      const { totals } = cardChannelTotals(card, sv);
      guardPower += (totals.defense || 0) * 0.7;
      defMorale += (totals.morale || 0);
      defMedicine += (totals.medicine || 0);
      defCraft += (totals.craft || 0);
    }
    // 잔류자 피로 회복
    sv.condition.fatigue = clamp(sv.condition.fatigue - TUNING.fatigueRecover, 0, 100);
  }

  const wall = state.facilities.wall.durability;
  const power = state.facilities.power.durability;
  const workshop = state.facilities.workshop.durability;
  const trapPower = workshop > 30 ? 8 : 0;
  const turretPower = power > 40 ? 10 : 0;
  const defensePower = guardPower + wall * 0.18 + trapPower + turretPower;

  // 위협
  const threat = pickThreat(state);
  const fc = forecastThreat(state);
  const weatherPenalty = threat.id === "storm" ? 12 : 0;
  const threatPower = round1(
    fc.power + state.lastNoise * 0.35 + totalStored(state) * 0.04 + weatherPenalty
  );
  const lossSeverity = clamp(round1(threatPower - defensePower), 0, 100);

  const night = { threat: threat.name, threatDesc: threat.desc, threatPower, defensePower: round1(defensePower), lossSeverity, effects: [] };

  // 결과 적용 (GDD 6.4 분기)
  applyThreatOutcome(state, threat, lossSeverity, night);

  // 방어 카드 부수 효과
  if (defMorale) { state.resources.morale = clamp(state.resources.morale + defMorale * 0.5, 0, 100); night.effects.push(`사기 안정 +${round1(defMorale * 0.5)}`); }
  if (defMedicine) {
    const hurt = aliveSurvivors(state).filter(s => s.condition.injury > 0);
    if (hurt.length) { const h = pick(hurt); h.condition.injury = clamp(h.condition.injury - defMedicine, 0, 100); night.effects.push(`${h.name} 야간 치료 -${round1(defMedicine)}`); }
  }
  if (defCraft && state.facilities.wall.durability < 100) {
    const fix = Math.min(round1(defCraft * 0.4), 100 - state.facilities.wall.durability);
    state.facilities.wall.durability = round1(state.facilities.wall.durability + fix);
    night.effects.push(`방벽 야간 수리 +${fix}`);
  }

  report.night = night;

  // 보관 한도 적용
  capResources(state);

  // 마무리
  state.history.unshift(report);
  if (state.history.length > 30) state.history.pop();
  state.day += 1;
  checkGameOver(state);
  if (!state.gameOver && state.day > 21) { /* 생존 지속 가능 */ }
  return report;
}

function distributeLoot(region, loot) {
  const out = {};
  for (const [res, w] of Object.entries(region.lootTable)) {
    out[res] = round1(loot * w);
  }
  return out;
}

function addResources(state, delta) {
  for (const [k, v] of Object.entries(delta)) {
    if (!v) continue;
    state.resources[k] = round1((state.resources[k] || 0) + v);
    if (state.resources[k] < 0) state.resources[k] = 0;
  }
}

function capResources(state) {
  const cap = state.storageCap;
  for (const k of ["food", "water", "materials", "medicine", "parts", "ammo"]) {
    if (state.resources[k] > cap) state.resources[k] = cap;
  }
  state.resources.morale = clamp(state.resources.morale, 0, 100);
}

function pickThreat(state) {
  const s = {
    resources: state.resources,
    resourcesStored: totalStored(state),
    lastNoise: state.lastNoise,
    lastDefenders: state.lastDefenders,
    facilities: state.facilities,
  };
  const weighted = THREAT_EVENTS.map(t => ({ t, w: Math.max(0.1, t.weight(s)) }));
  const total = weighted.reduce((a, x) => a + x.w, 0);
  let r = rand() * total;
  for (const x of weighted) { if ((r -= x.w) <= 0) return x.t; }
  return weighted[0].t;
}

function applyThreatOutcome(state, threat, sev, night) {
  const damageWall = (amt) => {
    state.facilities.wall.durability = clamp(round1(state.facilities.wall.durability - amt), 0, 100);
    night.effects.push(`방벽 내구도 -${amt}`);
  };
  const loseResource = (key, amt) => {
    const real = Math.min(state.resources[key] || 0, amt);
    if (real > 0) { state.resources[key] = round1(state.resources[key] - real); night.effects.push(`${key} -${real}`); }
  };
  const injureRandom = (sevAmt, label) => {
    const alive = aliveSurvivors(state);
    if (!alive.length) return;
    const v = pick(alive);
    v.condition.injury = clamp(v.condition.injury + sevAmt, 0, 100);
    night.effects.push(`${v.name} ${label}(-${sevAmt})`);
    if (v.condition.injury >= 100) killSurvivor(state, v, "야간 방어 중 사망");
  };

  if (sev < 20) {
    night.tier = "minor";
    if (threat.id === "storm") damageWall(4);
    else night.effects.push("경미한 피해로 막아냈다.");
    return;
  }
  if (sev < 55) {
    night.tier = "moderate";
    switch (threat.id) {
      case "raider": loseResource("ammo", 2); loseResource("materials", 2); injureRandom(20, "교전 부상"); damageWall(6); break;
      case "infected": injureRandom(18, "감염자 공격"); if (rand() < 0.5) { const v = pick(aliveSurvivors(state)); if (v) { v.condition.infection = clamp(v.condition.infection + 30, 0, 100); night.effects.push(`${v.name} 감염!`); } } break;
      case "theft": loseResource("food", 3); loseResource("medicine", 1); state.resources.morale = clamp(state.resources.morale - 8, 0, 100); night.effects.push("신뢰 하락 (사기 -8)"); break;
      case "blackout": state.facilities.power.durability = clamp(state.facilities.power.durability - 12, 0, 100); night.effects.push("전력 시설 -12 (포탑 정지)"); break;
      case "storm": damageWall(10); loseResource("materials", 1); break;
    }
    return;
  }
  // major
  night.tier = "major";
  damageWall(12);
  injureRandom(35, "심각한 부상");
  if (threat.id === "raider") { loseResource("ammo", 3); loseResource("food", 3); }
  if (threat.id === "infected") { const v = pick(aliveSurvivors(state)); if (v) { v.condition.infection = clamp(v.condition.infection + 45, 0, 100); night.effects.push(`${v.name} 중증 감염!`); } }
  if (sev > 75 && aliveSurvivors(state).length > 1 && rand() < 0.4) {
    const v = pick(aliveSurvivors(state));
    killSurvivor(state, v, `${threat.name}으로 사망`);
  }
  // 시설 파손
  const fkeys = Object.keys(state.facilities);
  const fk = pick(fkeys);
  state.facilities[fk].durability = clamp(state.facilities[fk].durability - 15, 0, 100);
  night.effects.push(`${FACILITIES[fk].name} 파손 -15`);
}

function killSurvivor(state, sv, reason) {
  if (!sv.alive) return;
  sv.alive = false;
  state.resources.morale = clamp(state.resources.morale - 15, 0, 100);
  state.log.push({ t: "danger", m: `${sv.name} — ${reason} (사기 -15)` });
}

function checkGameOver(state) {
  if (aliveSurvivors(state).length === 0) {
    state.gameOver = true;
    state.victory = false;
  }
}

// ---------------------------------------------------------------------------
// 시설 수리/업그레이드 (대시보드 액션)
// ---------------------------------------------------------------------------
export function repairFacility(state, key) {
  const fac = state.facilities[key];
  if (!fac || fac.durability >= 100) return false;
  const cost = 2;
  if (state.resources.materials < cost) return false;
  state.resources.materials = round1(state.resources.materials - cost);
  fac.durability = clamp(fac.durability + 25, 0, 100);
  return true;
}

// ---------------------------------------------------------------------------
// 저장 / 불러오기 (GDD 10.3 로컬 저장)
// ---------------------------------------------------------------------------
export function saveGame(state) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); return true; }
  catch (e) { console.error("save failed", e); return false; }
}
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    // 카드/지역 참조 복원 (cards는 id만 저장될 수 있어 템플릿 재바인딩)
    if (s.cards) s.cards = s.cards.map(c => TAROT.find(t => t.id === c.id) || c);
    return s;
  } catch (e) { console.error("load failed", e); return null; }
}
export function clearSave() { localStorage.removeItem(SAVE_KEY); }
export function hasSave() { return !!localStorage.getItem(SAVE_KEY); }
