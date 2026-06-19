// ============================================================================
// ui.js — DOM 렌더링 + 상호작용 (대시보드, 드래그앤드롭 카드 배정, 리포트)
// 상태(state)를 받아 그리고, 사용자 입력은 handlers 콜백으로 전달한다.
// ============================================================================
import {
  STAT_LABEL, RESOURCE_LABEL, ROLE_LABEL, TRAIT_LABEL, REGIONS, DEPTHS,
  RESOURCE_ICON, ROLE_ICON, STAT_ICON, REGION_ICON, FACILITY_ICON,
  THREAT_ICON, DEPTH_ICON, TAROT_VIS,
} from "./data.js";
import { previewExpedition, aliveSurvivors, convertCardForSurvivor } from "./engine.js";

const $ = sel => document.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

let H = {}; // handlers
export function bindHandlers(handlers) { H = handlers; }

const LOW_RES = { food: 2, water: 2, medicine: 1, materials: 2 };

// 생존자 id로 안정적인 아바타 색상(hue) 생성
function avatarHue(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

// ---------------------------------------------------------------------------
export function render(state) {
  $("#day-num").textContent = `DAY ${state.day}`;
  renderResources(state);
  renderThreat(state);
  renderFacilities(state);
  renderTarot(state);
  renderSurvivors(state);
  renderExpedition(state);
  renderHistory(state);
  renderActionState(state);
}

function renderResources(state) {
  const bar = $("#resource-bar"); bar.innerHTML = "";
  for (const [k, label] of Object.entries(RESOURCE_LABEL)) {
    const v = state.resources[k] ?? 0;
    const low = LOW_RES[k] != null && v <= LOW_RES[k];
    const chip = el("div", "res-chip" + (low ? " low" : ""));
    const display = k === "morale" ? Math.round(v) : v;
    chip.innerHTML = `<span class="res-ico">${RESOURCE_ICON[k] || ""}</span><span class="lbl">${label}</span><span class="val">${display}</span>`;
    chip.title = label;
    bar.appendChild(chip);
  }
}

function renderThreat(state) {
  const p = $("#panel-threat");
  const fc = state.lastThreatForecast || { label: "—", power: 0 };
  const lvlClass = fc.label.startsWith("매우") ? "매우" : fc.label;
  const morale = Math.round(state.resources.morale);
  p.innerHTML = `
    <h3>오늘 밤 위협 <span class="sub">예고</span></h3>
    <div class="threat-fc">
      <span class="lvl ${lvlClass}">${fc.label}</span>
      <span class="mini-note">위협력 ≈ ${fc.power}</span>
    </div>
    <div class="field-label">캠프 사기 ${morale}/100</div>
    <div class="morale-bar"><div class="morale-fill" style="width:${morale}%"></div></div>
    <div class="mini-note">탐사 인원이 많을수록 야간 방어가 약해집니다. 소음·보유 자원이 위협을 키웁니다.</div>
  `;
}

function renderFacilities(state) {
  const p = $("#panel-facilities");
  p.innerHTML = `<h3>시설 <span class="sub">자재 2 → 수리 +25</span></h3>`;
  const names = { quarters: "숙소", storage: "창고", workshop: "작업장", infirmary: "의무실", purifier: "정수", wall: "방벽", power: "전력" };
  for (const [k, fac] of Object.entries(state.facilities)) {
    const d = Math.round(fac.durability);
    const cls = d > 60 ? "hi" : d > 30 ? "mid" : "lo";
    const row = el("div", "fac-row");
    row.innerHTML = `
      <span class="fac-ico">${FACILITY_ICON[k] || "▪"}</span>
      <span class="fac-name">${names[k]}</span>
      <div class="fac-bar"><i class="${cls}" style="width:${d}%"></i></div>
      <span class="fac-val">${d}%</span>`;
    const btn = el("button", "fac-fix", "수리");
    btn.disabled = d >= 100 || state.resources.materials < 2;
    btn.onclick = () => H.repair(k);
    row.appendChild(btn);
    p.appendChild(row);
  }
}

function renderTarot(state) {
  const p = $("#panel-tarot");
  p.innerHTML = `<h3>오늘의 타로 <span class="sub">하루 3장 · 리롤 없음</span></h3>`;
  const wrap = el("div", "tarot-cards");
  for (const card of state.cards) {
    const assignedTo = Object.entries(state.assignments).find(([cid]) => cid === card.id)?.[1];
    const sv = assignedTo ? state.survivors.find(s => s.id === assignedTo) : null;
    const vis = TAROT_VIS[card.id] || { numeral: "", symbol: "✦" };
    const c = el("div", "tcard" + (sv ? " assigned" : ""));
    c.draggable = true;
    c.dataset.cardId = card.id;
    c.innerHTML = `
      <div class="tc-frame">
        <div class="tc-top"><span class="tc-num">${vis.numeral}</span><span class="tc-num">${vis.numeral}</span></div>
        <div class="tc-symbol">${vis.symbol}</div>
        <div class="tc-name">${card.name}</div>
        <div class="tc-kr">${card.korean}</div>
        <div class="tc-tags">${card.tags.map(t => `<span class="tc-tag">${t}</span>`).join("")}</div>
        ${sv ? `<div class="tc-assignee">▸ ${sv.name}</div>` : `<div class="tc-desc">${card.desc}</div>`}
      </div>`;
    c.addEventListener("dragstart", e => { e.dataTransfer.setData("text/card", card.id); c.classList.add("dragging"); });
    c.addEventListener("dragend", () => c.classList.remove("dragging"));
    // 클릭(모바일): 배정 선택 모드
    c.addEventListener("click", () => H.pickCard(card.id));
    if (state._pickCard === card.id) c.style.outline = "2px solid var(--accent)";
    wrap.appendChild(c);
  }
  p.appendChild(wrap);
  const help = el("div", "tarot-help", state._pickCard
    ? "배정할 생존자를 탭하세요. (카드를 다시 탭하면 취소)"
    : "카드를 생존자에게 드래그하거나, 카드를 탭한 뒤 생존자를 탭하세요.");
  p.appendChild(help);
}

function renderSurvivors(state) {
  const p = $("#panel-survivors");
  const count = aliveSurvivors(state).length;
  p.innerHTML = `<h3>생존자 ${count}명 <span class="sub">탐사팀 = 밤 방어 약화</span></h3>`;
  const list = el("div", "sv-list");
  const onTeam = new Set(state.plan.team);
  for (const sv of state.survivors) {
    const card = el("div", "sv-card" + (sv.alive ? "" : " dead") + (onTeam.has(sv.id) ? " on-team" : ""));
    card.dataset.svId = sv.id;
    const traits = sv.traits.map(t => TRAIT_LABEL[t] || t).join(", ");
    const statHtml = ["strength", "agility", "intelligence", "hp", "mental", "charisma"]
      .map(k => `<span title="${STAT_LABEL[k]}">${STAT_ICON[k]} <b>${sv.stats[k]}</b></span>`).join("");
    const assigned = Object.entries(state.assignments).filter(([, id]) => id === sv.id).map(([cid]) => cid);
    const cardChips = assigned.map(cid => {
      const c = state.cards.find(x => x.id === cid);
      return c ? `<span class="mini-card" data-card="${cid}" title="배정 취소">${c.name} ✕</span>` : "";
    }).join("");

    const hue = avatarHue(sv.id);
    card.innerHTML = `
      <div class="sv-head">
        <span class="sv-avatar" style="background:hsl(${hue} 40% 30%);border-color:hsl(${hue} 50% 45%)">
          ${sv.name.charAt(0)}<span class="sv-rolebadge">${ROLE_ICON[sv.role] || ""}</span>
        </span>
        <span class="sv-name">${sv.name}</span>
        <span class="sv-role">${ROLE_LABEL[sv.role]}</span>
        <span class="sv-traits">${traits}</span>
      </div>
      <div class="sv-stats">${statHtml}</div>
      <div class="sv-cond">
        <span class="cond-pip injury">부상 <b>${Math.round(sv.condition.injury)}</b></span>
        <span class="cond-pip fatigue">피로 <b>${Math.round(sv.condition.fatigue)}</b></span>
        <span class="cond-pip infection">감염 <b>${Math.round(sv.condition.infection)}</b></span>
      </div>
      <div class="sv-cards">${cardChips}</div>
      <div class="sv-actions">
        <button class="sv-btn team-btn ${onTeam.has(sv.id) ? "active" : ""}">${onTeam.has(sv.id) ? "탐사팀 ✓" : "탐사 보내기"}</button>
        <span class="assign-pop">${onTeam.has(sv.id) ? "" : "캠프 방어"}</span>
      </div>`;

    if (!sv.alive) { list.appendChild(card); continue; }

    // 팀 토글
    card.querySelector(".team-btn").onclick = () => H.toggleTeam(sv.id);
    // 미니카드 클릭 → 배정 취소
    card.querySelectorAll(".mini-card").forEach(mc => {
      mc.onclick = e => { e.stopPropagation(); H.unassignCard(mc.dataset.card); };
    });
    // 드롭존
    card.addEventListener("dragover", e => { e.preventDefault(); card.classList.add("dropzone"); });
    card.addEventListener("dragleave", () => card.classList.remove("dropzone"));
    card.addEventListener("drop", e => {
      e.preventDefault(); card.classList.remove("dropzone");
      const cid = e.dataTransfer.getData("text/card");
      if (cid) H.assignCard(cid, sv.id);
    });
    // 클릭(모바일 배정 선택 모드)
    card.addEventListener("click", e => {
      if (e.target.closest("button") || e.target.closest(".mini-card")) return;
      if (state._pickCard) H.assignCard(state._pickCard, sv.id);
    });
    if (state._pickCard) card.style.cursor = "pointer";
    list.appendChild(card);
  }
  p.appendChild(list);
}

function renderExpedition(state) {
  const p = $("#panel-expedition");
  p.innerHTML = `<h3>탐사 준비 <span class="sub">팀·지역·깊이·카드</span></h3>`;

  // 지역
  const regField = el("div", "field");
  regField.innerHTML = `<div class="field-label">탐사 지역</div>`;
  const regList = el("div", "region-list");
  for (const r of REGIONS) {
    const dz = r.danger < 35 ? "dz-low" : r.danger < 60 ? "dz-mid" : "dz-hi";
    const opt = el("div", "region-opt" + (state.plan.regionId === r.id ? " sel" : ""));
    opt.innerHTML = `<span class="r-ico">${REGION_ICON[r.id] || "📍"}</span>
      <span class="r-name">${r.name}</span>
      <span class="r-danger ${dz}">위험 ${r.danger}</span>
      <span class="r-desc">${r.desc}</span>`;
    opt.onclick = () => H.selectRegion(r.id);
    regList.appendChild(opt);
  }
  regField.appendChild(regList);
  p.appendChild(regField);

  // 깊이
  const depthField = el("div", "field");
  depthField.innerHTML = `<div class="field-label">파밍 성향</div>`;
  const depthRow = el("div", "depth-row");
  for (const d of DEPTHS) {
    const opt = el("div", "depth-opt" + (state.plan.depthId === d.id ? " sel" : ""));
    opt.innerHTML = `<span class="d-ico">${DEPTH_ICON[d.id] || ""}</span>${d.name}<small>×${d.lootMult}</small>`;
    opt.title = d.desc;
    opt.onclick = () => H.selectDepth(d.id);
    depthRow.appendChild(opt);
  }
  depthField.appendChild(depthRow);
  p.appendChild(depthField);

  // 4개 게이지 (GDD 5.3)
  const preview = previewExpedition(state);
  const g = el("div", "field");
  g.innerHTML = `<div class="field-label">예측 (4개 게이지)</div>`;
  if (!preview) {
    g.appendChild(el("div", "exped-empty", "탐사팀에 생존자를 1명 이상 배치하세요."));
  } else {
    const gauges = el("div", "gauges");
    gauges.appendChild(gauge("g-loot", "예상 보상", preview.expectedLoot, 16, preview.expectedLoot));
    gauges.appendChild(gauge("g-noise", "소음", preview.noise, 60));
    gauges.appendChild(gauge("g-fatigue", "피로 누적", preview.fatigue, 60));
    gauges.appendChild(gauge("g-return", "귀환 위험", preview.returnRisk, 100, preview.returnRisk + "%"));
    gauges.appendChild(gauge("g-injury", "부상 확률", preview.injuryChance, 100, preview.injuryChance + "%"));
    g.appendChild(gauges);
    g.appendChild(el("div", "exped-power",
      `탐사력 <b>${preview.power}</b> · 은신 ${preview.stealth} · 팀 ${preview.team.map(s => s.name).join(", ")}`));
  }
  p.appendChild(g);
}

function gauge(cls, label, value, max, valLabel) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const row = el("div", "gauge-row " + cls);
  row.innerHTML = `
    <div class="gauge-top"><span>${label}</span><b>${valLabel != null ? valLabel : value}</b></div>
    <div class="gauge-track"><i style="width:${pct}%"></i></div>`;
  return row;
}

function renderHistory(state) {
  const p = $("#panel-history");
  p.innerHTML = `<h3>지난 기록 <span class="sub">최근 ${Math.min(6, state.history.length)}일</span></h3>`;
  if (!state.history.length) { p.appendChild(el("div", "mini-note", "아직 기록이 없습니다.")); return; }
  for (const r of state.history.slice(0, 6)) {
    const exp = r.exped ? `${r.exped.region}/${r.exped.depth}` : "탐사 없음";
    const night = r.night ? `${r.night.threat}(${r.night.tier})` : "—";
    p.appendChild(el("div", "hist-item", `<b>DAY ${r.day}</b> · ${exp} · 야간 ${night}`));
  }
}

function renderActionState(state) {
  const hint = $("#action-hint");
  const btn = $("#btn-run");
  const team = state.plan.team.length;
  const assigned = Object.values(state.assignments).filter(Boolean).length;
  if (team === 0) {
    hint.textContent = "⚠ 탐사팀이 비어 있습니다. 탐사를 건너뛰고 전원 방어에 집중할 수도 있습니다.";
  } else {
    hint.textContent = `탐사팀 ${team}명 · 카드 ${assigned}/3 배정됨. 준비되면 하루를 실행하세요.`;
  }
  btn.disabled = false;
}

// ---------------------------------------------------------------------------
// 리포트 모달 (GDD 11.3)
// ---------------------------------------------------------------------------
export function showReport(state, report) {
  $("#report-title").textContent = `DAY ${report.day} REPORT`;
  const body = $("#report-body"); body.innerHTML = "";

  // 아침 로그
  if (state.log && state.log.length) {
    const sec = section("아침 / 정산");
    for (const l of state.log) sec.appendChild(line(l.m, l.t === "warn" ? "warn" : l.t === "danger" ? "danger" : ""));
    body.appendChild(sec);
  }

  // 탐사
  if (report.exped) {
    const e = report.exped;
    const sec = section("탐사");
    sec.appendChild(line(`${e.region} / ${e.depth} / ${e.team.join(", ")}`));
    sec.appendChild(line(`이벤트: ${e.event.text} ${e.event.result}`, "warn"));
    const gains = Object.entries(e.gained).filter(([, v]) => v > 0)
      .map(([k, v]) => `<span>${RESOURCE_LABEL[k] || k} +${v}</span>`).join("");
    const gl = el("div", "rep-line"); gl.innerHTML = `획득: <span class="rep-gain">${gains || "<span>—</span>"}</span>`;
    sec.appendChild(gl);
    if (e.recruited) sec.appendChild(line(`🙋 ${e.recruited}이(가) 캠프에 합류했다! (사기 +6)`, "good"));
    if (e.injuries.length) for (const inj of e.injuries) sec.appendChild(line(inj, "danger"));
    sec.appendChild(line(`소음 ${e.noise} · 부상확률 ${e.injuryChance}% · 귀환위험 ${e.returnRisk}%`));
    body.appendChild(sec);
  } else {
    const sec = section("탐사");
    sec.appendChild(line("이번 날은 탐사를 보내지 않았다 (전원 캠프 방어)."));
    body.appendChild(sec);
  }

  // 타로 영향
  if (report.tarot && report.tarot.length) {
    const sec = section("타로 영향");
    for (const t of report.tarot) {
      const eff = Object.entries(t.conv.effects).filter(([k]) => k !== "variance")
        .map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v}`).join(", ");
      const di = el("div", "tarot-impact");
      di.innerHTML = `<b>${t.card}</b> → ${t.survivor}: ${eff || "효과 변환"}${t.conv.notes.length ? ` ⚠ ${t.conv.notes.join("; ")}` : ""}`;
      sec.appendChild(di);
    }
    body.appendChild(sec);
  }

  // 야간 방어
  if (report.night) {
    const n = report.night;
    const sec = section("야간 방어");
    const tb = el("div", "rep-line");
    const tIcon = report.night.icon || threatIconByName(n.threat);
    tb.innerHTML = `<span class="rep-threat-ico">${tIcon}</span> ${n.threat} <span class="tier-badge tier-${n.tier}">${tierLabel(n.tier)}</span>`;
    sec.appendChild(tb);
    sec.appendChild(line(`방어력 ${n.defensePower} vs 위협력 ${n.threatPower} → 피해도 ${n.lossSeverity}`));
    for (const ef of n.effects) sec.appendChild(line(ef, ef.includes("사망") ? "danger" : ""));
    body.appendChild(sec);
  }

  // 내일 경고
  const fc = state.lastThreatForecast;
  if (fc) {
    const sec = section("내일 경고");
    sec.appendChild(line(`다음 날 위협 예고: ${fc.label}. 방어와 자원을 점검하세요.`));
    body.appendChild(sec);
  }

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

export function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $("#" + id).classList.add("active");
}

// ---------------------------------------------------------------------------
// 인증 UI (구글 로그인) — 상단바 칩 + 타이틀 영역
// authState: { enabled, user, profile }
// ---------------------------------------------------------------------------
const GOOGLE_LOGO = `<svg class="g-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

export function renderAuth(authState) {
  const chip = $("#auth-chip");
  const titleAuth = $("#title-auth");
  const recBtn = $("#btn-records");
  if (!authState.enabled) {
    // 클라우드 미설정/비활성 → 인증 UI 숨김, 오프라인 안내
    chip.innerHTML = "";
    if (recBtn) recBtn.style.display = "none";
    titleAuth.innerHTML = `<span class="cloud-note">오프라인 모드 — 진행은 이 브라우저에 저장됩니다.</span>`;
    return;
  }
  if (recBtn) recBtn.style.display = "";
  const u = authState.user;
  if (u) {
    const best = authState.profile && authState.profile.bestDays ? `최고 ${authState.profile.bestDays}일` : "";
    const avatar = u.photoURL ? `<img src="${u.photoURL}" alt="" referrerpolicy="no-referrer" />` : "";
    chip.innerHTML = `${avatar}<span class="au-name">${u.displayName || u.email || "플레이어"}</span>
      ${best ? `<span class="au-best">${best}</span>` : ""}
      <button class="btn-mini au-out" id="au-signout">로그아웃</button>`;
    chip.querySelector("#au-signout").onclick = () => H.signOut();
    titleAuth.innerHTML = `<div class="au-signed">${avatar}<span>${u.displayName || u.email}님 — 클라우드 동기화 켜짐</span></div>
      <button class="btn-mini au-out" id="au-signout2">로그아웃</button>`;
    titleAuth.querySelector("#au-signout2").onclick = () => H.signOut();
  } else {
    chip.innerHTML = `<button class="btn-google" id="au-signin-mini">${GOOGLE_LOGO}로그인</button>`;
    chip.querySelector("#au-signin-mini").onclick = () => H.signIn();
    titleAuth.innerHTML = `<button class="btn-google" id="au-signin">${GOOGLE_LOGO}Google로 로그인</button>
      <span class="cloud-note">로그인하면 진행과 기록이 클라우드에 저장됩니다 (선택).</span>`;
    titleAuth.querySelector("#au-signin").onclick = () => H.signIn();
  }
}

// ---------------------------------------------------------------------------
// 기록 모달
// ---------------------------------------------------------------------------
export function showRecords(state) {
  const body = $("#records-body");
  if (state.loading) { body.innerHTML = `<div class="rec-empty">불러오는 중…</div>`; }
  else if (!state.enabled) { body.innerHTML = `<div class="rec-empty">클라우드 기록은 로그인 시 사용할 수 있습니다.</div>`; }
  else if (!state.user) { body.innerHTML = `<div class="rec-empty">Google 로그인 후 기록이 저장됩니다.</div>`; }
  else {
    const runs = state.runs || [];
    const best = state.profile?.bestDays || (runs.length ? Math.max(...runs.map(r => r.daysSurvived || 0)) : 0);
    const total = state.profile?.totalRuns ?? runs.length;
    let html = `<div class="rec-summary">
      <div class="rec-stat"><div class="v">${best}</div><div class="l">최고 생존일</div></div>
      <div class="rec-stat"><div class="v">${total}</div><div class="l">총 플레이</div></div>
    </div>`;
    if (!runs.length) html += `<div class="rec-empty">아직 완료된 게임 기록이 없습니다.</div>`;
    else {
      for (const r of runs) {
        const date = r.endedAt && r.endedAt.seconds
          ? new Date(r.endedAt.seconds * 1000).toLocaleDateString("ko-KR") : "";
        const res = r.result === "over" ? "캠프 붕괴" : "진행 중";
        html += `<div class="rec-row">
          <span class="rec-day">${r.daysSurvived || 0}일</span>
          <span class="rec-res">${res} · 생존자 ${r.survivors ?? 0}명</span>
          <span class="rec-date">${date}</span>
        </div>`;
      }
    }
    body.innerHTML = html;
  }
  $("#records-modal").classList.add("active");
}
export function hideRecords() { $("#records-modal").classList.remove("active"); }

export function toast(msg) {
  const hint = $("#action-hint");
  const prev = hint.textContent;
  hint.textContent = msg;
  hint.style.color = "var(--accent)";
  setTimeout(() => { hint.style.color = ""; }, 1400);
}
