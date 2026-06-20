// 브라우저 통합 테스트 — jsdom으로 AFTERFALL 멀티 스크린 흐름을 구동한다.
import { JSDOM } from "jsdom";
import { readFileSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const html = readFileSync(resolve(root, "public/index.html"), "utf8");

let failures = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) failures++; };

const dom = new JSDOM(html, { url: "https://acs.test/", runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;
global.window = window; global.document = window.document; global.localStorage = window.localStorage;
window.confirm = () => true;

await import(pathToFileURL(resolve(root, "public/js/main.js")).href);

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const click = elm => elm && elm.dispatchEvent(new window.Event("click", { bubbles: true }));
const nav = label => click($$(".nav-item").find(b => b.textContent.includes(label)));
const ctaByText = txt => $$(".cta-main").find(b => b.textContent.includes(txt));

console.log("▶ AFTERFALL 통합 테스트");

// 1) 타이틀 → 새 게임
ok($("#title-screen").classList.contains("active"), "타이틀 화면 표시");
click($("#btn-new"));
ok($("#app").classList.contains("active"), "새 게임 → 앱 셸 활성화");
ok($("#day-num").textContent.includes("DAY 1"), "DAY 1 표시");
ok($("#resource-bar").children.length === 6, `상단 자원 칩 6종 (${$("#resource-bar").children.length})`);
ok($$(".nav-item").length === 6, "사이드바 6개 메뉴");

// 2) 쉘터 화면 기본 렌더
ok($$(".fac-row").length === 7, `시설 7종 (${$$(".fac-row").length})`);
ok($$(".sv-card").length === 3, `시작 생존자 3명 (${$$(".sv-card").length})`);
ok($$(".tcard").length === 3, `타로 카드 3장 (${$$(".tcard").length})`);

// 3) 탐사 화면 → 팀 편성 + 지역/깊이 + 카드
nav("탐사");
ok($(".region-grid") !== null, "탐사 화면: 지역 지도 렌더");
const teamBtns = $$(".team-btn");
ok(teamBtns.length === 3, `팀 토글 버튼 3개 (${teamBtns.length})`);
click(teamBtns[0]); click(teamBtns[1]);
ok($$(".sv-card.on-team").length === 2, "탐사팀 2명 편성");
click($$(".region-card")[2]);
ok($$(".region-card")[2].classList.contains("sel"), "지역 선택 반영");
click($$(".depth-opt")[2]);
ok($$(".depth-opt")[2].classList.contains("sel"), "파밍 깊이 선택 반영");
ok($$(".gauge-row").length >= 4, "4개 게이지 미리보기");

// 4) 카드 배정 (탭 모드)
click($(".tcard"));
click($(".sv-card"));
ok($$(".mini-card").length >= 1, "카드 배정(미니카드 표시)");

// 5) 방어 화면 → 하루 종료
nav("방어");
ok($(".threat-row") !== null, "방어 화면: 야간 위협 예측 렌더");
const endBtn = ctaByText("하루 종료");
ok(!!endBtn, "하루 종료 CTA 존재");
click(endBtn);
ok($("#report-modal").classList.contains("active"), "하루 종료 → 보고 모달 표시");
ok($("#report-body").children.length > 0, "보고 내용 렌더");
ok($("#report-title").textContent.includes("DAY 1"), "보고 제목 DAY 1");

// 6) 다음 날
click($("#btn-report-close"));
ok(!$("#report-modal").classList.contains("active"), "보고 닫힘");
ok($("#day-num").textContent.includes("DAY 2"), "다음 날(DAY 2) 진행");

// 7) 생존자/타로/기록 화면 라우팅
nav("생존자");
ok($(".sv-stats") !== null, "생존자 화면: 상세 스탯 렌더");
nav("타로");
ok($$(".tcard").length === 3, "타로 화면: 카드 3장");
nav("기록");
ok($(".view-title").textContent.includes("기록"), "기록 화면 라우팅");

// 8) 저장
click($("#btn-save"));
ok(!!window.localStorage.getItem("acs_save_v1"), "localStorage 저장됨");

console.log(`\n${failures === 0 ? "✔ 모든 UI 통합 테스트 통과" : "✗ " + failures + "개 실패"}`);
process.exit(failures === 0 ? 0 : 1);
