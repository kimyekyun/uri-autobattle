// ============================================================
//  augments.js — 증강 목록 (2-1 · 3-2 · 4-2 라운드에서 3개 중 1개 선택)
//  새 증강: AUGS 에 { id, n: 이름, v: [실버, 골드, 프리즘 숫자], d: (v) => 설명, f: (P, v) => 효과 } 를 추가하면 돼요.
// ============================================================
"use strict";
// 증강: 2-1(실버), 3-2(골드), 4-2(프리즘) 라운드에 3개 중 1개 선택
// v: [실버, 골드, 프리즘] 등급별 숫자. d(v) 설명, f(P, v) 효과. tiers 가 있으면 그 등급에서만 나와요 (0 실버, 1 골드, 2 프리즘)
const pct = (x) => Math.round(x * 100) + "%";
const AUGS = [
  { id: "money", n: "두둑한 용돈", v: [8, 16, 28], d: (v) => `즉시 ${v}골드`, f: (P, v) => (P.gold += v) },
  { id: "lunch", n: "점심시간", v: [1, 2, 3], d: (v) => `매 라운드 시작마다 골드 +${v}`, f: (P, v) => (P.gpr += v) },
  { id: "study", n: "선행 학습", v: [6, 12, 20], d: (v) => `즉시 경험치 +${v}`, f: (P, v) => addXp(P, v) },
  { id: "supplies", n: "준비물 챙기기", v: [2, 3, 5], d: (v) => `아이템 재료 ${v}개`, f: (P, v) => { for (let i = 0; i < v; i++) giveItem(P, rnd(COMP).id); } },
  { id: "complete", n: "완성품 선물", v: [1, 1, 2], d: (v) => `무작위 완성 아이템 ${v}개`, f: (P, v) => { for (let i = 0; i < v; i++) giveItem(P, rnd(Object.keys(COMBOS))); } },
  { id: "sports", n: "체육대회", v: [0.08, 0.15, 0.25], d: (v) => `아군 전체 공격 속도 +${pct(v)}`, f: (P, v) => (P.buff.as += v) },
  { id: "wall", n: "철벽 수비", v: [0.06, 0.1, 0.16], d: (v) => `아군 전체 받는 피해 -${pct(v)}`, f: (P, v) => (P.buff.ar += v) },
  { id: "meat", n: "급식 고기반찬", v: [[0.07, 0.05], [0.12, 0.08], [0.2, 0.14]], d: (v) => `아군 전체 공격력 +${pct(v[0])}, 체력 +${pct(v[1])}`, f: (P, v) => { P.buff.ad += v[0]; P.buff.hp += v[1]; } },
  { id: "nurse", n: "보건실 이용권", v: [10, 20, 35], d: (v) => `내 체력 +${v}`, f: (P, v) => (P.hp += v) },
  { id: "honor", n: "우등생", v: [1, 2, 3], d: (v) => `무작위 ${v}코스트 친구 ★2`, f: (P, v) => { // ★2 = 친구 3명이라 풀에서 3명을 꺼내요
    const i = P.bench.indexOf(null), cands = DEFS.map((_, j) => j).filter((j) => DEFS[j].c === v && S.pool[j] >= 3);
    if (i >= 0 && cands.length) { const d = rnd(cands); S.pool[d] -= 3; P.bench[i] = mkUnit(d, 2); } else P.gold += v * 3; } },
  { id: "pres", n: "신의 강림", tiers: [2], d: () => "정주환 ★1을 대기석으로", f: (P) => { const d = DEFS.findIndex((x) => x.n === "정주환"), i = P.bench.indexOf(null); if (i >= 0 && S.pool[d] > 0) { P.bench[i] = mkUnit(d); S.pool[d]--; } else P.gold += 5; } },
  ...["운동광", "지는 거 못 참음", "공부는 잘함", "다 퍼줌", "축구부"].map((t) => ({ id: "emb-" + t, n: `${t} 배지`, v: [[1, 0], [1, 4], [2, 0]],
    d: (v) => `${t} 시너지 숫자 +${v[0]}${v[1] ? `, ${v[1]}골드` : ""}`, f: (P, v) => { P.emb[t] = (P.emb[t] || 0) + v[0]; P.gold += v[1]; } })),
];
const AUG_ROUNDS = { "2-1": "실버", "3-2": "골드", "4-2": "프리즘" };
const TIER_IX = { "실버": 0, "골드": 1, "프리즘": 2 };
