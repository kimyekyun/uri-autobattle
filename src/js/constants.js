// ============================================================
//  constants.js — 기본 숫자와 도구 (아이템 · 몬스터 · 레벨 확률 · 육각 칸 계산)
// ============================================================
"use strict";
// =============== 데이터 ===============
// 아이템: 나중에 다시 켤 수 있게 스위치만 꺼 둬요
const ITEMS_ON = false;
// 아이템 재료 6종 + 조합 21종
const COMP = [
  { id: "pen",    n: "연필",   d: "공격력 +15%",    col: "#f5d76e", st: { adPct: .15 } },
  { id: "shoe",   n: "실내화", d: "공격 속도 +12%", col: "#7fe0b0", st: { asPct: .12 } },
  { id: "gym",    n: "체육복", d: "체력 +180",      col: "#ff8a7a", st: { hp: 180 } },
  { id: "eraser", n: "지우개", d: "받는 피해 -10%", col: "#d6dbd8", st: { ar: .1 } },
  { id: "note",   n: "노트",   d: "스킬 피해 +15%", col: "#e39cff", st: { amp: .15 } },
  { id: "water",  n: "물병",   d: "시작 마나 +15",  col: "#7fc4ff", st: { mana: 15 } },
];
const COMBOS = {
  "pen+pen":       ["샤프 세트",   "공격력 +35% 추가", { adPct: .35 }],
  "pen+shoe":      ["필통",        "공격할 때마다 공격 속도 +6% (계속 쌓임)", { stackAs: .06 }],
  "pen+gym":       ["고기반찬",    "준 피해의 25%만큼 회복", { lifesteal: .25 }],
  "pen+eraser":    ["삼각자",      "기본 공격이 주변 적에게도 35% 피해", { splash: .35 }],
  "pen+note":      ["오답노트",    "치명타 확률 +25%, 스킬도 치명타 가능", { crit: .25, skillCrit: 1 }],
  "pen+water":     ["형광펜",      "공격할 때 마나 +5 추가", { manaOnHit: 5 }],
  "shoe+shoe":     ["운동화",      "공격 속도 +35% 추가", { asPct: .35 }],
  "shoe+gym":      ["줄넘기",      "체력 50% 이하면 공격 속도 +60%", { lowHpAs: .6 }],
  "shoe+eraser":   ["책가방",      "근접 공격을 받으면 피해의 30%를 되돌려줌", { thorns: .3 }],
  "shoe+note":     ["손목시계",    "1초마다 마나 +5", { manaTick: 5 }],
  "shoe+water":    ["보조배터리",  "시작 마나 +30 추가", { mana: 30 }],
  "gym+gym":       ["패딩",        "체력 +30%", { hpPct: .3 }],
  "gym+eraser":    ["책받침 방패", "체력 40% 이하가 되면 보호막 450 (1번)", { lowShield: 450 }],
  "gym+note":      ["보건실 키트", "1초마다 최대 체력의 2.5% 회복", { regen: .025 }],
  "gym+water":     ["응원 깃발",   "전투 시작 때 붙어 있는 아군에게 보호막 250", { teamShield: 250 }],
  "eraser+eraser": ["철제 사물함", "받는 피해 -15% 추가", { ar: .15 }],
  "eraser+note":   ["두꺼운 사전", "스킬 쓸 때 자신에게 보호막 250", { castShield: 250 }],
  "eraser+water":  ["급식 우유",   "스킬 쓸 때 주변 아군 150 회복", { castHeal: 150 }],
  "note+note":     ["참고서",      "스킬 피해 +40% 추가", { amp: .4 }],
  "note+water":    ["공책 세트",   "스킬 쓴 뒤 마나 25를 돌려받음", { refund: 25 }],
  "water+water":   ["생수 묶음",   "마나 획득 +35%, 시작 마나 +20", { mgainPct: .35, mana: 20 }],
};
const ITEMS = {};
COMP.forEach((c) => (ITEMS[c.id] = { id: c.id, n: c.n, d: c.d, col: c.col, st: { ...c.st }, comp: true }));
const CIDX = (id) => COMP.findIndex((c) => c.id === id);
const comboKey = (a, b) => (CIDX(a) <= CIDX(b) ? `${a}+${b}` : `${b}+${a}`);
for (const [k, [n, d, sp]] of Object.entries(COMBOS)) {
  const [a, b] = k.split("+"), st = {};
  for (const src of [ITEMS[a].st, ITEMS[b].st, sp]) for (const [kk, v] of Object.entries(src)) st[kk] = (st[kk] || 0) + v;
  ITEMS[k] = { id: k, n, d, col: "#ffcc4d", st, comp: false, parts: [a, b] };
}
// PvE 몬스터
const MON = {
  hw:   { mn: "숙제",     hp: 420,  ad: 28,  as: .6,  rg: 1, ar: 0,   col: "#c9d1cc" },
  quiz: { mn: "쪽지시험", hp: 800,  ad: 45,  as: .6,  rg: 1, ar: .1,  col: "#7fc4ff" },
  perf: { mn: "수행평가", hp: 1150, ad: 65,  as: .65, rg: 1, ar: .15, col: "#7fe0b0" },
  mid:  { mn: "중간고사", hp: 3200, ad: 115, as: .55, rg: 1, ar: .2,  col: "#e39cff", boss: 1 },
  fin:  { mn: "기말고사", hp: 5200, ad: 160, as: .55, rg: 1, ar: .25, col: "#ffcc4d", boss: 1 },
  mock: { mn: "모의고사", hp: 8000, ad: 220, as: .6,  rg: 1, ar: .3,  col: "#ff8a7a", boss: 1 },
};
const COST_COLOR = ["", "--c1", "--c2", "--c3", "--c4", "--c5"];
const ODDS = { 1: [100,0,0,0,0], 2: [100,0,0,0,0], 3: [75,25,0,0,0], 4: [55,30,15,0,0], 5: [45,33,20,2,0],
  6: [30,40,25,5,0], 7: [19,30,35,15,1], 8: [18,25,32,22,3], 9: [10,20,25,35,10], 10: [5,10,20,40,25] };
const XPNEED = { 1: 2, 2: 4, 3: 6, 4: 10, 5: 20, 6: 36, 7: 48, 8: 76, 9: 84 };
const POOL_SIZE = [0, 30, 28, 24, 14, 9]; // 코스트별 친구 한 명당 수 (8반이 나눠 써요)
const STAGE_DMG = [0, 0, 2, 3, 5, 7, 10, 14];
const STARM = [0, 1, 1.8, 3.2];
const ROWS = 8, COLS = 7, BENCH = 9, ITEM_MAX = 10, SQ3 = Math.sqrt(3);
const CLASS_NAMES = ["1반", "2반", "3반", "4반", "5반", "6반", "7반"];
const TYPE_LABEL = { carousel: "급식 줄", pve: "몬스터", pvp: "대결" };
const LAND = "(orientation: landscape) and (min-width: 700px)";

const $ = (id) => document.getElementById(id);
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const short = (n) => (n.length === 3 ? n.slice(1) : n);
const TOK = {};
function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ["--board", "--hex-mine", "--hex-foe", "--board-line", "--panel", "--chalk", "--chalk-dim", "--accent", "--danger", "--c1", "--c2", "--c3", "--c4", "--c5", "--display", "--body"])
    TOK[k] = cs.getPropertyValue(k).trim();
}
readTokens();
let uid = 1;

// =============== 육각 칸 ===============
// 홀수 행이 반 칸 오른쪽으로 밀린 배치(odd-r)
const EVEN_DIRS = [[0, 1], [0, -1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
const ODD_DIRS = [[0, 1], [0, -1], [-1, 0], [-1, 1], [1, 0], [1, 1]];
function cube(r, c) { const x = c - (r - (r & 1)) / 2; return [x, r, -x - r]; }
function hexDistRC(r1, c1, r2, c2) {
  const a = cube(r1, c1), b = cube(r2, c2);
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}
const hexDist = (a, b) => hexDistRC(a.r, a.c, b.r, b.c);
function neighbors(r, c) {
  return (r & 1 ? ODD_DIRS : EVEN_DIRS).map(([dr, dc]) => [r + dr, c + dc]).filter(([a, b]) => a >= 0 && a < ROWS && b >= 0 && b < COLS);
}
