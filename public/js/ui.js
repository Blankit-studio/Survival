// ============================================================================
// ui.js — AFTERFALL UI (목업 밀도판)
// 상단바 + 사이드바 + 멀티 스크린: 쉘터(방 그리드·방어 현황·빠른 배정),
// 탐사(노드맵·정찰·팀·장비·일정·카드), 방어(배치도·경계 배치·위협 예측·
// 야간 시간대·사건 기록·타로 지원·작전 명령), 생존자, 타로, 기록
// ============================================================================
import {
  STAT_LABEL, RESOURCE_LABEL, ROLE_LABEL, TRAIT_LABEL, REGIONS, DEPTHS, FACILITIES,
  RESOURCE_ICON, ROLE_ICON, STAT_ICON, REGION_ICON, FACILITY_ICON,
  THREAT_ICON, DEPTH_ICON, TAROT_VIS, NAV, WEATHER, REGION_META,
  REGION_POS, REGION_ROUTES, DEFENSE_MAP_MARKERS, EQUIP_SLOTS, ROOM_ORDER,
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
function skulls(n, max = 5) { let s = ""; for (let i = 0; i < max; i++) s += `<span class="${i < n ? "on" : "off"}">☠</span>`; return s; }
function dangerLabel(v) { return v < 35 ? "낮음" : v < 60 ? "중간" : "높음"; }
function dangerCls(v) { return v < 35 ? "lv-low" : v < 60 ? "lv-mid" : "lv-hi"; }

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
  $("#day-sub").innerHTML = `<span class="day-time">17:35</span> <span class="day-weather">${weather}</span>`;

  const bar = $("#resource-bar"); bar.innerHTML = "";
  for (const k of TOPBAR_RES) {
    let val, delta = null;
    if (k === "power") { val = Math.round(state.facilities.power.durability) + "%"; delta = state.facilities.power.durability < 50 ? -12 : 12; }
    else { val = state.resources[k] ?? 0; delta = resDelta(state, k); }
    const low = LOW_RES[k] != null && (state.resources[k] ?? 99) <= LOW_RES[k];
    const chip = el("div", "res-chip" + (low ? " low" : ""));
    let deltaHtml = `<span class="res-delta zero">—</span>`;
    if (delta !== null && delta !== 0) {
      const cls = delta > 0 ? "pos" : "neg";
      deltaHtml = `<span class="res-delta ${cls}">${delta > 0 ? "+" : ""}${delta}/${k === "power" ? "시간" : "일"}</span>`;
    }
    chip.innerHTML = `<span class="res-ico">${RESOURCE_ICON[k] || "⚡"}</span>
      <span class="res-meta"><span class="res-lbl">${RESOURCE_LABEL[k] || "전력"}</span>
      <span class="res-val">${val}</span>${deltaHtml}</span>`;
    bar.appendChild(chip);
  }

  // 알림 벨 배지 (경고/위험 로그 수)
  const warnCount = (state.log || []).filter(l => l.t === "warn" || l.t === "danger").length;
  const badge = $("#bell-badge");
  if (badge) { badge.hidden = warnCount === 0; badge.textContent = warnCount; }
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

function viewHeadNode(title, sub, tabs) {
  const h = el("div", "view-head");
  h.innerHTML = `<div class="vh-left"><span class="view-title">${title}</span><span class="view-sub">${sub || ""}</span></div>`;
  if (tabs) h.appendChild(tabs);
  return h;
}
function panel(title, subRight, bodyNode, extraCls) {
  const p = el("div", "panel" + (extraCls ? " " + extraCls : ""));
  const h = el("h3");
  h.innerHTML = `<span class="h3-t">${title}</span>${subRight ? `<span class="sub">${subRight}</span>` : ""}`;
  p.appendChild(h);
  const b = el("div", "panel-body");
  if (bodyNode) b.appendChild(bodyNode);
  p.appendChild(b);
  p._body = b;
  return p;
}
function col(...panels) {
  const c = el("div", "vcol");
  for (const p of panels) if (p) c.appendChild(p);
  return c;
}

// ===================== 공통 컴포넌트 =====================
function avatarHtml(sv, size) {
  const hue = avatarHue(sv.id);
  return `<span class="sv-avatar${size ? " " + size : ""}" style="background:
    radial-gradient(circle at 35% 30%, hsl(${hue} 30% 42%), hsl(${hue} 34% 22%) 70%);border-color:hsl(${hue} 40% 48%)">
    ${sv.name.charAt(0)}<span class="sv-rolebadge">${ROLE_ICON[sv.role] || ""}</span></span>`;
}

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
      ${barRow("체력", health, barCls(health))}
      ${barRow("사기", mental, barCls(mental))}
      ${barRow("피로", fatigue, fatigue > 60 ? "lo" : fatigue > 35 ? "mid" : "hi")}
    </div>`;
  if (sv.condition.infection > 0) html += `<div class="sv-assign-tag warn-red">⚠ 감염 ${Math.round(sv.condition.infection)}</div>`;
  if (opts.detail) {
    html += `<div class="sv-stats">${["strength", "agility", "intelligence", "hp", "mental", "charisma"]
      .map(k => `<span title="${STAT_LABEL[k]}">${STAT_ICON[k]} <b>${sv.stats[k]}</b></span>`).join("")}</div>`;
  }
  if (assigned.length) {
    html += `<div class="sv-cards">${assigned.map(cid => {
      const c = state.cards.find(x => x.id === cid);
      return c ? `<span class="mini-card" data-card="${cid}" title="배정 취소">${c.korean || c.name} ✕</span>` : "";
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
  card.querySelectorAll(".mini-card").forEach(mc => mc.onclick = e => { e.stopPropagation(); H.unassignCard(mc.dataset.card); });
  const tb = card.querySelector(".team-btn"); if (tb) tb.onclick = () => H.toggleTeam(sv.id);
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
    <div class="bar thin"><i class="${cls}" style="width:${clamp(val, 0, 100)}%"></i></div>
    <span class="val">${val}%</span></div>`;
}

// 타로 카드
function tarotCardEl(state, card, opts = {}) {
  const vis = TAROT_VIS[card.id] || { numeral: "", symbol: "✦" };
  const assignedTo = state.assignments[card.id];
  const sv = assignedTo ? state.survivors.find(s => s.id === assignedTo) : null;
  const wrap = el("div", "tcard-wrap");
  const c = el("div", "tcard" + (sv ? " assigned" : "") + (state._pickCard === card.id ? " picked" : ""));
  c.draggable = true; c.dataset.cardId = card.id;
  c.innerHTML = `<div class="tc-frame">
      <div class="tc-top"><span class="tc-num">${vis.numeral}</span><span class="tc-num">${vis.numeral}</span></div>
      <div class="tc-art"><span class="tc-symbol">${vis.symbol}</span></div>
      <div class="tc-nameplate"><div class="tc-kr">${card.korean}</div><div class="tc-name">${card.name}</div></div>
      ${sv ? `<div class="tc-assignee">▸ ${sv.name}</div>` : `<div class="tc-desc">${card.desc}</div>`}
    </div>`;
  c.addEventListener("dragstart", e => { e.dataTransfer.setData("text/card", card.id); c.classList.add("dragging"); });
  c.addEventListener("dragend", () => c.classList.remove("dragging"));
  c.addEventListener("click", () => H.pickCard(card.id));
  wrap.appendChild(c);
  if (opts.applyBtn) {
    const b = el("button", "tc-apply", sv ? "배정됨 ✓" : (state._pickCard === card.id ? "생존자 선택…" : "적용하기"));
    b.onclick = e => { e.stopPropagation(); H.pickCard(card.id); };
    wrap.appendChild(b);
  }
  return wrap;
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

function forecastNode(state, compact) {
  const fc = state.lastThreatForecast || { label: "중간", power: 20 };
  const n = fc.power < 25 ? 1 : fc.power < 40 ? 2 : fc.power < 55 ? 3 : fc.power < 70 ? 4 : 5;
  const lvlClass = fc.label.startsWith("매우") ? "매우" : fc.label;
  const w = el("div", "threat-block");
  w.innerHTML = `<div class="threat-level ${lvlClass}">${fc.label}</div>
    <div class="skulls big">${skulls(n, 6)}</div>` +
    (compact ? "" : `<div class="action-note" style="margin-top:7px">위협력 ≈ ${fc.power} · 탐사 인원이 많을수록 야간 방어가 약해집니다.</div>`);
  return w;
}

function hintBar(hints) {
  const bar = el("div", "hint-bar");
  for (const h of hints) {
    bar.appendChild(el("div", "hint-chip" + (h.warn ? " warn" : ""), `<span class="hc-ico">${h.ico}</span><span>${h.text}</span>`));
  }
  return bar;
}

// ===================== 쉘터 화면 =====================
function viewShelter(state) {
  const v = el("div", "view");
  const pop = aliveSurvivors(state).length;
  v.appendChild(viewHeadNode("쉘터 개요", `${WEATHER[(state.day - 1) % WEATHER.length]} · 생존자 ${pop}명 / 7`));

  const grid = el("div", "view-grid cols-shelter");

  // ---- 좌: 방 그리드 + 방어 현황 ----
  const roomGrid = el("div", "room-grid");
  for (const k of ROOM_ORDER) {
    const fac = state.facilities[k]; if (!fac) continue;
    const d = Math.round(fac.durability);
    const lv = 1 + (d >= 50 ? 1 : 0) + (d >= 90 ? 1 : 0);
    const room = el("div", "room-card");
    room.innerHTML = `<div class="room-art"><span>${FACILITY_ICON[k]}</span></div>
      <div class="room-meta"><span class="room-name">${FACILITIES[k].name}</span><span class="room-lv">LV.${lv}</span></div>
      <div class="bar thin room-bar"><i class="${barCls(d)}" style="width:${d}%"></i></div>`;
    room.title = `${FACILITIES[k].desc} · 내구도 ${d}%`;
    roomGrid.appendChild(room);
  }
  const leftTop = panel("쉘터 시설", "내구도에 따라 LV 표시", roomGrid);

  // 방어 현황 (벽 내구도 + 함정 상태 + 위협 예보)
  const wall = Math.round(state.facilities.wall.durability);
  const workshop = Math.round(state.facilities.workshop.durability);
  const dstat = el("div", "def-strip");
  dstat.innerHTML = `
    <div class="def-cell">
      <div class="def-cell-t">벽 내구도</div>
      <div class="def-big ${wall > 60 ? "ok" : wall > 30 ? "mid" : "bad"}">🛡 ${wall}%</div>
      <div class="bar thin"><i class="${barCls(wall)}" style="width:${wall}%"></i></div>
      <div class="def-cell-s">수리 필요 구간 <b class="warn-red">${wall < 100 ? Math.ceil((100 - wall) / 25) : 0}</b></div>
    </div>
    <div class="def-cell">
      <div class="def-cell-t">함정 상태</div>
      <div class="trap-mini">
        <div class="trap-item"><span>🪤</span><small>못 함정</small><b>${workshop > 30 ? "12/12" : "6/12"}</b></div>
        <div class="trap-item"><span>🪢</span><small>와이어</small><b>${workshop > 50 ? "8/10" : "4/10"}</b></div>
        <div class="trap-item"><span>🔥</span><small>화염병</small><b>${state.resources.parts >= 3 ? "6/6" : "2/6"}</b></div>
      </div>
    </div>
    <div class="def-cell def-fc"></div>`;
  dstat.querySelector(".def-fc").appendChild(el("div", "def-cell-t", "오늘 밤 위협 예보"));
  dstat.querySelector(".def-fc").appendChild(forecastNode(state, true));
  const leftBottom = panel("방어 현황", "", dstat);
  grid.appendChild(col(leftTop, leftBottom));

  // ---- 중: 생존자 상태 + 오늘의 카드 ----
  const svBox = el("div", "sv-list");
  for (const sv of aliveSurvivors(state)) svBox.appendChild(survivorCard(state, sv, { assignable: true }));
  const midTop = panel("생존자 상태", `${pop}명 / 7 · 합류 대기 ${remainingRecruits(state)}`, svBox);

  const cardsBox = el("div", "tarot-cards");
  for (const c of state.cards) cardsBox.appendChild(tarotCardEl(state, c, { applyBtn: true }));
  const midBottom = panel("오늘의 카드", "카드는 매일 아침 갱신됩니다", cardsBox);
  midBottom._body.appendChild(el("div", "tarot-help", state._pickCard ? "배정할 생존자를 탭하세요." : "적용하기 → 생존자 선택, 또는 카드를 드래그하세요."));
  grid.appendChild(col(midTop, midBottom));

  // ---- 우: 빠른 작업 배정 + 시설 유지보수 ----
  const teamN = state.plan.team.length, defN = pop - teamN;
  const qa = el("div");
  const jobs = [
    { ico: "🧭", name: "탐사", desc: "자원과 보급품을 찾기 위해 외부 지역을 탐사합니다.", count: teamN, go: "expedition" },
    { ico: "🛡️", name: "경계", desc: "쉘터를 지키고 위협에 대비합니다.", count: defN, go: "defense" },
    { ico: "🃏", name: "타로 배정", desc: "오늘의 카드를 생존자에게 배정합니다.", count: Object.values(state.assignments).filter(Boolean).length + "/3", go: "tarot" },
    { ico: "🔨", name: "수리", desc: "시설과 방어 구조물을 유지 보수합니다.", count: Object.values(state.facilities).filter(f => f.durability < 100).length, go: "defense" },
  ];
  for (const j of jobs) {
    const r = el("div", "qa-row");
    r.innerHTML = `<span class="qa-ico">${j.ico}</span><div class="qa-body"><div class="qa-name">${j.name}</div><div class="qa-desc">${j.desc}</div></div>
      <span class="qa-count">👤 ${j.count}</span><button class="qa-go">배정</button>`;
    r.querySelector(".qa-go").onclick = () => H.navTo(j.go);
    qa.appendChild(r);
  }
  const rightTop = panel("빠른 작업 배정", "", qa);
  const rightBottom = panel("시설 유지보수", "자재 2 → 수리 +25", facilityRows(state, true));
  grid.appendChild(col(rightTop, rightBottom));
  v.appendChild(grid);

  // ---- 하단: 일일 로그 ----
  const logStrip = el("div", "log-strip");
  const logs = (state.log || []).slice(0, 5);
  if (!logs.length) logStrip.appendChild(el("div", "log-chip", "▪ 기록 없음"));
  for (const l of logs) {
    const cls = l.t === "warn" ? "warn" : l.t === "danger" ? "danger" : "";
    const ico = l.t === "danger" ? "💀" : l.t === "warn" ? "⚠️" : "▪";
    logStrip.appendChild(el("div", "log-chip " + cls, `<span>${ico}</span><span>${l.m}</span>`));
  }
  const lp = panel("일일 로그", "전체 보기 →", logStrip);
  lp._body.style.paddingTop = "4px";
  v.appendChild(lp);
  return v;
}

// ===================== 탐사 화면 =====================
function viewExpedition(state) {
  const v = el("div", "view");
  v.appendChild(viewHeadNode("탐사 계획", "지역 · 팀 · 깊이 · 카드"));
  const grid = el("div", "view-grid cols-exped");
  const preview = previewExpedition(state);
  const region = REGIONS.find(r => r.id === state.plan.regionId);
  const meta = REGION_META[region.id] || { km: 1, minutes: 40, recLevel: 1 };

  // ---- 좌: 지역 노드맵 + 지역 정보 + 정찰 ----
  const mapBox = el("div", "node-map");
  // 경로 (SVG)
  let svgLines = "";
  for (const [a, b] of REGION_ROUTES.map(r => [REGION_POS[r[0]], REGION_POS[r[1]]])) {
    if (!a || !b) continue;
    svgLines += `<line x1="${a.x}%" y1="${a.y}%" x2="${b.x}%" y2="${b.y}%" />`;
  }
  mapBox.innerHTML = `<svg class="route-svg">${svgLines}</svg>`;
  for (const [ra, rb, min] of REGION_ROUTES) {
    const a = REGION_POS[ra], b = REGION_POS[rb]; if (!a || !b) continue;
    const lb = el("div", "route-label", `${min}분`);
    lb.style.left = (a.x + b.x) / 2 + "%"; lb.style.top = (a.y + b.y) / 2 + "%";
    mapBox.appendChild(lb);
  }
  for (const r of REGIONS) {
    const pos = REGION_POS[r.id]; if (!pos) continue;
    const m = REGION_META[r.id] || { minutes: 40 };
    const node = el("div", "region-card node" + (state.plan.regionId === r.id ? " sel" : ""));
    node.style.left = pos.x + "%"; node.style.top = pos.y + "%";
    node.innerHTML = `<div class="node-art">${REGION_ICON[r.id] || "📍"}</div>
      <div class="node-name">${r.name}</div>
      <div class="node-meta"><span class="node-danger ${dangerCls(r.danger)}">위험도: ${dangerLabel(r.danger)}</span></div>
      <div class="node-time">⏱ ${m.minutes}분</div>`;
    node.onclick = () => H.selectRegion(r.id);
    mapBox.appendChild(node);
  }
  const legend = el("div", "map-legend", `<b>위험도 범례</b>
    <span class="lg lv-low">● 낮음</span><span class="lg lv-mid">● 중간</span><span class="lg lv-hi">● 높음</span>`);
  mapBox.appendChild(legend);
  const mapPanel = panel("지역 지도", "거점 기준", mapBox);

  // 지역 정보 스트립
  const info = el("div", "info-strip");
  const noiseLv = preview ? dangerLabel(preview.noise * 2) : "—";
  info.innerHTML = `
    <div class="info-cell desc"><div class="ic-t">지역 정보</div><div class="ic-d">${region.desc}</div></div>
    <div class="info-cell"><div class="ic-t">거점 거리</div><div class="ic-v">${meta.km}km</div></div>
    <div class="info-cell"><div class="ic-t">예상 이동 시간</div><div class="ic-v">${meta.minutes}분</div></div>
    <div class="info-cell"><div class="ic-t">노이즈 위험</div><div class="ic-v ${noiseLv === "높음" ? "warn-red" : ""}">${noiseLv} ${noiseLv === "높음" ? "📢" : ""}</div></div>
    <div class="info-cell"><div class="ic-t">권장 팀 레벨</div><div class="ic-v">Lv.${meta.recLevel} 이상</div></div>`;
  mapPanel._body.appendChild(info);

  // 정찰 정보
  const sc = el("div", "scout-grid");
  const scoutItems = [
    { ico: "🦹", name: "약탈자", val: dangerLabel(region.danger), sk: region.danger < 35 ? 1 : region.danger < 60 ? 2 : 3, desc: "일대 약탈자 활동" },
    { ico: "🧟", name: "감염자", val: dangerLabel(region.danger - 8), sk: region.danger < 45 ? 1 : 2, desc: "무리 발견 가능성" },
    { ico: "⚠️", name: "함정", val: dangerLabel(region.danger - 12), sk: region.danger < 50 ? 1 : 2, desc: "붕괴/설치 함정 주의" },
    { ico: "🌧️", name: "날씨", val: WEATHER[(state.day - 1) % WEATHER.length], sk: 0, desc: "강수 확률 30%" },
    { ico: "🌙", name: "어둠", val: "높음", sk: 3, desc: "밤 탐사 시 가시거리 감소" },
  ];
  for (const s of scoutItems) sc.appendChild(el("div", "scout-item",
    `<div class="si-head"><span class="si-ico">${s.ico}</span><span class="si-name">${s.name}</span></div>
     <div class="si-val">${s.val} ${s.sk ? `<span class="skulls">${skulls(s.sk, 3)}</span>` : ""}</div>
     <div class="si-desc">${s.desc}</div>`));
  const scoutPanel = panel("정찰 정보", region.name, sc);
  grid.appendChild(col(mapPanel, scoutPanel));

  // ---- 우: 팀 편성 + 장비 + 일정 + 카드 + CTA ----
  const teamBox = el("div", "sv-list");
  for (const sv of aliveSurvivors(state)) teamBox.appendChild(survivorCard(state, sv, { team: true, assignable: true }));
  const teamPanel = panel("팀 편성", `${state.plan.team.length}/3`, teamBox);
  const autoBtn = el("button", "sv-btn auto-btn", "자동 편성");
  autoBtn.onclick = () => H.autoTeam();
  teamPanel.querySelector("h3").appendChild(autoBtn);

  // 장비 슬롯
  const eq = el("div", "equip-row");
  for (const s of EQUIP_SLOTS) {
    let sub = "";
    if (s.res) sub = state.resources[s.res] ?? 0;
    else if (s.team) sub = state.plan.team.length + "개";
    else if (s.power) sub = Math.round(state.facilities.power.durability) + "%";
    eq.appendChild(el("div", "equip-slot", `<div class="eq-ico">${s.icon}</div><div class="eq-name">${s.name}</div>${sub !== "" ? `<div class="eq-sub">${sub}</div>` : ""}`));
  }
  const eqPanel = panel("장비", "", eq);

  // 일정 및 경로 + 획득 우선순위
  const depth = DEPTHS.find(d => d.id === state.plan.depthId);
  const sched = el("div", "sched-grid");
  const schedBox = el("div", "sched-box");
  schedBox.innerHTML = `<div class="sb-t">일정 및 경로</div>
    <div class="sb-row"><span>출발 시간</span><b>오늘 18:00</b></div>
    <div class="sb-row"><span>예상 귀환</span><b>내일 0${Math.min(9, 2 + Math.round(depth.time / 6))}:00</b></div>
    <div class="sb-row"><span>소요 시간</span><b>${depth.time}시간</b></div>
    <div class="sb-row"><span>노이즈 위험</span><b class="${preview && preview.noise > 18 ? "warn-red" : ""}">${preview ? dangerLabel(preview.noise * 2) : "—"} ${preview && preview.noise > 18 ? "📢" : ""}</b></div>
    <div class="sb-note">밤 탐사 시 위험 증가</div>`;
  const prio = el("div", "sched-box");
  const lootRows = Object.entries(region.lootTable).sort((a, b) => b[1] - a[1])
    .map(([k, w]) => `<div class="sb-row"><span>${RESOURCE_ICON[k]} ${RESOURCE_LABEL[k]}</span>
      <span class="prio-bar"><i style="width:${Math.round(w * 100)}%"></i></span><b class="prio-lv">${w >= .35 ? "높음" : "중간"}</b></div>`).join("");
  prio.innerHTML = `<div class="sb-t">획득 우선순위</div>${lootRows}`;
  sched.appendChild(schedBox); sched.appendChild(prio);
  const schedPanel = panel("일정 · 획득", "", sched);

  // 파밍 성향
  const depthRow = el("div", "depth-row");
  for (const d of DEPTHS) {
    const o = el("div", "depth-opt" + (state.plan.depthId === d.id ? " sel" : ""));
    o.innerHTML = `<span class="d-ico">${DEPTH_ICON[d.id] || ""}</span>${d.name}<small>×${d.lootMult}</small>`;
    o.title = d.desc; o.onclick = () => H.selectDepth(d.id);
    depthRow.appendChild(o);
  }
  const depthPanel = panel("파밍 성향", "", depthRow);

  // 카드 배정
  const cardsBox = el("div", "tarot-cards");
  for (const c of state.cards) cardsBox.appendChild(tarotCardEl(state, c, { applyBtn: true }));
  const cp = panel("카드 배정", `${Object.values(state.assignments).filter(Boolean).length}/3`, cardsBox);
  // 배정 효과 요약
  const fx = el("div", "card-fx");
  for (const [cid, svId] of Object.entries(state.assignments)) {
    if (!svId) continue;
    const card = state.cards.find(c => c.id === cid); const sv = state.survivors.find(s => s.id === svId);
    if (!card || !sv) continue;
    const cv = convertCardForSurvivor(card, sv);
    const eff = Object.entries(cv.effects).filter(([k]) => k !== "variance").slice(0, 2)
      .map(([k, val]) => `${k} ${val > 0 ? "+" : ""}${val}`).join(" · ");
    fx.appendChild(el("div", "fx-row", `<b>${sv.name}</b> ${eff}`));
  }
  if (fx.children.length) cp._body.appendChild(fx);

  // 게이지 + CTA
  const gaugePanel = panel("예측", "4개 게이지", gaugesNode(preview));
  const cta = el("div", "cta-stack");
  const startBtn = el("button", "cta-main cta-olive big");
  startBtn.innerHTML = `탐사 시작<span class="cta-sub">자원 소모: 🍖 식량 ${Math.max(1, state.plan.team.length)} · 💧 물 ${Math.max(1, state.plan.team.length)} · 방어 단계로 이동</span>`;
  startBtn.onclick = () => H.navTo("defense");
  cta.appendChild(startBtn);
  const ctaPanel = panel("작전 명령", "", cta);

  grid.appendChild(col(teamPanel, eqPanel, schedPanel, depthPanel, cp, gaugePanel, ctaPanel));
  v.appendChild(grid);

  // ---- 하단 힌트 바 ----
  const team = state.plan.team.map(id => state.survivors.find(s => s.id === id)).filter(Boolean);
  const avgFat = team.length ? Math.round(team.reduce((a, s) => a + s.condition.fatigue, 0) / team.length) : 0;
  const hints = [];
  if (avgFat > 40) hints.push({ ico: "🚩", text: "팀의 평균 피로가 높습니다. 피로 감소 카드를 고려해보세요.", warn: false });
  else hints.push({ ico: "🚩", text: "권장 레벨에 맞는 팀과 카드를 준비하면 생존 확률이 증가합니다." });
  if (preview && preview.noise > 18) hints.push({ ico: "⚠️", text: "노이즈 위험이 높습니다. 은신 위주의 카드를 추천합니다.", warn: true });
  else hints.push({ ico: "🏚️", text: "위험 지역일수록 보상은 커지지만 부상·귀환 위험이 함께 오릅니다." });
  v.appendChild(hintBar(hints));
  return v;
}

// ===================== 방어 화면 =====================
function viewDefense(state) {
  const v = el("div", "view");
  if (!state._defTab) state._defTab = "guard";
  // 탭
  const tabs = el("div", "view-tabs");
  const tabDefs = [["guard", "야간 경계"], ["wall", "방벽 관리"], ["pvp", "🔒 PVP 준비 (개발 예정)"]];
  for (const [id, label] of tabDefs) {
    const t = el("button", "vtab" + (state._defTab === id ? " active" : "") + (id === "pvp" ? " locked" : ""), label);
    if (id !== "pvp") t.onclick = () => { state._defTab = id; H.rerender ? H.rerender() : H.navTo("defense"); };
    tabs.appendChild(t);
  }
  v.appendChild(viewHeadNode("방어 작전", "야간 경계 및 방어 작전 지휘", tabs));

  const grid = el("div", "view-grid cols-def");
  const defenders = aliveSurvivors(state).filter(s => !state.plan.team.includes(s.id));
  const wall = Math.round(state.facilities.wall.durability);
  const power = Math.round(state.facilities.power.durability);
  const workshop = Math.round(state.facilities.workshop.durability);
  const storage = Math.round(state.facilities.storage.durability);
  const infirmary = Math.round(state.facilities.infirmary.durability);
  const door = Math.round((wall + workshop) / 2);

  // ---- 좌: 방어 배치도 + (함정 관리 | 사건 기록) ----
  const map = el("div", "def-map");
  map.innerHTML = `<div class="dm-wall"></div><div class="dm-ground"></div>`;
  const markerVal = kind => ({
    guard: defenders.length ? "경계 중" : "무인",
    wall: `내구도 ${wall}%`, wall2: `내구도 ${Math.max(0, wall - 8)}%`,
    power: `전력 ${power}%`, storage: storage > 60 ? "안전" : "점검 필요",
    infirmary: "대기 중", gate: `문 ${door}%`,
    workshop: `${workshop > 50 ? 8 : 4}/10 설치`, barricade: workshop > 60 ? "강화됨" : "보통",
  })[kind] || "";
  const markerBad = kind => (kind === "wall" && wall < 50) || (kind === "power" && power < 50) || (kind === "gate" && door < 50);
  for (const m of DEFENSE_MAP_MARKERS) {
    const mk = el("div", "dm-marker" + (markerBad(m.kind) ? " bad" : ""));
    mk.style.left = m.x + "%"; mk.style.top = m.y + "%";
    mk.innerHTML = `<span class="dm-ico">${m.icon}</span><span class="dm-txt"><b>${m.name}</b><small>${markerVal(m.kind)}</small></span>`;
    map.appendChild(mk);
  }
  const mapPanel = panel("방어 배치도", "", map);

  // 함정 및 방어 시설 관리 (그리드)
  const trapGrid = el("div", "trap-grid");
  const traps = [
    ["🪤", "스파이크 함정", `x${workshop > 30 ? 4 : 2}`, "설치됨"],
    ["🪢", "와이어 함정", `x${workshop > 50 ? 2 : 1}`, "설치됨"],
    ["🔥", "화염병 함정", `x${state.resources.parts >= 3 ? 2 : 1}`, "설치됨"],
    ["🚧", "바리케이드", `x3`, `내구도 ${Math.max(20, wall - 4)}%`],
    ["🔫", "자동 포탑", power > 40 ? "x1" : "x0", power > 40 ? `탄약 ${Math.min(99, state.resources.ammo * 6)}%` : "전력 부족"],
    ["💡", "서치라이트", "x1", `전력 ${power}%`],
  ];
  for (const [ico, name, cnt, st] of traps) trapGrid.appendChild(el("div", "trap-card",
    `<div class="tp-ico">${ico}</div><div class="tp-name">${name}</div><div class="tp-cnt">${cnt}</div><div class="tp-st">${st}</div>`));
  const repairQ = el("div", "repair-q");
  const broken = Object.entries(state.facilities).filter(([, f]) => f.durability < 100)
    .sort((a, b) => a[1].durability - b[1].durability).slice(0, 3);
  repairQ.innerHTML = `<div class="sb-t">수리 대기열</div>` + (broken.length
    ? broken.map(([k, f]) => `<div class="sb-row"><span>${FACILITY_ICON[k]} ${FACILITIES[k].name}</span><b>${Math.ceil((100 - f.durability) / 25) * 1}h</b></div>`).join("")
    : `<div class="sb-note">모든 시설 정상</div>`);
  const rq = el("button", "sv-btn", "모두 수리 시작");
  rq.onclick = () => H.repairAll();
  repairQ.appendChild(rq);
  const trapWrap = el("div", "trap-wrap");
  trapWrap.appendChild(trapGrid); trapWrap.appendChild(repairQ);
  const trapPanel = panel("함정 및 방어 시설 관리", `설치 완료 ${workshop > 50 ? 8 : 5}/10`, trapWrap);

  // 사건 기록 (타임스탬프)
  const ev = el("div", "log-list");
  const evLogs = [...(state.log || [])];
  const lastNight = state.history?.[0]?.night;
  if (lastNight) for (const e of (lastNight.effects || []).slice(0, 2)) evLogs.push({ t: "info", m: `(전날 밤) ${e}` });
  let hh = 17, mm = 12;
  const evRows = evLogs.slice(0, 5).map(l => {
    const time = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    hh -= 1; mm = (mm + 34) % 60;
    const cls = l.t === "warn" ? "warn" : l.t === "danger" ? "danger" : "";
    return `<div class="log-row ${cls}"><span class="log-time">${time}</span><span>${l.m}</span></div>`;
  }).join("");
  ev.innerHTML = evRows || `<div class="rec-empty">기록 없음</div>`;
  const evPanel = panel("사건 기록", "전체 기록 보기", ev);

  grid.appendChild(col(mapPanel, state._defTab === "wall" ? trapPanel : evPanel));

  // ---- 중: 방어 상태 + (경계 배치 | 함정 관리) ----
  const ds = el("div");
  const rows = [
    ["🧱", "방벽 내구도", wall], ["🚪", "출입문 무결성", door], ["⚡", "전력 공급", power],
  ];
  for (const [ico, name, val] of rows) ds.appendChild(el("div", "stat-row",
    `<span class="sr-ico">${ico}</span><span class="sr-name">${name}</span>
     <div class="bar"><i class="${barCls(val)}" style="width:${val}%"></i></div><span class="sr-val">${val}%</span>`));
  ds.appendChild(el("div", "stat-row", `<span class="sr-ico">🔫</span><span class="sr-name">탄약 보유량</span>
    <div class="bar"><i class="hi" style="width:${clamp(state.resources.ammo * 6, 0, 100)}%"></i></div><span class="sr-val">${state.resources.ammo}</span>`));
  ds.appendChild(el("div", "stat-row alarm", `<span class="sr-ico">🟢</span><span class="sr-name">경보 시스템</span>
    <span class="sr-tag ${power > 40 ? "ok" : "bad"}">${power > 40 ? "정상" : "정지"}</span><small class="sr-small">사이렌/경보등/감지기</small>`));
  const dsPanel = panel("방어 상태", "", ds);
  dsPanel._body.appendChild(el("div", "def-fc-row", `<span>예상 야간 위협</span>`));
  dsPanel._body.appendChild(forecastNode(state, true));

  const gb = el("div", "sv-list");
  if (!defenders.length) gb.appendChild(el("div", "exped-empty", "⚠ 방어 인원이 없습니다! 탐사팀을 줄이세요."));
  for (const sv of defenders) gb.appendChild(survivorCard(state, sv, { assignable: true }));
  const guardPanel = panel("경계 배치", `${defenders.length}/${aliveSurvivors(state).length} 배치됨`, gb);
  grid.appendChild(col(dsPanel, state._defTab === "wall" ? facilityMgmtPanel(state) : guardPanel));

  // ---- 우: 야간 위협 예측 + 야간 시간대 + 타로 지원 + 작전 명령 ----
  const tp = el("div");
  const base = state.lastThreatForecast?.power || 20;
  const threats = [
    { ico: "🦹", name: "약탈자", n: state.resources.food + state.resources.materials > 18 ? 4 : 2 },
    { ico: "🧟", name: "감염자 군집", n: state.lastNoise > 20 ? 4 : 2 },
    { ico: "🧪", name: "특수 감염자", n: base > 50 ? 3 : 1 },
    { ico: "🔥", name: "화재 발생 위험", n: power < 50 ? 3 : 1 },
    { ico: "⛈️", name: "폭풍 / 악천후", n: 2 },
  ];
  for (const t of threats) tp.appendChild(el("div", "threat-row",
    `<span class="tr-ico">${t.ico}</span><span class="tr-name">${t.name}</span>
     <span class="tr-lvl ${t.n >= 3 ? "warn-red" : ""}">${t.n >= 4 ? "높음" : t.n >= 2 ? "중간" : "낮음"}</span>
     <span class="skulls">${skulls(t.n)}</span>`));
  const successP = clamp(Math.round(42 + (base - (defenders.length * 12 + wall * .2))), 5, 90);
  tp.appendChild(el("div", "threat-row total", `<span class="tr-ico">⏱</span><span class="tr-name">침입 성공 확률</span>
    <span class="tr-lvl warn-red big">${successP}%</span>`));
  const tpPanel = panel("야간 위협 예측", `위협력 ${base}`, tp);

  // 야간 시간대 타임라인
  const tl = el("div", "timeline");
  const times = ["해질녘<br>18:00", "초저녁<br>20:00", "자정<br>00:00", "새벽<br>03:00", "해뜨기 전<br>05:00", "새벽<br>07:00"];
  tl.innerHTML = `<div class="tl-track">${times.map((t, i) => `<div class="tl-tick" style="left:${i * 20}%"><i></i><span>${t}</span></div>`).join("")}</div>`;
  const tlEvents = [];
  if (state.resources.food + state.resources.materials > 18) tlEvents.push({ x: 10, ico: "🔭", t: "약탈자 정찰<br>가능성 높음" });
  if (state.lastNoise > 12) tlEvents.push({ x: 42, ico: "☠", t: "감염자 군집<br>공격 가능" });
  else tlEvents.push({ x: 42, ico: "🌫", t: "조용한 밤<br>예상" });
  if (power < 60) tlEvents.push({ x: 64, ico: "🌀", t: "강풍/정전<br>가능성 증간" });
  tlEvents.push({ x: 84, ico: "🧪", t: base > 45 ? "특수 감염자<br>출현 가능" : "위협 감소<br>예상" });
  for (const e of tlEvents) {
    const m = el("div", "tl-event"); m.style.left = e.x + "%";
    m.innerHTML = `<div class="tl-dot">${e.ico}</div><div class="tl-lbl">${e.t}</div>`;
    tl.appendChild(m);
  }
  const tlPanel = panel("야간 시간대", "", tl);

  // 타로 지원
  const support = el("div", "support-cards");
  for (const c of state.cards) {
    const vis = TAROT_VIS[c.id] || { symbol: "✦" };
    const assignedTo = state.assignments[c.id];
    const sv = assignedTo ? state.survivors.find(s => s.id === assignedTo) : null;
    const sd = el("div", "support-card" + (sv ? " used" : ""));
    sd.innerHTML = `<div class="sp-art">${vis.symbol}</div>
      <div class="sp-body"><div class="sp-name">${c.korean}</div><div class="sp-desc">${c.desc.split("/")[0].trim()}</div>
      <div class="sp-eff">효과 시간: 오늘 밤</div></div>`;
    const b = el("button", "tc-apply", sv ? `▸ ${sv.name}` : "적용하기");
    b.onclick = () => H.pickCard(c.id);
    sd.appendChild(b);
    support.appendChild(sd);
  }
  const spPanel = panel("타로 지원", `지원 카드 (${Object.values(state.assignments).filter(Boolean).length}/3)`, support);

  // 작전 명령
  const cta = el("div", "cta-stack");
  const endBtn = el("button", "cta-main cta-olive");
  endBtn.innerHTML = `하루 종료 — 방어 준비<span class="cta-sub">선택된 배치로 야간 방어 시작</span>`;
  endBtn.onclick = () => H.endDay();
  cta.appendChild(endBtn);
  const row = el("div", "cta-row");
  const expBtn = el("button", "cta-amber", "경계 강화\n(탐사 재편성)");
  expBtn.onclick = () => H.navTo("expedition");
  const repairBtn = el("button", "cta-red", "긴급 수리");
  repairBtn.onclick = () => H.repairAll();
  row.appendChild(expBtn); row.appendChild(repairBtn);
  cta.appendChild(row);
  if (!defenders.length) cta.appendChild(el("div", "action-note warn", "⚠ 방어 인원 0명 — 야간 피해가 커집니다."));
  const ctaPanel = panel("작전 명령", "", cta);

  grid.appendChild(col(tpPanel, tlPanel, spPanel, ctaPanel));
  v.appendChild(grid);
  return v;
}
function facilityMgmtPanel(state) {
  return panel("방벽 · 시설 관리", "자재 2 → 수리 +25", facilityRows(state, true));
}

// ===================== 생존자 화면 =====================
function viewSurvivors(state) {
  const v = el("div", "view");
  const pop = aliveSurvivors(state).length;
  v.appendChild(viewHeadNode("생존자", `${pop}명 / 7 · 합류 대기 ${remainingRecruits(state)}명`));
  const grid = el("div", "view-grid");
  grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(290px, 1fr))";
  for (const sv of state.survivors) grid.appendChild(survivorCard(state, sv, { detail: true, team: true, assignable: true }));
  v.appendChild(grid);
  return v;
}

// ===================== 타로 화면 =====================
function viewTarot(state) {
  const v = el("div", "view");
  v.appendChild(viewHeadNode("타로 지원", "하루 3장 · 리롤 없음 · 캐릭터별 변환"));
  const cardsBox = el("div", "tarot-cards lg");
  for (const c of state.cards) cardsBox.appendChild(tarotCardEl(state, c, { applyBtn: true }));
  const cp = panel("오늘의 카드", `${Object.values(state.assignments).filter(Boolean).length}/3 배정`, cardsBox);
  cp._body.appendChild(el("div", "tarot-help", state._pickCard
    ? "배정할 생존자를 탭하세요. (카드를 다시 탭하면 취소)"
    : "적용하기 → 생존자 선택, 또는 카드를 드래그하세요."));
  v.appendChild(cp);

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

  const grid = el("div", "view-grid");
  grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(270px, 1fr))";
  for (const sv of aliveSurvivors(state)) grid.appendChild(survivorCard(state, sv, { assignable: true }));
  v.appendChild(panel("생존자 — 배정 대상", "카드를 끌어다 놓으세요", grid));
  return v;
}

// ===================== 기록 화면 =====================
function viewRecords(state) {
  const v = el("div", "view");
  v.appendChild(viewHeadNode("기록", "클라우드 플레이 기록"));
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
export function showRecords() { H.navTo && H.navTo("records"); }
export function hideRecords() { $("#records-modal")?.classList.remove("active"); }

export function showScreen(id) {
  if (id === "title-screen") { $("#title-screen").classList.add("active"); $("#app").classList.remove("active"); }
  else { $("#title-screen").classList.remove("active"); $("#app").classList.add("active"); }
}

export function toast(msg) {
  let t = $("#toast");
  if (!t) { t = el("div"); t.id = "toast"; document.body.appendChild(t);
    t.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#241e14;border:1px solid #4a3e2c;color:#d9cbac;padding:10px 20px;border-radius:8px;z-index:99999;font-size:.88rem;box-shadow:0 6px 20px rgba(0,0,0,.5);transition:opacity .3s;"; }
  t.textContent = msg; t.style.opacity = "1";
  clearTimeout(t._t); t._t = setTimeout(() => { t.style.opacity = "0"; }, 1600);
}
