// ============================================================
//  practice.js — 연습장: 김예균(또는 아무 친구)을 마음껏 써 보는 곳
//   · 골드 999 · 레벨 9 · 시간 제한 없음 · 체력이 깎이지 않아요
//   · 위쪽 연습 패널: 예균 별 바꾸기 · 상대(허수아비 / 강한 적 팀) · 시작하자마자 스킬 · 전투 멈추기 · 나가기
//   · 게임 규칙 함수를 감싸서(S.practice 일 때만) 다르게 동작해요. 보통 게임에는 영향이 없어요
// ============================================================
"use strict";
const PRAC_HERO = "김예균";
const PRAC_TEAM = [["정주환", 2, 1, 3], ["진성욱", 2, 0, 2], ["임시온", 2, 0, 4], ["이보경", 2, 0, 3], ["손태민", 2, 2, 2], ["박준서", 2, 2, 4], ["조하윤", 2, 3, 3]];
const pracIdx = (n) => DEFS.findIndex((d) => d.n === n);
function pracDummies() { // 허수아비: 체력이 아주 많고 거의 때리지 않아요
  const mon = { mn: "허수아비", hp: 6000, ad: 5, as: 0.4, rg: 1, ar: 0, col: "#d8b878" };
  return [[0, 2], [0, 3], [0, 4], [1, 2], [1, 3]].map(([lr, c]) => ({ spec: { mon: { ...mon } }, lr, c }));
}
function pracFoes() {
  if (S.pracFoe === "juhwan") return [{ spec: mkUnit(pracIdx("정주환"), 3), lr: 0, c: 3 }]; // 1대1: 정주환 ★3
  if (S.pracFoe === "team") return PRAC_TEAM.map(([n, star, lr, c]) => ({ spec: mkUnit(pracIdx(n), star), lr, c }));
  return pracDummies();
}
// 보드에서 연습 주인공을 찾아 별을 바꾸거나, 없으면 맨 앞 가운데에 놓아요
function pracSetHero(star) {
  const P = human(), d = pracIdx(PRAC_HERO);
  for (let r = 0; r < 4; r++) for (let c = 0; c < COLS; c++) { const u = P.board[r][c]; if (u && u.d === d) { u.star = star; S.pracStar = star; renderUI(); return; } }
  for (const [r, c] of [[0, 3], [0, 2], [0, 4], [1, 3], [1, 2], [0, 1], [0, 5]]) if (!P.board[r][c]) { P.board[r][c] = mkUnit(d, star); break; }
  S.pracStar = star; renderUI();
}
function practiceStart() {
  if (NET.joined) netLeave();
  NET.on = false; NET.done = true;
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  $("ov").hidden = true;
  newGame();
  S.practice = 1; S.pracFoe = S.pracFoe || "dummy"; S.pracMana = true; S.pracStar = 2;
  S.stage = 4; S.k = 3; S.car = null; S.orbs = [];
  const P = human(); P.level = 9; P.xp = 0; P.gold = 999;
  refreshShop(P);
  startPlan();
  pracSetHero(2);
  resize();
  toast("연습장: 시작을 누르면 바로 싸워요");
}
function practiceExit() {
  S.practice = 0; S.phase = "over"; S.battle = null;
  $("prac").hidden = true; $("ov").hidden = false;
}
// ---- 게임 규칙 감싸기 ----
const _startPlan = startPlan, _startCombatNow = startCombatNow, _finishCombat = finishCombat, _afterResult = afterResult, _renderUI = renderUI;
startPlan = function () {
  _startPlan();
  if (S && S.practice) { S.timer = S.timerMax = 9999; const P = human(); P.gold = Math.max(P.gold, 999); renderUI(); }
};
startCombatNow = function () {
  if (!S || !S.practice) return _startCombatNow();
  if (S.phase !== "plan" || S.augPending) return;
  collectOrbs(true);
  S.sel = null; S.scout = null; drag = null;
  const P = human(), B = makeBattle(sideOf(P), pracFoes(), true, P, null);
  if (S.pracMana) B.f.forEach((f) => { if (f.d >= 0 && ((f.team === 0 && DEFS[f.d].n === PRAC_HERO) || (f.team === 1 && S.pracFoe === "juhwan"))) f.mana = f.mm; }); // 시작하자마자 스킬 (1대1이면 주환도 같이)
  S.battle = B; S.results = [{ kind: "prac", a: P, B }]; S.opp = null;
  S.phase = "combat"; sfx("start"); renderUI();
};
finishCombat = function () {
  if (!S || !S.practice) return _finishCombat();
  S.phase = "result";
  const B = S.battle, win = B.win === 0;
  const hero = B.f.filter((f) => f.team === 0 && f.d >= 0 && DEFS[f.d].n === PRAC_HERO);
  const dmg = Math.round(hero.reduce((s, f) => s + (f.dmg || f.dealt || 0), 0));
  S.banner = { text: win ? "승리!" : S.pracFoe === "dummy" ? "연습 끝" : "패배", col: win ? TOK["--accent"] : TOK["--chalk"], t: 1.8 };
  if (S.pracFoe === "juhwan") { const foe = B.f.find((f) => f.team === 1 && f.d >= 0); toast(win ? `김예균 승리! 남은 체력 ${Math.round(hero.reduce((s, f) => s + Math.max(0, f.hp), 0))}` : `정주환 승리! 남은 체력 ${Math.round(foe ? Math.max(0, foe.hp) : 0)}`); }
  else if (dmg) toast(`${PRAC_HERO} 피해량 ${dmg}`);
  sfx(win ? "win" : "lose");
  S.resultT = 2; renderUI();
};
afterResult = function () {
  if (!S || !S.practice) return _afterResult();
  startPlan();
};
renderUI = function () { _renderUI(); pracUI(); };
function pracUI() {
  const el = $("prac"); if (!el) return;
  const on = !!(S && S.practice && $("ov").hidden);
  el.hidden = !on; if (!on) return;
  el.querySelectorAll("[data-star]").forEach((b) => b.classList.toggle("on", +b.dataset.star === S.pracStar));
  el.querySelectorAll("[data-foe]").forEach((b) => b.classList.toggle("on", b.dataset.foe === S.pracFoe));
  $("pracmana").classList.toggle("on", !!S.pracMana);
  $("pracmana").textContent = S.pracMana ? "바로 스킬 켜짐" : "바로 스킬 꺼짐";
  const plan = S.phase === "plan";
  el.querySelectorAll("[data-star],[data-foe]").forEach((b) => (b.disabled = !plan));
  $("pracstop").disabled = S.phase !== "combat";
  const rt = $("rtype"); if (rt) { rt.textContent = "연습장"; rt.className = "rtype"; }
}
tapButton($("practice"), practiceStart);
document.querySelectorAll("#prac [data-star]").forEach((b) => tapButton(b, () => { if (S.phase === "plan") pracSetHero(+b.dataset.star); }));
document.querySelectorAll("#prac [data-foe]").forEach((b) => tapButton(b, () => { if (S.phase === "plan") { S.pracFoe = b.dataset.foe; renderUI(); } }));
tapButton($("pracmana"), () => { S.pracMana = !S.pracMana; renderUI(); });
tapButton($("pracexit"), practiceExit);
tapButton($("pracstop"), () => { const B = S.battle; if (S.phase === "combat" && B && !B.done) { B.done = true; if (B.win == null) B.win = -1; } }); // 전투를 바로 끝내고 준비로 돌아가요
