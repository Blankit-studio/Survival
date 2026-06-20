// ============================================================================
// data.js — 콘텐츠 데이터 테이블
// GDD 16.1: "카드 효과는 코드에 하드코딩하지 않고 데이터 테이블 기반으로 관리한다."
// 모든 밸런싱 수치는 이 파일에서 조정한다.
// ============================================================================

// 스탯 키 (GDD 9.1)
export const STATS = ["hp", "mental", "strength", "agility", "intelligence", "charisma"];
export const STAT_LABEL = {
  hp: "체력", mental: "정신", strength: "힘",
  agility: "민첩", intelligence: "지능", charisma: "매력",
};

// 자원 (GDD 9.2)
export const RESOURCE_LABEL = {
  food: "식량", water: "물", materials: "자재", medicine: "약품",
  parts: "부품", ammo: "탄약", morale: "사기", intel: "정보",
};

// 효과 채널: 타로/장비/역할이 행동 결과를 바꾸는 통로 (GDD 7.2 effect tag)
// combat=탐사전투력, loot=보상배율, stealth=소음/위험감소, mobility=귀환위험감소,
// defense=방어력, morale=사기, medicine=치료, craft=수리/부품효율, intel=정보,
// variance=결과편차, noise/fatigue=드로백
export const ROLE_LABEL = {
  soldier: "군인", scout: "정찰가", engineer: "기술자",
  medic: "의사", leader: "리더", gatherer: "수집가",
};

// ---------------------------------------------------------------------------
// 역할별 카드 변환 배율 (GDD 7.3) — roleMultiplier[channel][role]
// 기본 1.0. 1.0보다 크면 그 역할이 해당 채널을 더 잘 살린다.
// ---------------------------------------------------------------------------
export const ROLE_MULTIPLIER = {
  combat:   { soldier: 1.4, scout: 0.95, engineer: 0.85, medic: 0.8, leader: 1.05, gatherer: 0.9 },
  defense:  { soldier: 1.35, scout: 0.95, engineer: 1.2, medic: 0.9, leader: 1.15, gatherer: 0.95 },
  stealth:  { soldier: 0.85, scout: 1.45, engineer: 0.95, medic: 1.0, leader: 1.0, gatherer: 1.15 },
  loot:     { soldier: 0.95, scout: 1.2, engineer: 1.05, medic: 0.9, leader: 1.0, gatherer: 1.45 },
  mobility: { soldier: 1.0, scout: 1.35, engineer: 0.9, medic: 1.0, leader: 1.05, gatherer: 1.2 },
  morale:   { soldier: 0.9, scout: 0.95, engineer: 0.95, medic: 1.15, leader: 1.45, gatherer: 1.0 },
  medicine: { soldier: 0.85, scout: 0.95, engineer: 1.0, medic: 1.5, leader: 1.0, gatherer: 0.95 },
  craft:    { soldier: 0.85, scout: 0.95, engineer: 1.5, medic: 1.05, leader: 0.95, gatherer: 1.1 },
  intel:    { soldier: 0.95, scout: 1.3, engineer: 1.1, medic: 1.0, leader: 1.1, gatherer: 1.05 },
};

// 특성별 변환 배율 (작은 보정) — traitMultiplier[channel][trait]
export const TRAIT_LABEL = {
  quiet_steps: "조용한 발걸음", light_sleeper: "옅은 잠", strong_back: "튼튼한 등",
  tinkerer: "땜장이", field_medic: "야전 의무병", leader_aura: "지도자 기질",
  scavenger_eye: "수색의 눈", brave: "용감함", calm: "침착함",
  hothead: "다혈질", fragile: "허약함", night_owl: "올빼미",
};
export const TRAIT_MULTIPLIER = {
  quiet_steps:   { stealth: 1.2 },
  light_sleeper: { defense: 1.15 },
  strong_back:   { loot: 1.15, combat: 1.1 },
  tinkerer:      { craft: 1.2 },
  field_medic:   { medicine: 1.2 },
  leader_aura:   { morale: 1.2 },
  scavenger_eye: { loot: 1.2 },
  brave:         { combat: 1.12 },
  calm:          { morale: 1.1 },
  hothead:       { combat: 1.15 },
  night_owl:     { defense: 1.1, craft: 1.05 },
  fragile:       {},
};
// 위험 드로백(noise/fatigue/injuryRisk)에 적용되는 특성 배율 (낮을수록 좋음)
export const TRAIT_RISK_MULTIPLIER = {
  brave: 0.9, calm: 0.85, hothead: 1.2, fragile: 1.25, strong_back: 0.92,
};

// 채널별로 스탯 스케일링에 쓰는 스탯 (GDD 8.2 statScaling)
export const CHANNEL_STAT = {
  combat: "strength", defense: "hp", stealth: "agility", loot: "agility",
  mobility: "agility", morale: "charisma", medicine: "intelligence",
  craft: "intelligence", intel: "intelligence",
};

// ---------------------------------------------------------------------------
// 생존자 (GDD 9.1, 14.1: 5-8명)
// ---------------------------------------------------------------------------
export const SURVIVORS = [
  { id: "sv_joon", name: "준호", role: "scout",
    stats: { hp: 70, mental: 62, strength: 38, agility: 80, intelligence: 46, charisma: 40 },
    traits: ["quiet_steps", "light_sleeper"] },
  { id: "sv_mina", name: "미나", role: "medic",
    stats: { hp: 64, mental: 68, strength: 34, agility: 52, intelligence: 78, charisma: 60 },
    traits: ["field_medic", "calm"] },
  { id: "sv_tae", name: "태성", role: "soldier",
    stats: { hp: 84, mental: 58, strength: 80, agility: 48, intelligence: 40, charisma: 44 },
    traits: ["brave", "strong_back"] },
  { id: "sv_hana", name: "하나", role: "engineer",
    stats: { hp: 60, mental: 64, strength: 42, agility: 50, intelligence: 82, charisma: 48 },
    traits: ["tinkerer", "night_owl"] },
  { id: "sv_seo", name: "서연", role: "leader",
    stats: { hp: 66, mental: 74, strength: 46, agility: 54, intelligence: 64, charisma: 82 },
    traits: ["leader_aura", "calm"] },
  { id: "sv_rae", name: "래오", role: "gatherer",
    stats: { hp: 68, mental: 60, strength: 58, agility: 66, intelligence: 50, charisma: 46 },
    traits: ["scavenger_eye", "strong_back"] },
  { id: "sv_doha", name: "도하", role: "soldier",
    stats: { hp: 78, mental: 36, strength: 72, agility: 58, intelligence: 44, charisma: 38 },
    traits: ["brave", "hothead"] },
];

// 시작 멤버 3명 — 정찰/치료/전투의 균형 잡힌 초기 구성.
// 나머지는 합류 풀에 들어가 탐사 이벤트로 합류한다.
export const STARTING_SURVIVOR_IDS = ["sv_joon", "sv_mina", "sv_tae"];

// ---------------------------------------------------------------------------
// 타로 카드 12장 (GDD 7.4) — channel 값은 % 또는 수치 보정의 기준값
//   effects: 이로운 채널, drawbacks: 비용 채널(noise/fatigue/risk)
// ---------------------------------------------------------------------------
export const TAROT = [
  { id: "the_fool", name: "The Fool", korean: "광대",
    desc: "파밍 속도 증가, 새 이벤트 발견 / 소음·판단 실패",
    tags: ["loot", "risk"],
    effects: { loot: 22, intel: 6 }, drawbacks: { noise: 12, injuryRisk: 6 } },
  { id: "the_magician", name: "The Magician", korean: "마법사",
    desc: "제작·분해·수리 효율 증가 / 부품 소모",
    tags: ["craft"],
    effects: { craft: 30, defense: 8 }, drawbacks: { fatigue: 6 } },
  { id: "high_priestess", name: "The High Priestess", korean: "여사제",
    desc: "은신·정보·위험 예고 / 직접 보상 감소",
    tags: ["stealth", "intel"],
    effects: { stealth: 20, intel: 16 }, drawbacks: { loot: -10 } },
  { id: "the_empress", name: "The Empress", korean: "여제",
    desc: "식량·회복·사기 보정 / 방어 보너스 낮음",
    tags: ["morale", "medicine"],
    effects: { morale: 16, medicine: 14 }, drawbacks: {} },
  { id: "the_emperor", name: "The Emperor", korean: "황제",
    desc: "방어·통제·경비 효율 증가 / 탐사 유연성 감소",
    tags: ["defense"],
    effects: { defense: 26 }, drawbacks: { fatigue: 4 } },
  { id: "hierophant", name: "The Hierophant", korean: "교황",
    desc: "팀 안정성·갈등 감소 / 희귀 보상 확률 감소",
    tags: ["morale"],
    effects: { morale: 14, defense: 8 }, drawbacks: { loot: -8 } },
  { id: "the_chariot", name: "The Chariot", korean: "전차",
    desc: "이동·전투·귀환 안정성 증가 / 피로 증가",
    tags: ["mobility", "combat"],
    effects: { combat: 20, mobility: 16 }, drawbacks: { fatigue: 12 } },
  { id: "justice", name: "Justice", korean: "정의",
    desc: "도난·갈등·판정 안정화 / 큰 보너스 없음",
    tags: ["morale", "defense"],
    effects: { defense: 12, morale: 10 }, drawbacks: {} },
  { id: "the_hermit", name: "The Hermit", korean: "은둔자",
    desc: "소음 감소·정밀 수색 증가 / 시간 증가",
    tags: ["stealth", "loot"],
    effects: { stealth: 24, loot: 10 }, drawbacks: { fatigue: 8 } },
  { id: "wheel_of_fortune", name: "Wheel of Fortune", korean: "운명의 수레바퀴",
    desc: "보상 변동폭 증가 / 결과 편차 증가",
    tags: ["loot", "risk"],
    effects: { loot: 18, variance: 40 }, drawbacks: { injuryRisk: 8 } },
  { id: "the_tower", name: "The Tower", korean: "탑",
    desc: "강한 일시 보너스 / 부상·시설 파손 위험",
    tags: ["combat", "risk"],
    effects: { combat: 34, craft: 18 }, drawbacks: { injuryRisk: 20, noise: 8 } },
  { id: "the_sun", name: "The Sun", korean: "태양",
    desc: "사기·회복·성공률 증가 / 효과가 평균적",
    tags: ["morale", "medicine"],
    effects: { morale: 15, medicine: 12, combat: 8 }, drawbacks: {} },
];

// ---------------------------------------------------------------------------
// 탐사 지역 5종 (GDD 4.2)
//   lootTable: 자원별 가중치, primaryStats: 탐사력에 기여하는 스탯
// ---------------------------------------------------------------------------
export const REGIONS = [
  { id: "suburb", name: "폐허 주택가", danger: 18, distance: 10, lootQuality: 1.0,
    lootTable: { food: 0.4, materials: 0.35, parts: 0.25 },
    primaryStats: ["agility", "strength"],
    desc: "안전하지만 보상이 평범. 초반 식량/자재 확보용." },
  { id: "market", name: "버려진 마트", danger: 30, distance: 16, lootQuality: 1.25,
    lootTable: { food: 0.45, water: 0.35, parts: 0.2 },
    primaryStats: ["agility", "charisma"],
    desc: "식량·물의 핵심 보급처. 냉장고 소음·경쟁 탐사자 주의." },
  { id: "hospital", name: "병원", danger: 48, distance: 22, lootQuality: 1.45,
    lootTable: { medicine: 0.55, materials: 0.2, intel: 0.25 },
    primaryStats: ["intelligence", "agility"],
    desc: "약품의 주 공급원. 감염자·잠긴 수술실 위험." },
  { id: "checkpoint", name: "군사 검문소", danger: 62, distance: 26, lootQuality: 1.6,
    lootTable: { ammo: 0.45, parts: 0.35, materials: 0.2 },
    primaryStats: ["strength", "hp"],
    desc: "탄약·무기 부품. 레이더 매복·지뢰 고위험." },
  { id: "subway", name: "지하철역", danger: 70, distance: 30, lootQuality: 1.7,
    lootTable: { parts: 0.4, intel: 0.3, materials: 0.3 },
    primaryStats: ["intelligence", "hp"],
    desc: "부품·정보·연료. 정전·길 잃음·대량 감염자." },
];

// 역할별 지역 보너스 (탐사력) — 적합한 역할을 그 지역에 보내면 이득
export const REGION_ROLE_BONUS = {
  suburb:     { gatherer: 6, scout: 4 },
  market:     { gatherer: 6, scout: 5 },
  hospital:   { medic: 7, engineer: 5, scout: 3 },
  checkpoint: { soldier: 8, leader: 4 },
  subway:     { engineer: 7, soldier: 4 },
};

// 파밍 깊이 (GDD 5.2)
export const DEPTHS = [
  { id: "safe", name: "안전", lootMult: 0.75, noise: 4, fatigue: 6, time: 6,
    desc: "부상자가 있거나 방어가 약한 날" },
  { id: "balanced", name: "균형", lootMult: 1.0, noise: 10, fatigue: 12, time: 10,
    desc: "기본 선택" },
  { id: "aggressive", name: "과감", lootMult: 1.35, noise: 20, fatigue: 20, time: 16,
    desc: "자원이 급하거나 강한 카드가 있는 날" },
  { id: "all_out", name: "끝까지", lootMult: 1.7, noise: 32, fatigue: 30, time: 22,
    desc: "위기 상황의 도박성 선택" },
];

// ---------------------------------------------------------------------------
// 탐사 이벤트 20개 (GDD 4.2, 14.1) — region: 적용 지역(any=공통)
//   effect(ctx): 탐사 컨텍스트를 수정. 텍스트 결과형 (GDD 16.1)
// ---------------------------------------------------------------------------
export const EXPED_EVENTS = [
  { id: "e_locked_room", region: "suburb", text: "잠긴 방을 발견했다.",
    apply: c => { c.lootBonus += 8; c.noise += 4; return "강제 개방해 추가 자원을 챙겼다 (소음↑)."; } },
  { id: "e_trace", region: "suburb", text: "다른 생존자의 흔적.",
    apply: c => { c.intel += 4; return "흔적을 따라 정보를 얻었다 (정보 +4)."; } },
  { id: "e_holdout", region: "suburb", text: "지하실에 숨어있던 생존자를 발견했다.",
    apply: c => { c.recruit = true; return "경계하던 생존자가 합류를 결심했다."; } },
  { id: "e_stolen", region: "suburb", text: "이미 털린 집.",
    apply: c => { c.lootBonus -= 6; return "남은 게 거의 없다 (보상↓)."; } },
  { id: "e_fridge", region: "market", text: "냉장고가 요란한 소리를 냈다.",
    apply: c => { c.noise += 8; c.lootBonus += 6; return "신선한 식량을 건졌지만 소음이 커졌다."; } },
  { id: "e_rival", region: "market", text: "경쟁 탐사자와 마주쳤다.",
    apply: c => { c.risk += 8; c.intel += 3; return "대치 끝에 물러섰다 (위험↑, 정보↑)."; } },
  { id: "e_shelf", region: "market", text: "무너진 진열대.",
    apply: c => { c.fatigue += 6; c.lootBonus += 5; return "잔해를 치우고 물자를 확보했다 (피로↑)."; } },
  { id: "e_infected_h", region: "hospital", text: "병동에 감염자가 있다.",
    apply: c => { c.risk += 12; c.infectionRisk += 10; return "조심스레 우회했다 (감염 위험↑)."; } },
  { id: "e_surgery", region: "hospital", text: "잠긴 수술실.",
    apply: c => { c.lootBonus += 12; c.noise += 6; return "장비로 문을 열어 약품을 대량 확보 (소음↑)."; } },
  { id: "e_rescue", region: "hospital", text: "부상자가 구조를 요청한다.",
    apply: c => { c.fatigue += 8; c.recruit = true; return "구조에 성공해 함께 캠프로 향한다 (피로↑)."; } },
  { id: "e_ambush", region: "checkpoint", text: "레이더가 매복하고 있다!",
    apply: c => { c.risk += 16; c.combatNeed += 10; return "교전 끝에 돌파했다 (위험↑)."; } },
  { id: "e_mine", region: "checkpoint", text: "지뢰밭을 발견했다.",
    apply: c => { c.injuryRisk += 14; return "신중히 통과했다 (부상 위험↑)."; } },
  { id: "e_armory", region: "checkpoint", text: "잠긴 무기고.",
    apply: c => { c.lootBonus += 14; c.noise += 8; return "강제 개방해 탄약을 확보 (소음↑)."; } },
  { id: "e_blackout", region: "subway", text: "터널 정전.",
    apply: c => { c.risk += 10; c.time += 4; return "암흑 속을 더듬어 나아갔다 (시간↑)."; } },
  { id: "e_lost", region: "subway", text: "길을 잃었다.",
    apply: c => { c.returnRisk += 12; c.fatigue += 8; return "겨우 길을 되찾았다 (귀환 위험↑)."; } },
  { id: "e_horde", region: "subway", text: "대량 감염자 무리!",
    apply: c => { c.risk += 18; c.infectionRisk += 14; c.combatNeed += 8; return "사력을 다해 빠져나왔다."; } },
  { id: "e_cache", region: "any", text: "숨겨진 보급품 상자.",
    apply: c => { c.lootBonus += 10; return "예상치 못한 보너스 (보상↑)."; } },
  { id: "e_dog", region: "any", text: "들개 무리.",
    apply: c => { c.risk += 6; c.fatigue += 4; return "쫓아냈다 (약간의 위험)."; } },
  { id: "e_weather", region: "any", text: "갑작스런 폭우.",
    apply: c => { c.returnRisk += 8; c.noise -= 4; return "비가 소리를 가렸지만 귀환이 느려졌다."; } },
  { id: "e_survivor", region: "any", text: "겁먹은 생존자가 정보를 판다.",
    apply: c => { c.intel += 6; c.lootBonus -= 4; return "약간의 물자로 정보를 샀다."; } },
  { id: "e_wanderer", region: "any", text: "지친 방랑자가 도움을 청한다.",
    apply: c => { c.recruit = true; c.fatigue += 4; return "방랑자를 캠프로 데려가기로 했다."; } },
  { id: "e_quiet", region: "any", text: "이상하리만치 조용하다.",
    apply: c => { c.noise -= 6; c.lootBonus += 4; return "방해 없이 알뜰히 수색했다."; } },
];

// ---------------------------------------------------------------------------
// 야간 위협 이벤트 5종 (GDD 6.3)
//   weight(state): 발생 가중치, counter: 방어가 막는 채널
// ---------------------------------------------------------------------------
export const THREAT_EVENTS = [
  { id: "raider", name: "레이더 습격",
    weight: s => 1 + s.resourcesStored / 80 + (s.lastDefenders < 2 ? 2 : 0),
    desc: "자원이 많고 방어가 약하면 들이닥친다." },
  { id: "infected", name: "감염자 무리",
    weight: s => 1 + s.lastNoise / 25,
    desc: "전날 소음이 높으면 몰려온다." },
  { id: "theft", name: "내부 도난",
    weight: s => 1 + (s.resources.morale < 40 ? 2.5 : 0) + (s.resources.food <= 1 ? 1.5 : 0),
    desc: "사기가 낮고 식량이 부족하면 발생한다." },
  { id: "blackout", name: "정전",
    weight: s => 0.6 + (s.facilities.power.durability < 50 ? 2 : 0),
    desc: "전력 시설 내구도가 낮으면 발생한다." },
  { id: "storm", name: "폭풍",
    weight: s => 0.8,
    desc: "외벽을 손상시키고 다음날 탐사를 위험하게 한다." },
];

// ---------------------------------------------------------------------------
// 시설 6종 (GDD 9.3, 14.1 MVP 포함)
// ---------------------------------------------------------------------------
export const FACILITIES = {
  quarters:  { name: "숙소", desc: "생존자 수용·피로 회복", durability: 100 },
  storage:   { name: "창고", desc: "자원 보관 한도 증가", durability: 100 },
  workshop:  { name: "작업장", desc: "수리·트랩·부품 효율", durability: 100 },
  infirmary: { name: "의무실", desc: "부상·질병 회복", durability: 100 },
  purifier:  { name: "정수 시설", desc: "물 생산", durability: 100 },
  wall:      { name: "방벽", desc: "야간 침입 저항", durability: 100 },
  power:     { name: "전력", desc: "조명·포탑·통신 유지", durability: 100 },
};

// 시작 자원 (GDD 13.1: 항상 부족하지만 회복 가능)
export const START_RESOURCES = {
  food: 6, water: 6, materials: 8, medicine: 4, parts: 5, ammo: 4, morale: 60, intel: 0,
};

// 보관 한도 (창고 레벨에 따라 확장 가능)
export const STORAGE_CAP = 40;

// 밸런싱 상수 (GDD 13.3) — 한 곳에서 튜닝
export const TUNING = {
  foodPerSurvivor: 0.6,     // 1인 1일 식량 소비
  waterPerSurvivor: 0.6,    // 1인 1일 물 소비
  baseThreat: 8,
  threatPerDay: 1.8,
  threatPerPop: 0.7,
  threatPerStored: 0.05,
  fatigueRecover: 14,       // 캠프 잔류 시 회복
  fatigueRecoverExped: 0,
  infirmaryHeal: 18,        // 의무실 부상 회복/일
  farmFood: 0,              // 농장은 P1 (MVP 제외)
  purifierWater: 2,         // 정수 시설 물 생산/일
};

// ---------------------------------------------------------------------------
// 시각 디자인용 아이콘 (외부 이미지 의존 없이 이모지/심볼 사용)
// ---------------------------------------------------------------------------
export const RESOURCE_ICON = {
  food: "🍖", water: "💧", materials: "🪵", medicine: "💊",
  parts: "⚙️", ammo: "🔫", morale: "🔥", intel: "📡",
};
export const ROLE_ICON = {
  soldier: "🎖️", scout: "🧭", engineer: "🔧", medic: "⚕️", leader: "⭐", gatherer: "🎒",
};
export const STAT_ICON = {
  hp: "❤️", mental: "🧠", strength: "💪", agility: "🏃", intelligence: "🔬", charisma: "🗣️",
};
export const REGION_ICON = {
  suburb: "🏚️", market: "🏪", hospital: "🏥", checkpoint: "🪖", subway: "🚇",
};
export const FACILITY_ICON = {
  quarters: "🛏️", storage: "📦", workshop: "🔧", infirmary: "⛑️",
  purifier: "🚰", wall: "🧱", power: "⚡",
};
export const THREAT_ICON = {
  raider: "⚔️", infected: "🧟", theft: "🦹", blackout: "🔌", storm: "⛈️",
};
export const DEPTH_ICON = {
  safe: "🛡️", balanced: "⚖️", aggressive: "🔥", all_out: "💀",
};
// 타로 카드 시각 정보 (메이저 아르카나 번호 + 상징 이모지)
export const TAROT_VIS = {
  the_fool:        { numeral: "0",    symbol: "🎒" },
  the_magician:    { numeral: "I",    symbol: "🪄" },
  high_priestess:  { numeral: "II",   symbol: "🌙" },
  the_empress:     { numeral: "III",  symbol: "🌾" },
  the_emperor:     { numeral: "IV",   symbol: "🛡️" },
  hierophant:      { numeral: "V",    symbol: "📿" },
  the_chariot:     { numeral: "VII",  symbol: "🐎" },
  justice:         { numeral: "XI",   symbol: "⚖️" },
  the_hermit:      { numeral: "IX",   symbol: "🏮" },
  wheel_of_fortune:{ numeral: "X",    symbol: "🎡" },
  the_tower:       { numeral: "XVI",  symbol: "🗼" },
  the_sun:         { numeral: "XIX",  symbol: "☀️" },
};

// 브랜드 / 분위기 텍스트
export const BRAND = { title: "AFTERFALL", tagline: "생존자들의 마지막 보루" };
export const WEATHER = ["맑음", "흐림", "비", "안개", "흐림", "폭풍 전조"];

// 지역 표시용 메타 (거점 거리 km, 권장 팀 레벨) — 표시 전용
export const REGION_META = {
  suburb:     { km: 1.2, recLevel: 1, minutes: 35 },
  market:     { km: 2.0, recLevel: 1, minutes: 45 },
  hospital:   { km: 2.6, recLevel: 2, minutes: 50 },
  checkpoint: { km: 3.0, recLevel: 2, minutes: 60 },
  subway:     { km: 3.2, recLevel: 3, minutes: 70 },
};

// 사이드바 내비게이션
export const NAV = [
  { id: "shelter", label: "쉘터", icon: "🏠" },
  { id: "expedition", label: "탐사", icon: "🧭" },
  { id: "defense", label: "방어", icon: "🛡️" },
  { id: "survivors", label: "생존자", icon: "👥" },
  { id: "tarot", label: "타로", icon: "🃏" },
  { id: "records", label: "기록", icon: "📜" },
];

