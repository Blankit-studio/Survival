// ============================================================================
// ui.js — AFTERFALL UI: 상단바 + 사이드바 + 멀티 스크린 렌더링
// 상태(state)를 받아 그리고, 사용자 입력은 handlers 콜백으로 전달한다.
// ============================================================================
import {
  STAT_LABEL, RESOURCE_LABEL, ROLE_LABEL, TRAIT_LABEL, REGIONS, DEPTHS, FACILITIES,
  RESOURCE_ICON, ROLE_ICON, STAT_ICON, REGION_ICON, FACILITY_ICON,
  THREAT_ICON, DEPTH_ICON, TAROT_VIS, NAV, WEATHER, REGION_META,
} from "./data.js";
import { previewExpedition, aliveSurvivors, convertCardForSurvivor, remainingRecruits } from "./engine.js";

const $ = sel => document.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = v => Math.round(v * 10) / 10;

let H = {};
let lastAuth = { enabled: false, user: null, profile: null };
export function bindHandlers(handlers) { H = handlers; }

const TOPBAR_RES = ["food", "water", "materials", "medicine", "ammo", "power"];
const LOW_RES = { food: 2, water: 2, medicine: 1, materials: 2 };

function avatarHue(id) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360; return h; }
function barCls(v) { return v > 60 ? "hi" : v > 30 ? "mid" : "lo"; }
function skulls(n, max = 5) {
  let s = ""; for (let i = 0; i < max; i++) s += `<span class="${i < n ? "on" : "off"}">☠</span>`; return s;
}

// ---------------------------------------------------------------------------
export function render(state) {
  if (!state._view) state._view = "shelter";
  renderTopbar(state);
  renderNav(state);
  renderAuth(lastAuth);
  renderView(state);
}

// ===================== 상단바 =====================
function renderTopbar(state) {
  $("#day-num").textContent = `DAY ${state.day}`;
  const weather = WEATHER[(state.day - 1) % WEATHER.length];
  $("#day-sub").textContent = `18:00 · ${weather}`;

  const bar = $("#resource-bar"); bar.innerHTML = "";
  for (const k of TOPBAR_RES) {
    let val, delta = null;
    if (k === "power") { val = Math.round(state.facilities.power.durability) + "%"; }
    else { val = state.resources[k] ?? 0; delta = resDelta(state, k); }
    const low = LOW_RES[k] != null && (state.resources[k] ?? 99) <= LOW_RES[k];
    const chip = el("div", "res-chip" + (low ? " low" : ""));
    let deltaHtml = "";
    if (delta !== null && delta !== 0) {
      const cls = delta > 0 ? "pos" : "neg";
      deltaHtml = `<span class="res-delta ${cls}">${delta > 0 ? "+" : ""}${delta}/일</span>`;
    }
    chip.innerHTML = `<span class="res-ico">${RESOURCE_ICON[k] || "⚡"}</span>
      <span class="res-meta"><span class="res-lbl">${RESOURCE_LABEL[k] || "전력"}</span>
      <span class="res-val">${val}</span></span>${deltaHtml}`;
    bar.appendChild(chip);
  }
}
function resDelta(state, key) {
  const pop = aliveSurvivors(state).length;
  if (key === "food") return -round1(pop * 0.6);
  if (key === "water") return round1(-pop * 0.6 + (state.facilities.purifier.durability > 30 ? 2 : 0));
  const g = state.history?.[0]?.exped?.gained?.[key];
  return g ? round1(g) : 0;
}

// ===================== 사이드바 =====================
function renderNav(state) {
  const nav = $("#nav"); nav.innerHTML = "";
  for (const item of NAV) {
    const b = el("button", "nav-item" + (state._view === item.id ? " active" : ""));
    b.innerHTML = `<span class="nav-ico">${item.icon}</span><span class="nav-lbl">${item.label}</span>`;
    b.onclick = () => H.navTo(item.id);
    nav.appendChild(b);
  }
}

// ===================== 화면 라우팅 =====================
function renderView(state) {
  const root = $("#view-root"); root.innerHTML = "";
  const v = state._view;
  if (v === "shelter") root.appendChild(viewShelter(state));
  else if (v === "expedition") root.appendChild(viewExpedition(state));
  else if (v === "defense") root.appendChild(viewDefense(state));
  else if (v === "survivors") root.appendChild(viewSurvivors(state));
  else if (v === "tarot") root.appendChild(viewTarot(state));
  else if (v === "records") root.appendChild(viewRecords(state));
}

function viewHead(title, sub) {
  return `<div class="view-head"><span class="view-title">${title}</span><span class="view-sub">${sub || ""}</span></div>`;
}
function panel(title, subRight, bodyNode, extraCls) {
  const p = el("div", "panel" + (extraCls ? " " + extraCls : ""));
  p.innerHTML = `<h3>${title}${subRight ? `<span class="sub">${subRight}</span>` : ""}</h3>`;
  if (bodyNode) p.appendChild(bodyNode);
  return p;
}

// ===================== 공통 컴포넌트 =====================
function avatarHtml(sv) {
  const hue = avatarHue(sv.id);
  return `<span class="sv-avatar" style="background:hsl(${hue} 38% 30%);border-color:hsl(${hue} 48% 46%)">
    ${sv.name.charAt(0)}<span class="sv-rolebadge">${ROLE_ICON[sv.role] || ""}</span></span>`;
}

// 생존자 카드 (compact: 바 3종 / detail: 스탯·카드·행동)
function survivorCard(state, sv, opts = {}) {
  const card = el("div", "sv-card" + (sv.alive ? "" : " dead") +
    (state.plan.team.includes(sv.id) ? " on-team" : ""));
  card.dataset.svId = sv.id;
  const traits = sv.traits.map(t => TRAIT_LABEL[t] || t).join(", ");
  const health = Math.round(clamp(100 - sv.condition.injury, 0, 100));
  const fatigue = Math.round(sv.condition.fatigue);
  const mental = sv.stats.mental;
  const assigned = Object.entries(state.assignments).filter(([, id]) => id === sv.id).map(([cid]) => cid);

  let html = `<div class="sv-head">${avatarHtml(sv)}
    <span class="sv-id"><span class="sv-name">${sv.name}</span><span class="sv-role">${ROLE_LABEL[sv.role]}</span></span>
    <span class="sv-traits">${traits}</span></div>
    <div class="sv-bars">
      ${barRow("건강", health, barCls(health))}
      ${barRow("정신", mental, barCls(mental))}
      ${barRow("피로", fatigue, fatigue > 60 ? "lo" : fatigue > 35 ? "mid" : "hi")}
    </div>`;
  if (sv.condition.infection > 0) html += `<div class="sv-assign-tag" style="color:var(--red-2)">⚠ 감염 ${Math.round(sv.condition.infection)}</div>`;

  if (opts.detail) {
    html += `<div class="sv-stats">${["strength", "agility", "intelligence", "hp", "mental", "charisma"]
      .map(k => `<span title="${STAT_LABEL[k]}">${STAT_ICON[k]} <b>${sv.stats[k]}</b></span>`).join("")}</div>`;
  }
  if (assigned.length) {
    html += `<div class="sv-cards">${assigned.map(cid => {
      const c = state.cards.find(x => x.id === cid);
      return c ? `<span class="mini-card" data-card="${cid}" title="배정 취소">${c.name} ✕</span>` : "";
    }).join("")}</div>`;
  }
  if (opts.team) {
    const on = state.plan.team.includes(sv.id);
    html += `<div class="sv-actions">
      <button class="sv-btn team-btn ${on ? "active" : ""}">${on ? "탐사팀 ✓" : "탐사 보내기"}</button>
      <span class="sv-assign-tag">${on ? "" : "캠프 방어"}</span></div>`;
  }
  card.innerHTML = html;

  if (!sv.alive) return card;
  // 카드 배정 취소
  card.querySelectorAll(".mini-card").forEach(mc => mc.onclick = e => { e.stopPropagation(); H.unassignCard(mc.dataset.card); });
  // 팀 토글
  const tb = card.querySelector(".team-btn"); if (tb) tb.onclick = () => H.toggleTeam(sv.id);
  // 드롭존 + 픽 배정
  if (opts.assignable) {
    card.addEventListener("dragover", e => { e.preventDefault(); card.classList.add("dropzone"); });
    card.addEventListener("dragleave", () => card.classList.remove("dropzone"));
    card.addEventListener("drop", e => { e.preventDefault(); card.classList.remove("dropzone"); const cid = e.dataTransfer.getData("text/card"); if (cid) H.assignCard(cid, sv.id); });
    card.addEventListener("click", e => { if (e.target.closest("button,.mini-card")) return; if (state._pickCard) H.assignCard(state._pickCard, sv.id); });
  }
  return card;
}
function barRow(name, val, cls) {
  return `<div class="sv-bar-row"><span class="lbl">${name}</span>
    <div class="bar thin"><i class="${cls}" style="width:${clamp(val,0,100)}%"></i></div>
    <span class="val">${val}%</span></div>`;
}

// 타로 카드 엘리먼트
function tarotCardEl(state, card, opts = {}) {
  const vis = TAROT_VIS[card.id] || { numeral: "", symbol: "✦" };
  const assignedTo = state.assignments[card.id];
  const sv = assignedTo ? state.survivors.find(s => s.id === assignedTo) : null;
  const c = el("div", "tcard" + (sv ? " assigned" : "") + (state._pickCard === card.id ? " picked" : ""));
  c.draggable = true; c.dataset.cardId = card.id;
  c.innerHTML = `<div class="tc-frame">
      <div class="tc-top"><span class="tc-num">${vis.numeral}</span><span class="tc-num">${vis.numeral}</span></div>
      <div class="tc-symbol">${vis.symbol}</div>
      <div class="tc-name">${card.name}</div>
      <div class="tc-kr">${card.korean}</div>
      <div class="tc-tags">${card.tags.map(t => `<span class="tc-tag">${t}</span>`).join("")}</div>
      ${sv ? `<div class="tc-assignee">▸ ${sv.name}</div>` : `<div class="tc-desc">${card.desc}</div>`}
    </div>`;
  c.addEventListener("dragstart", e => { e.dataTransfer.setData("text/card", card.id); c.classList.add("dragging"); });
  c.addEventListener("dragend", () => c.classList.remove("dragging"));
  c.addEventListener("click", () => H.pickCard(card.id));
  return c;
}

function gaugesNode(preview) {
  const wrap = el("div");
  if (!preview) { wrap.appendChild(el("div", "exped-empty", "탐사팀에 생존자를 1명 이상 배치하세요.")); return wrap; }
  const g = el("div", "gauges");
  g.innerHTML = [
    gauge("g-loot", "예상 보상", preview.expectedLoot, Math.max(16, preview.expectedLoot), preview.expectedLoot),
    gauge("g-noise", "소음", preview.noise, 60),
    gauge("g-fatigue", "피로 누적", preview.fatigue, 60),
    gauge("g-return", "귀환 위험", preview.returnRisk, 100, preview.returnRisk + "%"),
    gauge("g-injury", "부상 확률", preview.injuryChance, 100, preview.injuryChance + "%"),
  ].join("");
  wrap.appendChild(g);
  wrap.appendChild(el("div", "exped-power",
    `탐사력 <b>${preview.power}</b> · 은신 ${preview.stealth} · 팀 ${preview.team.map(s => s.name).join(", ")}`));
  return wrap;
}
function gauge(cls, label, value, max, valLabel) {
  const pct = clamp((value / max) * 100, 0, 100);
  return `<div class="gauge-row ${cls}"><div class="gauge-top"><span>${label}</span><b>${valLabel != null ? valLabel : value}</b></div>
    <div class="gauge-track"><i style="width:${pct}%"></i></div></div>`;
}

// 시설/방어 상태 행
function facilityRows(state, interactive) {
  const wrap = el("div");
  for (const [k, fac] of Object.entries(state.facilities)) {
    const d = Math.round(fac.durability);
    const row = el("div", "fac-row");
    row.innerHTML = `<span class="fac-ico">${FACILITY_ICON[k] || "▪"}</span>
      <span class="fac-name">${FACILITIES[k].name}</span>
      <div class="bar"><i class="${barCls(d)}" style="width:${d}%"></i></div>
      <span class="fac-val">${d}%</span>`;
    if (interactive) {
      const btn = el("button", "fac-fix", "수리");
      btn.disabled = d >= 100 || state.resources.materials < 2;
      btn.onclick = () => H.repair(k);
      row.appendChild(btn);
    }
    wrap.appendChild(row);
  }
  return wrap;
}

// 위협 예고 (해골)
function forecastNode(state) {
  const fc = state.lastThreatForecast || { label: "중간", power: 20 };
  const n = fc.power < 25 ? 1 : fc.power < 40 ? 2 : fc.power < 55 ? 3 : fc.power < 70 ? 4 : 5;
  const lvlClass = fc.label.startsWith("매우") ? "매우" : fc.label;
  const w = el("div", "threat-block");
  w.innerHTML = `<div class="threat-level ${lvlClass}">${fc.label}</div>
    <div class="skulls">${skulls(n)}</div>
    <div class="action-note" style="margin-top:6px">위협력 ≈ ${fc.power} · 탐사 인원이 많을수록 야간 방어가 약해집니다.</div>`;
  return w;
}

// ===================== 쉘터 화면 =====================
function viewShelter(state) {
  const v = el("div", "view");
  const pop = aliveSurvivors(state).length;
  v.innerHTML = viewHead("쉘터 개요", `${WEATHER[(state.day - 1) % WEATHER.length]} · 생존자 ${pop}명`);
  const grid = el("div", "view-grid cols-3");

  // 시설 개요
  grid.appendChild(panel("쉘터 시설", "자재 2 → 수리 +25", facilityRows(state, true)));

  // 생존자 상태 (compact)
  const svBox = el("div", "sv-list");
  for (const sv of aliveSurvivors(state)) svBox.appendChild(survivorCard(state, sv));
  const svPanel = panel("생존자 상태", `${pop}명 / 7`, svBox);
  grid.appendChild(svPanel);

  // 우측: 빠른 작업 + 방어 현황
  const right = el("div"); right.style.display = "flex"; right.style.flexDirection = "column"; right.style.gap = "14px";
  // 빠른 작업 배정
  const qa = el("div");
  const teamN = state.plan.team.length, defN = pop - teamN;
  const jobs = [
    { ico: "🧭", name: "탐사", desc: "외부 지역 탐사 / 파밍", count: teamN, go: "expedition" },
    { ico: "🛡️", name: "경계", desc: "쉘터 방어 / 야간 대비", count: defN, go: "defense" },
    { ico: "🃏", name: "타로 배정", desc: "오늘의 카드 배정", count: Object.values(state.assignments).filter(Boolean).length + "/3", go: "tarot" },
  ];
  for (const j of jobs) {
    const r = el("div", "qa-row");
    r.innerHTML = `<span class="qa-ico">${j.ico}</span><div class="qa-body"><div class="qa-name">${j.name}</div><div class="qa-desc">${j.desc}</div></div><span class="qa-count">${j.count}</span>`;
    r.style.cursor = "pointer"; r.onclick = () => H.navTo(j.go);
    qa.appendChild(r);
  }
  right.appendChild(panel("빠른 작업 배정", "", qa));
  right.appendChild(panel("오늘 밤 위협 예고", "", forecastNode(state)));
  grid.appendChild(right);

  v.appendChild(grid);

  // 오늘의 카드 + 일일 로그
  const grid2 = el("div", "view-grid cols-2a");
  const cardsBox = el("div", "tarot-cards");
  for (const c of state.cards) cardsBox.appendChild(tarotCardEl(state, c));
  const cardPanel = panel("오늘의 카드", "타로 화면에서 배정", cardsBox);
  cardPanel.appendChild(el("div", "tarot-help", "카드를 탭한 뒤 생존자에게 배정 — '타로' 화면에서 자세히."));
  grid2.appendChild(cardPanel);
  grid2.appendChild(panel("일일 로그", "", logNode(state.log)));
  v.appendChild(grid2);
  return v;
}

function logNode(log) {
  const w = el("div", "log-list");
  if (!log || !log.length) { w.appendChild(el("div", "rec-empty", "기록 없음")); return w; }
  for (const l of log) {
    const cls = l.t === "warn" ? "warn" : l.t === "danger" ? "danger" : l.t === "good" ? "good" : "";
    const ico = l.t === "danger" ? "💀" : l.t === "warn" ? "⚠️" : "▪";
    w.appendChild(el("div", "log-row " + cls, `<span class="log-ico">${ico}</span><span>${l.m}</span>`));
  }
  return w;
}

// ===================== 탐사 화면 =====================
function viewExpedition(state) {
  const v = el("div", "view");
  v.innerHTML = viewHead("탐사 계획", "지역 · 팀 · 깊이 · 카드");
  const grid = el("div", "view-grid cols-2");

  // 좌: 지역 지도 + 지역 정보 + 정찰
  const left = el("div"); left.style.display = "flex"; left.style.flexDirection = "column"; left.style.gap = "14px";
  const rg = el("div", "region-grid");
  for (const r of REGIONS) {
    const dz = r.danger < 35 ? "dz-low" : r.danger < 60 ? "dz-mid" : "dz-hi";
    const dl = r.danger < 35 ? "낮음" : r.danger < 60 ? "중간" : "높음";
    const meta = REGION_META[r.id] || { km: 1, minutes: 40, recLevel: 1 };
    const card = el("div", "region-card" + (state.plan.regionId === r.id ? " sel" : ""));
    card.innerHTML = `<div class="region-photo">${REGION_ICON[r.id] || "📍"}</div>
      <div class="region-body">
        <div class="region-name">${r.name}<span class="region-badge ${dz}">${dl}</span></div>
        <div class="region-meta">⏱ ${meta.minutes}분 · ${meta.km}km · 권장 Lv.${meta.recLevel}</div>
        <div class="region-desc">${r.desc}</div>
      </div>`;
    card.onclick = () => H.selectRegion(r.id);
    rg.appendChild(card);
  }
  left.appendChild(panel("지역 지도", "거점 기준", rg));

  // 정찰 정보
  const region = REGIONS.find(r => r.id === state.plan.regionId);
  const sc = el("div", "scout-grid");
  const dl = v => v < 35 ? "낮음" : v < 60 ? "중간" : "높음";
  const scoutItems = [
    { ico: "🦹", name: "약탈자", val: dl(region.danger) },
    { ico: "🧟", name: "감염자", val: dl(region.danger - 8) },
    { ico: "⚠️", name: "함정", val: dl(region.danger - 12) },
    { ico: "🌧️", name: "날씨", val: WEATHER[(state.day - 1) % WEATHER.length] },
    { ico: "🌙", name: "어둠", val: "높음" },
  ];
  for (const s of scoutItems) sc.appendChild(el("div", "scout-item", `<div class="si-ico">${s.ico}</div><div class="si-name">${s.name}</div><div class="si-val">${s.val}</div>`));
  left.appendChild(panel("정찰 정보", region.name, sc));
  grid.appendChild(left);

  // 우: 팀 + 장비 + 카드 + 게이지 + CTA
  const right = el("div"); right.style.display = "flex"; right.style.flexDirection = "column"; right.style.gap = "14px";
  const teamBox = el("div", "sv-list");
  for (const sv of aliveSurvivors(state)) teamBox.appendChild(survivorCard(state, sv, { team: true, assignable: true }));
  right.appendChild(panel("팀 편성", `${state.plan.team.length}/3`, teamBox));

  // 깊이
  const depthRow = el("div", "depth-row");
  for (const d of DEPTHS) {
    const o = el("div", "depth-opt" + (state.plan.depthId === d.id ? " sel" : ""));
    o.innerHTML = `<span class="d-ico">${DEPTH_ICON[d.id] || ""}</span>${d.name}<small>×${d.lootMult}</small>`;
    o.title = d.desc; o.onclick = () => H.selectDepth(d.id);
    depthRow.appendChild(o);
  }
  right.appendChild(panel("파밍 성향", "", depthRow));

  // 카드
  const cardsBox = el("div", "tarot-cards");
  for (const c of state.cards) cardsBox.appendChild(tarotCardEl(state, c));
  const cp = panel("카드 배정", `${Object.values(state.assignments).filter(Boolean).length}/3`, cardsBox);
  cp.appendChild(el("div", "tarot-help", "카드를 탭 후 위 생존자를 탭하거나 드래그하여 배정."));
  right.appendChild(cp);

  // 게이지
  right.appendChild(panel("예측 (4개 게이지)", "", gaugesNode(previewExpedition(state))));

  // CTA
  const cta = el("div", "cta-stack");
  const startBtn = el("button", "cta-main cta-olive");
  startBtn.innerHTML = `탐사 시작 ▶<span class="cta-sub">배치를 확정하고 방어 단계로</span>`;
  startBtn.onclick = () => H.navTo("defense");
  cta.appendChild(startBtn);
  cta.appendChild(el("div", "action-note", "자원 소모: 출발 시 식량/물 일부 · 귀환은 다음 날 정산됩니다."));
  right.appendChild(panel("작전 명령", "", cta));
  grid.appendChild(right);

  v.appendChild(grid);
  return v;
}

// ===================== 방어 화면 =====================
function viewDefense(state) {
  const v = el("div", "view");
  v.innerHTML = viewHead("방어 작전", "야간 경계 및 방어 작전 지휘");
  const grid = el("div", "view-grid cols-3");

  // 방어 상태
  const ds = el("div");
  const wall = Math.round(state.facilities.wall.durability);
  const power = Math.round(state.facilities.power.durability);
  const door = Math.round((state.facilities.wall.durability + state.facilities.workshop.durability) / 2);
  const stats = [
    ["🧱", "방벽 내구도", wall], ["🚪", "출입문 무결성", door], ["⚡", "전력 공급", power],
  ];
  for (const [ico, name, val] of stats) {
    ds.appendChild(el("div", "stat-row", `<span class="sr-ico">${ico}</span><span class="sr-name">${name}</span>
      <div class="bar"><i class="${barCls(val)}" style="width:${val}%"></i></div><span class="sr-val">${val}%</span>`));
  }
  ds.appendChild(el("div", "stat-row", `<span class="sr-ico">🔫</span><span class="sr-name">탄약 보유량</span>
    <div class="bar"><i class="hi" style="width:${clamp(state.resources.ammo * 6, 0, 100)}%"></i></div><span class="sr-val">${state.resources.ammo}</span>`));
  const dsPanel = panel("방어 상태", "", ds);
  dsPanel.appendChild(el("div", "stat-row", `<span class="sr-ico">🚨</span><span class="sr-name">예상 야간 위협</span><div style="flex:1"></div>`));
  dsPanel.appendChild(forecastNode(state));
  grid.appendChild(dsPanel);

  // 경계 배치 (방어 인원 = 비탐사 생존자)
  const defenders = aliveSurvivors(state).filter(s => !state.plan.team.includes(s.id));
  const gb = el("div", "sv-list");
  if (!defenders.length) gb.appendChild(el("div", "exped-empty", "⚠ 방어 인원이 없습니다! 탐사팀을 줄이세요."));
  for (const sv of defenders) gb.appendChild(survivorCard(state, sv, { assignable: true }));
  grid.appendChild(panel("경계 배치", `${defenders.length}명 배치`, gb));

  // 우: 위협 예측 + 시설 + CTA
  const right = el("div"); right.style.display = "flex"; right.style.flexDirection = "column"; right.style.gap = "14px";
  // 야간 위협 예측
  const tp = el("div");
  const base = state.lastThreatForecast?.power || 20;
  const threats = [
    { ico: "🦹", name: "약탈자 습격", n: state.resources.food + state.resources.materials > 20 ? 4 : 2 },
    { ico: "🧟", name: "감염자 군집", n: state.lastNoise > 20 ? 4 : 2 },
    { ico: "🧪", name: "특수 감염자", n: base > 50 ? 3 : 1 },
    { ico: "🔥", name: "화재 발생", n: state.facilities.power.durability < 50 ? 3 : 1 },
    { ico: "⛈️", name: "폭풍 / 악천후", n: 2 },
  ];
  for (const t of threats) tp.appendChild(el("div", "threat-row",
    `<span class="tr-ico">${t.ico}</span><span class="tr-name">${t.name}</span><span class="skulls">${skulls(t.n)}</span>`));
  right.appendChild(panel("야간 위협 예측", `위협력 ${base}`, tp));

  // 함정/시설
  right.appendChild(panel("함정 및 방어 시설", "자재 2 → 수리 +25", facilityRows(state, true)));

  // CTA — 하루 종료
  const cta = el("div", "cta-stack");
  const endBtn = el("button", "cta-main cta-olive");
  endBtn.innerHTML = `하루 종료 ▶<span class="cta-sub">탐사 실행 + 야간 방어 개시</span>`;
  endBtn.onclick = () => H.endDay();
  cta.appendChild(endBtn);
  const row = el("div", "cta-row");
  const repairBtn = el("button", "cta-amber", "긴급 수리");
  repairBtn.onclick = () => H.repairAll();
  const expBtn = el("button", "cta-amber", "탐사 재편성");
  expBtn.onclick = () => H.navTo("expedition");
  row.appendChild(expBtn); row.appendChild(repairBtn);
  cta.appendChild(row);
  if (!defenders.length) cta.appendChild(el("div", "action-note warn", "⚠ 방어 인원 0명 — 야간 피해가 커집니다."));
  right.appendChild(panel("작전 명령", "", cta));
  grid.appendChild(right);

  v.appendChild(grid);
  return v;
}

// ===================== 생존자 화면 =====================
function viewSurvivors(state) {
  const v = el("div", "view");
  const pop = aliveSurvivors(state).length;
  v.innerHTML = viewHead("생존자", `${pop}명 / 7 · 합류 대기 ${remainingRecruits(state)}명`);
  const grid = el("div", "view-grid");
  grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(280px, 1fr))";
  for (const sv of state.survivors) {
    grid.appendChild(survivorCard(state, sv, { detail: true, team: true, assignable: true }));
  }
  v.appendChild(grid);
  return v;
}

// ===================== 타로 화면 =====================
function viewTarot(state) {
  const v = el("div", "view");
  v.innerHTML = viewHead("타로 지원", "하루 3장 · 리롤 없음 · 캐릭터별 변환");
  // 카드
  const cardsBox = el("div", "tarot-cards");
  for (const c of state.cards) cardsBox.appendChild(tarotCardEl(state, c));
  const cp = panel("오늘의 카드", `${Object.values(state.assignments).filter(Boolean).length}/3 배정`, cardsBox);
  cp.appendChild(el("div", "tarot-help", state._pickCard
    ? "배정할 생존자를 탭하세요. (카드를 다시 탭하면 취소)"
    : "카드를 탭한 뒤 아래 생존자를 탭하거나, 카드를 드래그하세요."));
  v.appendChild(cp);

  // 변환 미리보기
  const conv = el("div");
  for (const [cid, svId] of Object.entries(state.assignments)) {
    if (!svId) continue;
    const card = state.cards.find(c => c.id === cid); const sv = state.survivors.find(s => s.id === svId);
    if (!card || !sv) continue;
    const cv = convertCardForSurvivor(card, sv);
    const eff = Object.entries(cv.effects).filter(([k]) => k !== "variance").map(([k, val]) => `${k} ${val > 0 ? "+" : ""}${val}`).join(", ");
    conv.appendChild(el("div", "tc-convert", `<b>${card.name}</b> → ${sv.name}: ${eff || "효과 변환"}${cv.notes.length ? ` ⚠ ${cv.notes.join("; ")}` : ""}`));
  }
  if (!conv.children.length) conv.appendChild(el("div", "rec-empty", "아직 배정된 카드가 없습니다."));
  v.appendChild(panel("적용 효과 미리보기", "", conv));

  // 생존자 (배정 대상)
  const grid = el("div", "view-grid");
  grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(260px, 1fr))";
  for (const sv of aliveSurvivors(state)) grid.appendChild(survivorCard(state, sv, { assignable: true }));
  v.appendChild(panel("생존자 — 배정 대상", "카드를 끌어다 놓으세요", grid));
  return v;
}

// ===================== 기록 화면 =====================
function viewRecords(state) {
  const v = el("div", "view");
  v.innerHTML = viewHead("기록", "클라우드 플레이 기록");
  const body = el("div");
  const rs = recordsState;
  if (!rs.enabled) body.appendChild(el("div", "rec-empty", "클라우드 기록은 구글 로그인 시 사용할 수 있습니다."));
  else if (!rs.user) body.appendChild(el("div", "rec-empty", "Google 로그인 후 완료 기록이 저장됩니다."));
  else if (rs.loading) body.appendChild(el("div", "rec-empty", "불러오는 중…"));
  else {
    const runs = rs.runs || [];
    const best = rs.profile?.bestDays || (runs.length ? Math.max(...runs.map(r => r.daysSurvived || 0)) : 0);
    const total = rs.profile?.totalRuns ?? runs.length;
    const sum = el("div", "rec-summary");
    sum.innerHTML = `<div class="rec-stat"><div class="v">${best}</div><div class="l">최고 생존일</div></div>
      <div class="rec-stat"><div class="v">${total}</div><div class="l">총 플레이</div></div>
      <div class="rec-stat"><div class="v">${aliveSurvivors(state).length}</div><div class="l">현재 생존자</div></div>`;
    body.appendChild(sum);
    if (!runs.length) body.appendChild(el("div", "rec-empty", "아직 완료된 게임 기록이 없습니다."));
    else for (const r of runs) {
      const date = r.endedAt?.seconds ? new Date(r.endedAt.seconds * 1000).toLocaleDateString("ko-KR") : "";
      body.appendChild(el("div", "rec-row", `<span class="rec-day">${r.daysSurvived || 0}일</span>
        <span class="rec-res">${r.result === "over" ? "캠프 붕괴" : "진행 중"} · 생존자 ${r.survivors ?? 0}명</span>
        <span class="rec-date">${date}</span>`));
    }
  }
  v.appendChild(panel("내 기록", "", body));
  return v;
}

// ===================== 인증 =====================
const GOOGLE_LOGO = `<svg class="g-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

export function renderAuth(authState) {
  lastAuth = authState;
  const chip = $("#auth-chip"); const titleAuth = $("#title-auth");
  if (!chip || !titleAuth) return;
  if (!authState.enabled) {
    chip.innerHTML = "";
    titleAuth.innerHTML = `<span class="cloud-note">오프라인 모드 — 진행은 이 브라우저에 저장됩니다.</span>`;
    return;
  }
  const u = authState.user;
  if (u) {
    const best = authState.profile?.bestDays ? `최고 ${authState.profile.bestDays}일` : "";
    const avatar = u.photoURL ? `<img src="${u.photoURL}" referrerpolicy="no-referrer" alt="" />` : "";
    chip.innerHTML = `${avatar}<span class="au-name">${u.displayName || u.email || "플레이어"}</span>${best ? `<span class="au-best">${best}</span>` : ""}<button class="icon-btn au-out" id="au-signout">로그아웃</button>`;
    chip.querySelector("#au-signout").onclick = () => H.signOut();
    titleAuth.innerHTML = `<div class="au-signed">${avatar}<span>${u.displayName || u.email}님 — 클라우드 동기화 켜짐</span></div><button class="btn-mini au-out" id="au-signout2">로그아웃</button>`;
    titleAuth.querySelector("#au-signout2").onclick = () => H.signOut();
  } else {
    chip.innerHTML = `<button class="btn-google" id="au-signin-mini">${GOOGLE_LOGO}로그인</button>`;
    chip.querySelector("#au-signin-mini").onclick = () => H.signIn();
    titleAuth.innerHTML = `<button class="btn-google" id="au-signin">${GOOGLE_LOGO}Google로 로그인</button><span class="cloud-note">로그인하면 진행과 기록이 클라우드에 저장됩니다 (선택).</span>`;
    titleAuth.querySelector("#au-signin").onclick = () => H.signIn();
  }
}

// 기록 화면용 상태 (main이 갱신)
let recordsState = { enabled: false, user: null, runs: [], profile: null, loading: false };
export function setRecordsState(rs) { recordsState = rs; }

// ===================== 리포트 / 게임오버 / 모달 =====================
export function showReport(state, report) {
  $("#report-title").textContent = `DAY ${report.day} 야간 보고`;
  const body = $("#report-body"); body.innerHTML = "";
  if (state.log?.length) {
    const sec = section("아침 / 정산");
    for (const l of state.log) sec.appendChild(line(l.m, l.t === "warn" ? "warn" : l.t === "danger" ? "danger" : ""));
    body.appendChild(sec);
  }
  if (report.exped) {
    const e = report.exped; const sec = section("탐사");
    sec.appendChild(line(`${e.region} / ${e.depth} / ${e.team.join(", ")}`));
    sec.appendChild(line(`이벤트: ${e.event.text} ${e.event.result}`, "warn"));
    const gains = Object.entries(e.gained).filter(([, val]) => val > 0).map(([k, val]) => `<span>${RESOURCE_LABEL[k] || k} +${val}</span>`).join("");
    const gl = el("div", "rep-line"); gl.innerHTML = `획득: <span class="rep-gain">${gains || "<span>—</span>"}</span>`;
    sec.appendChild(gl);
    if (e.recruited) sec.appendChild(line(`🙋 ${e.recruited}이(가) 캠프에 합류했다! (사기 +6)`, "good"));
    if (e.injuries.length) for (const inj of e.injuries) sec.appendChild(line(inj, "danger"));
    sec.appendChild(line(`소음 ${e.noise} · 부상확률 ${e.injuryChance}% · 귀환위험 ${e.returnRisk}%`));
    body.appendChild(sec);
  } else { const sec = section("탐사"); sec.appendChild(line("이번 날은 탐사를 보내지 않았다 (전원 캠프 방어).")); body.appendChild(sec); }

  if (report.tarot?.length) {
    const sec = section("타로 영향");
    for (const t of report.tarot) {
      const eff = Object.entries(t.conv.effects).filter(([k]) => k !== "variance").map(([k, val]) => `${k} ${val > 0 ? "+" : ""}${val}`).join(", ");
      const di = el("div", "tarot-impact");
      di.innerHTML = `<b>${t.card}</b> → ${t.survivor}: ${eff || "효과 변환"}${t.conv.notes.length ? ` ⚠ ${t.conv.notes.join("; ")}` : ""}`;
      sec.appendChild(di);
    }
    body.appendChild(sec);
  }
  if (report.night) {
    const n = report.night; const sec = section("야간 방어");
    const tb = el("div", "rep-line");
    tb.innerHTML = `<span class="rep-threat-ico">${threatIconByName(n.threat)}</span> ${n.threat} <span class="tier-badge tier-${n.tier}">${tierLabel(n.tier)}</span>`;
    sec.appendChild(tb);
    sec.appendChild(line(`방어력 ${n.defensePower} vs 위협력 ${n.threatPower} → 피해도 ${n.lossSeverity}`));
    for (const ef of n.effects) sec.appendChild(line(ef, ef.includes("사망") ? "danger" : ""));
    body.appendChild(sec);
  }
  const fc = state.lastThreatForecast;
  if (fc) { const sec = section("내일 경고"); sec.appendChild(line(`다음 날 위협 예고: ${fc.label}. 방어와 자원을 점검하세요.`)); body.appendChild(sec); }
  $("#report-modal").classList.add("active");
}
function tierLabel(t) { return t === "minor" ? "경미" : t === "moderate" ? "중간 피해" : "심각"; }
function threatIconByName(name) {
  if (!name) return "🌙";
  if (name.includes("레이더")) return THREAT_ICON.raider;
  if (name.includes("감염")) return THREAT_ICON.infected;
  if (name.includes("도난")) return THREAT_ICON.theft;
  if (name.includes("정전")) return THREAT_ICON.blackout;
  if (name.includes("폭풍")) return THREAT_ICON.storm;
  return "🌙";
}
function section(title) { const s = el("div", "rep-section"); s.appendChild(el("h4", null, title)); return s; }
function line(text, cls) { return el("div", "rep-line" + (cls ? " " + cls : ""), text); }
export function hideReport() { $("#report-modal").classList.remove("active"); }

export function showGameOver(state) {
  $("#over-title").textContent = "캠프 붕괴";
  $("#over-body").textContent = `${state.day - 1}일을 버텼습니다. 모든 생존자를 잃었습니다. 누적된 위기가 캠프를 무너뜨렸습니다.`;
  $("#over-modal").classList.add("active");
}
export function hideGameOver() { $("#over-modal").classList.remove("active"); }

// 기록 모달(레거시) — 화면으로 대체되었지만 호출 안전하게 유지
export function showRecords() { H.navTo && H.navTo("records"); }
export function hideRecords() { $("#records-modal")?.classList.remove("active"); }

export function showScreen(id) {
  // title-screen vs app
  if (id === "title-screen") { $("#title-screen").classList.add("active"); $("#app").classList.remove("active"); }
  else { $("#title-screen").classList.remove("active"); $("#app").classList.add("active"); }
}

export function toast(msg) {
  let t = $("#toast");
  if (!t) { t = el("div"); t.id = "toast"; document.body.appendChild(t);
    t.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#2a241b;border:1px solid #4a3e2c;color:#d9cbac;padding:10px 20px;border-radius:8px;z-index:99999;font-size:.88rem;box-shadow:0 6px 20px rgba(0,0,0,.5);transition:opacity .3s;"; }
  t.textContent = msg; t.style.opacity = "1";
  clearTimeout(t._t); t._t = setTimeout(() => { t.style.opacity = "0"; }, 1600);
}
