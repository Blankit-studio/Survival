// 브라우저 통합 테스트 — jsdom으로 실제 index.html + main.js/ui.js를 로드하고
// 새 게임 → 카드 배정 → 탐사팀 편성 → 하루 실행 → 리포트까지 구동한다.
import { JSDOM } from "jsdom";
import { readFileSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const html = readFileSync(resolve(root, "public/index.html"), "utf8");

let failures = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) failures++; };

// http origin 사용 (file:// 은 opaque origin이라 localStorage가 차단됨)
const dom = new JSDOM(html, {
  url: "https://acs.test/",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const { window } = dom;
global.window = window;
global.document = window.document;
global.localStorage = window.localStorage;
// jsdom은 dataTransfer/draggable 일부 미지원 → 클릭 경로로 테스트
window.confirm = () => true;

// ES 모듈을 직접 import (모듈은 document 전역을 사용)
const main = await import(pathToFileURL(resolve(root, "public/js/main.js")).href);

const $ = s => document.querySelector(s);
const click = el => el && el.dispatchEvent(new window.Event("click", { bubbles: true }));

console.log("▶ 브라우저(jsdom) 통합 테스트");

// 1) 타이틀 → 새 게임
ok($("#title-screen").classList.contains("active"), "타이틀 화면 표시");
click($("#btn-new"));
ok($("#game-screen").classList.contains("active"), "새 게임 → 게임 화면 전환");
ok($("#day-num").textContent.includes("DAY 1"), "DAY 1 표시");

// 2) 카드 3장, 생존자 렌더 확인
const cards = document.querySelectorAll(".tcard");
ok(cards.length === 3, `타로 카드 3장 렌더 (${cards.length})`);
const svCards = document.querySelectorAll(".sv-card");
ok(svCards.length >= 5, `생존자 카드 렌더 (${svCards.length})`);
ok($("#resource-bar").children.length === 8, "자원 칩 8종 표시");
ok(document.querySelectorAll(".fac-row").length === 7, "시설 7종 표시");

// 3) 탐사팀 편성 (생존자 2명 토글)
const teamBtns = [...document.querySelectorAll(".team-btn")];
click(teamBtns[0]); click(teamBtns[1]);
ok(document.querySelectorAll(".sv-card.on-team").length === 2, "탐사팀 2명 편성");

// 4) 카드 배정 (탭 모드: 카드 클릭 → 첫 생존자 클릭)
click(document.querySelector(".tcard"));        // pickCard
const firstSv = document.querySelector(".sv-card");
click(firstSv);                                 // assignCard
ok(document.querySelectorAll(".mini-card").length >= 1, "카드 배정(미니카드 표시)");

// 5) 지역/깊이 선택 (클릭 후 패널이 재렌더되므로 다시 쿼리)
click(document.querySelectorAll(".region-opt")[2]);   // 병원
ok(document.querySelectorAll(".region-opt")[2].classList.contains("sel"), "지역 선택 반영");
click(document.querySelectorAll(".depth-opt")[0]);    // 안전
ok(document.querySelectorAll(".depth-opt")[0].classList.contains("sel"), "파밍 깊이 선택 반영");

// 6) 4개 게이지 미리보기 존재
ok(document.querySelectorAll(".gauge-row").length >= 4, "탐사 미리보기 게이지 표시");

// 7) 하루 실행 → 리포트
click($("#btn-run"));
ok($("#report-modal").classList.contains("active"), "하루 실행 → 리포트 모달 표시");
ok($("#report-body").children.length > 0, "리포트 내용 렌더");
ok($("#report-title").textContent.includes("DAY 1"), "리포트 제목 DAY 1");

// 8) 다음 날
click($("#btn-report-close"));
ok(!$("#report-modal").classList.contains("active"), "리포트 닫힘");
ok($("#day-num").textContent.includes("DAY 2"), "다음 날(DAY 2) 진행");

// 9) 저장/이어하기 동작
click($("#btn-save"));
ok(!!window.localStorage.getItem("acs_save_v1"), "localStorage 저장됨");

console.log(`\n${failures === 0 ? "✔ 모든 UI 통합 테스트 통과" : "✗ " + failures + "개 실패"}`);
process.exit(failures === 0 ? 0 : 1);
