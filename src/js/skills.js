// ============================================================
//  skills.js — 친구별 스킬 · 외침 · 소환수
//  SK["이름"] = { s: 스킬 이름, d: 설명 함수, run: 스킬이 발동할 때 하는 일 }
//   · P 는 코스트·별에 따른 배율 (높을수록 강함)
//   · 쓸 수 있는 도구: dealDamage(피해) heal(회복) addFx(이펙트) addFloat(글자) near(주변 적) summon(소환)
//  SHOUT: 기본 공격할 때 머리 위에 뜨는 외침 (조하윤 스페인어, 윤동욱 동양철학)
// ============================================================
"use strict";
// 친구마다 다른 스킬 (P = 코스트·별에 따른 배율)
const R0 = (v) => Math.round(v);
const byHp = (a, b) => a.hp / a.maxHp - b.hp / b.maxHp;
const near = (list, c, d) => list.filter((o) => hexDist(o, c) <= d);
const C = (k) => TOK[k];
const SK = {
  "이승찬": { s: "다 같이 힘내자!", d: (P) => `체력이 낮은 아군 2명을 ${R0(170 * P)} 회복하고 보호막 ${R0(90 * P)}`,
    run(B, u, P, t, al) { al.slice().sort(byHp).slice(0, 2).forEach((o) => { heal(B, o, 170 * P); o.shield += 90 * P; addFx(B, o.X, o.Y, 0.8, C("--c2")); addFx(B, o.X, o.Y, 1.2, "#ff9ac8", 0.7); addFloat(B, { X: o.X, Y: o.Y - 0.3 }, "♥", "#ff9ac8", true); });
      addHuge(B, u, "힘내자!", "#ffffff", "#ff9ac8", 2.2);
      if (B.visual) B.zones.push({ kind: "hearts", step: stepTimer, team: u.team, owner: u, X: u.X, Y: u.Y, t: 0, dur: 0.9, targets: al.slice().sort(byHp).slice(0, 2) }); } },
  "이현": { s: "전력 질주", d: (P) => `4초 동안 공격 속도 +70%, 대상에게 공격력×1.2 + ${R0(90 * P)} 피해`,
    run(B, u, P, t) { u.asBuff = 0.7; u.asBuffT = 4; if (t) { dealDamage(B, u, t, u.ad * 1.2 + 90 * P, "skill"); addFx(B, t.X, t.Y, 0.6, C("--danger"), 0.3); addFx(B, t.X, t.Y, 1.1, "#ffd36b", 0.4); } addFx(B, u.X, u.Y, 1.4, "#ffd36b", 0.5); addHuge(B, u, "질주!", "#ffffff", "#ffb43a", 2.2);
      if (B.visual && t) { // 잔상을 남기며 달려들어요
        u.lunge = 0.18; u.lx = t.X - u.X; u.ly = t.Y - u.Y;
        const bx = u.X - (t.X - u.X) * 1.6, by = u.Y - (t.Y - u.Y) * 1.6;
        B.zones.push({ kind: "tackle", step: stepTimer, team: u.team, owner: u, ax: bx, ay: by, X: t.X, Y: t.Y, t: 0, dur: 0.5, col: "#ffb43a" });
        for (let i = 0; i < 3; i++) B.fx.push({ kind: "puff", X: bx + (u.X - bx) * i / 3, Y: by + (u.Y - by) * i / 3, t: 0.3 + i * 0.07, t0: 0.3 + i * 0.07 });
        sfx("kick");
      } } },
  "최효민": { s: "만능 플레이", d: (P) => `가까운 적 3명에게 동시에 공격력 + ${R0(80 * P)} 피해`,
    run(B, u, P, t, al, fo) { fo.slice().sort((a, b) => hexDist(a, u) - hexDist(b, u)).slice(0, 3).forEach((o) => B.projs.push({ X: u.X, Y: u.Y, t: o, sp: 14, col: C("--accent"), sz: 0.14, trail: 1, hit: () => { dealDamage(B, u, o, u.ad + 80 * P, "skill"); addFx(B, o.X, o.Y, 0.9, "#ffe66b", 0.35); addFx(B, o.X, o.Y, 1.4, "#ffffff", 0.3); } }));
      addHuge(B, u, "스매시!", "#ffffff", "#7fc4ff", 2.2); if (B.visual) sfx("kick"); } },
  "전하율": { s: "약점 공략", d: (P) => `대상에게 ${R0(140 * P)} 피해, 4초 동안 받는 피해 +25%`,
    run(B, u, P, t) { if (!t) return; dealDamage(B, u, t, 140 * P, "skill"); t.vuln = 0.25; t.vulnT = 4; addHuge(B, t, "약점!", "#ffffff", "#c86bff", 2.2); addFx(B, t.X, t.Y, 0.7, C("--c4")); addFx(B, t.X, t.Y, 1.3, "#ff5a4a", 0.6);
      if (B.visual) B.zones.push({ kind: "mark", step: stepMark, team: u.team, owner: u, tgt: t, X: t.X, Y: t.Y, t: 0, dur: 4 }); } },
  "이준희": { s: "덩크슛", d: (P) => `대상 머리 위에 골대가 나타나고, 뛰어올라 내리꽂아요. 공격력×1.8 + ${R0(140 * P)} 피해 + 1초 기절, 주변 적 ${R0(60 * P)}`,
    run(B, u, P, t) { if (!t) return; B.zones.push({ kind: "dunk", step: stepDunk, team: u.team, owner: u, P, tgt: t, X: t.X, Y: t.Y, t: 0, dur: 0.9 }); } },
  "김현우": { s: "한입에 꿀꺽", d: (P) => `2칸 안에서 체력 비율이 가장 낮은 적에게 달려들어요. 체력이 20% 아래면 한입에 먹어 처형하고 그 적 최대 체력의 25%만큼 회복 (★2는 25%, ★3은 35% 아래, 보스는 절반 기준). 아니면 공격력 + ${R0(120 * P)} 피해, 자신에게 보호막 ${R0(150 * P)}`,
    run(B, u, P, t, al, fo) {
      const pool = fo.filter((o) => hexDist(o, u) <= 2);
      const tg = pool.length ? pool.sort(byHp)[0] : t; if (!tg) return;
      const line = [0, 0.2, 0.25, 0.35][u.star || 1] * (tg.mon && tg.mon.boss ? 0.5 : 1);
      if (B.visual) { u.lunge = 0.18; u.lx = tg.X - u.X; u.ly = tg.Y - u.Y; B.zones.push({ kind: "tackle", step: stepTimer, team: u.team, owner: u, ax: u.X, ay: u.Y, X: tg.X, Y: tg.Y, t: 0, dur: 0.5, col: "#ff7a3a" }); }
      if (tg.hp <= tg.maxHp * line) {
        const mx = tg.maxHp; dealDamage(B, u, tg, 0, "exec"); heal(B, u, mx * 0.25);
        addFx(B, tg.X, tg.Y, 1.2, "#ffffff", 0.4); addFx(B, tg.X, tg.Y, 2, "#ff7a3a", 0.6);
        addHuge(B, tg, "꿀꺽!", "#ffffff", "#ff5a4a", 3.2);
        if (B.visual) { S.shake = Math.max(S.shake || 0, 0.25); sfx("boom"); }
      } else {
        dealDamage(B, u, tg, u.ad + 120 * P, "skill"); u.shield += 150 * P;
        addFx(B, tg.X, tg.Y, 0.9, "#ff7a3a", 0.4); addFx(B, u.X, u.Y, 0.8, C("--c3"));
        addHuge(B, u, "앙!", "#ffffff", "#ff7a3a", 2.4);
        if (B.visual) sfx("kick");
      }
    } },
  "이보경": { s: "태클 수비", d: (P) => `슬라이딩 태클! 대상에게 ${R0(90 * P)} 피해 + 1.5초 기절, 자신에게 보호막 ${R0(200 * P)}`,
    run(B, u, P, t) {
      if (t) {
        dealDamage(B, u, t, 90 * P, "skill"); t.stunT = 1.5;
        addFx(B, t.X, t.Y, 1.2, "#ffffff", 0.4); addFx(B, t.X, t.Y, 1.8, "#7fe0a0", 0.6); addHuge(B, t, "태클!", "#ffffff", "#4fa8ff", 2.6);
        if (B.visual) {
          u.lunge = 0.18; u.lx = t.X - u.X; u.ly = t.Y - u.Y; // 몸을 날려요
          B.zones.push({ kind: "tackle", step: stepTimer, team: u.team, owner: u, ax: u.X, ay: u.Y, X: t.X, Y: t.Y, t: 0, dur: 0.55 });
          for (let i = 1; i <= 3; i++) B.fx.push({ kind: "puff", X: u.X + (t.X - u.X) * i / 3, Y: u.Y + (t.Y - u.Y) * i / 3, t: 0.35 + i * 0.08, t0: 0.35 + i * 0.08 });
          S.shake = Math.max(S.shake || 0, 0.18); sfx("kick");
        }
      }
      u.shield += 200 * P; addFx(B, u.X, u.Y, 0.8, C("--c3"));
    } },
  "윤동욱": { s: "음양의 조화", d: (P) => `태극 문양을 펼쳐요. 양(陽)의 기운으로 대상에게 공격력×2 + ${R0(120 * P)} 피해, 음(陰)의 기운으로 준 피해의 40% 회복. 기본 공격 때 동양철학 한마디`,
    run(B, u, P, t) {
      if (!t) return;
      const d = dealDamage(B, u, t, u.ad * 2 + 120 * P, "skill"); heal(B, u, d * 0.4);
      addFx(B, t.X, t.Y, 0.9, "#fff6e0", 0.45); addFx(B, u.X, u.Y, 0.9, "#6a5acd", 0.45); addFx(B, t.X, t.Y, 1.5, "#ffe7a0", 0.6); addFx(B, u.X, u.Y, 1.5, "#6a5acd", 0.6);
      addHuge(B, t, "陽", "#ffffff", "#ffd36b", 2.6); addHuge(B, u, "陰", "#e0dcff", "#6a5acd", 2.6);
      if (B.visual) { B.zones.push({ kind: "yinyang", step: stepTimer, team: u.team, owner: u, tgt: t, X: t.X, Y: t.Y, t: 0, dur: 1.1 }); S.shake = Math.max(S.shake || 0, 0.12); sfx("charge"); }
    } },
  "김민기": { s: "노트 필기 공유", d: (P) => `거대한 연필로 대상 자리에 세 번 줄을 그어 주변 적에게 ${R0(50 * P)}씩 3번 피해. 주변 아군에게는 필기 종이비행기를 날려 ${R0(90 * P)} 회복`,
    run(B, u, P, t, al) {
      if (t) B.zones.push({ kind: "scribble", step: stepScribble, team: u.team, owner: u, P, r: t.r, c: t.c, X: t.X, Y: t.Y, t: 0, dur: 0.8 });
      near(al, u, 2).forEach((o) => {
        const give = () => { heal(B, o, 90 * P); addFloat(B, { X: o.X, Y: o.Y - 0.3 }, "✎", "#b8ffd0", true); addFx(B, o.X, o.Y, 0.7, C("--c2"), 0.4); };
        if (o === u) give(); else B.projs.push({ X: u.X, Y: u.Y, t: o, sp: 9, col: "#b8ffd0", sz: 0.14, trail: 1, hit: give });
      });
      addFx(B, u.X, u.Y, 2, C("--c2"));
    } },
  "임시온": { s: "골문 사수", d: (P) => `골대를 세우고 버텨요. 자신에게 보호막 ${R0(280 * P)}, 붙어 있는 아군에게 ${R0(140 * P)}`,
    run(B, u, P, t, al) {
      u.shield += 280 * P; near(al, u, 1).forEach((o) => o !== u && (o.shield += 140 * P));
      addFx(B, u.X, u.Y, 1.6, C("--c3")); addFx(B, u.X, u.Y, 2.3, "#ffffff", 0.7); addHuge(B, u, "철벽!", "#ffffff", "#4fa8ff", 2.4);
      if (B.visual) { B.zones.push({ kind: "goal", step: stepShow, team: u.team, owner: u, X: u.X, Y: u.Y, t: 0, dur: 1.4 }); S.shake = Math.max(S.shake || 0, 0.15); sfx("boom"); }
    } },
  "김예균": { s: "세계를 가르는 참격", d: (P) => `하늘이 핏빛으로 물들고, 하늘에서 참격 12개가 쏟아져 적을 번갈아 베어요 (하나에 ${R0(55 * P)} 피해). 마지막엔 전장 전체를 가로로 가르는 거대한 참격! 적 모두에게 ${R0(80 * P)} 피해, 갈라진 줄 위아래 1칸 적은 ${R0(110 * P)} 더 받고 0.6초 기절. 자신에게 보호막 ${R0(200 * P)}. 기본 공격도 핏빛 참격이에요. ★3이 되면 참격 20개, 갈라진 줄 피해 ${R0(170 * P)}`,
    run(B, u, P, t, al, fo) {
      if (!fo.some((o) => o.alive)) return;
      const legend = u.star >= 3, n = legend ? 20 : 12, wAt = REND_AT + n * REND_GAP + 0.5;
      u.shield += 200 * P;
      B.zones.push({ kind: "rend", step: stepRend, team: u.team, owner: u, P, X: u.X, Y: u.Y, t: 0, n, legend, drops: [], world: null, wAt, dur: wAt + 1.3 });
      addHuge(B, u, "捌", "#ffffff", "#ff2a3a", legend ? 5.2 : 4.6); // 하치: 가르다·베다
      if (B.visual) { sfx("charge"); S.shake = Math.max(S.shake || 0, 0.15); }
    } },
  "최윤서": { s: "그물 던지기", d: (P) => `적이 가장 많이 모인 곳에 그물을 던져요. 반경 1칸 적 모두 ${R0(90 * P)} 피해 + 1.5초 동안 꼼짝 못 함, 3초 동안 받는 피해 +20%. ★2는 1.75초, ★3은 반경 2칸에 2.5초 묶고 그물 가운데로 끌어당겨요`,
    run(B, u, P, t, al, fo) {
      const live = fo.filter((o) => o.alive); if (!live.length) return;
      const c = live.map((o) => [o, near(live, o, 1).length + (t && o === t ? 0.5 : 0)]).sort((a, b) => b[1] - a[1])[0][0]; // 가장 많이 모인 곳 (대상 근처 우선)
      const star = u.star || 1, hold = star >= 3 ? 2.5 : star === 2 ? 1.75 : 1.5, rad = star >= 3 ? 2 : 1;
      B.zones.push({ kind: "net", step: stepNet, team: u.team, owner: u, P, r: c.r, c: c.c, X: c.X, Y: c.Y, ox: u.X, oy: u.Y, t: 0, hitAt: NET_AT, hold, rad, pull: star >= 3, dur: NET_AT + hold + 0.4 });
      addHuge(B, u, star >= 3 ? "대어 포획!" : "그물 던지기!", "#ffffff", "#2fd0a0", star >= 3 ? 3 : 2.5);
      if (B.visual) sfx("charge");
    } },
  "은혜린": { s: "춤추기", d: (P) => `발밑에 반짝이는 댄스 무대를 깔아요 (반경 3칸, 4초). 무대 위 아군은 공격 속도 +40%와 0.5초마다 회복(합계 ${R0(150 * P)}), 무대 위 적은 박자에 맞춰 0.5초 멈칫해요. 댄스부 특성이면 1초 더 오래 가요. ★3은 무대가 전장 전체로 넓어지고 공격 속도 +50%`,
    run(B, u, P) {
      const star = u.star || 1, dur = 4 + (u.dance ? 1 : 0), all = star >= 3;
      B.zones.push({ kind: "dance", step: stepDance, team: u.team, owner: u, P, X: u.X, Y: u.Y, r: u.r, c: u.c, t: 0, tick: 0, n: 0, dur, rad: all ? 99 : 3, asb: all ? 0.5 : 0.4, heal: 150 * P / (dur / 0.5), froze: 0, all });
      addHuge(B, u, all ? "전장 무대 ♪" : "♪ 춤추기 ♪", "#ffffff", "#ff7ab0", all ? 3.2 : 2.6);
      if (B.visual) sfx("charge");
    } },
  "박현호": { s: "피자 파티", d: (P) => `피자를 꺼내 아군에게 한 조각씩 던져 줘요. 받은 아군은 ${R0(70 * P)} 회복 + 5초 동안 공격 속도 +25%. 단, 진성욱한테만 안 줘요`,
    run(B, u, P, t, al) {
      const eat = (o) => { o.asBuff = Math.max(o.asBuff || 0, 0.25); o.asBuffT = 5; heal(B, o, 70 * P); addFx(B, o.X, o.Y, 0.8, "#ffb43a", 0.4); addFloat(B, { X: o.X, Y: o.Y - 0.3 }, "🍕", "#ffd36b", true); };
      for (const o of al) {
        if (o.d >= 0 && !o.robot && DEFS[o.d].n === "진성욱") { addHuge(B, o, "나는…?", "#ffffff", "#8a93a0", 2); continue; } // 성욱이만 빼고!
        if (o === u) eat(o); else B.projs.push({ X: u.X, Y: u.Y, t: o, sp: 9, col: "#ffb43a", shape: "pizza", sz: 0.1, hit: () => eat(o) });
      }
      addHuge(B, u, "🍕 피자 파티!", "#ffffff", "#ff8a2a", 2.4);
      addFx(B, u.X, u.Y, 1.6, "#ffd36b", 0.5);
      if (B.visual) sfx("charge");
    } },
  "박희찬": { s: "무회전 프리킥", d: (P) => `잠깐 조준한 뒤 불붙은 무회전 슛! 대상에게 공격력×1.8 + ${R0(220 * P)} 피해 + 0.5초 기절, 주변 적에게 55%`,
    run(B, u, P, t) { if (!t) return; B.zones.push({ kind: "freekick", step: stepFreekick, team: u.team, owner: u, P, tgt: t, X: u.X, Y: u.Y, t: 0, dur: 0.45 }); } },
  "진성욱": { s: "풀코트 프레스", d: (P) => `높이 뛰어올라 땅을 내리찍어요. 붙어 있는 적 모두 공격력×1.6 + ${R0(110 * P)} 피해 + 0.4초 기절 + 한 칸 밀쳐내기, 최대 체력 12% 회복`,
    run(B, u, P) { B.zones.push({ kind: "slam", step: stepSlam, team: u.team, owner: u, P, X: u.X, Y: u.Y, t: 0, dur: 0.95 }); } },
  "박준서": { s: "수학 문제 폭격", d: (P) => `하늘에서 수학 공식 5개(피타고라스 정리, 일차함수, 원의 넓이, 삼각함수, 근의 공식)가 운석처럼 차례로 떨어져 무작위 적에게 각각 ${R0(130 * P)} 피해`,
    run(B, u, P, t, al, fo) {
      const live = fo.filter((o) => o.alive); if (!live.length) return;
      const drops = MATH_SYMS.map((sym, i) => ({ o: rnd(live), at: 0.4 + i * 0.15, sym, X: 0, Y: 0 }));
      B.zones.push({ kind: "mathrain", step: stepMathRain, team: u.team, owner: u, P, X: u.X, Y: u.Y, t: 0, dur: drops[drops.length - 1].at + 0.4, drops });
      if (B.visual) sfx("charge");
    } },
  "조하윤": { s: "¡Adiós!", d: (P) => `체력 비율이 가장 낮은 적을 조준한 뒤 스페인어로 "잘 가!" 하며 저격해 공격력×1.5 + ${R0(180 * P)} 피해, 처치하면 "¡Olé!"와 함께 마나 절반 회복. 기본 공격 때도 스페인어로 외쳐요`,
    run(B, u, P, t, al, fo) { const o = fo.slice().sort(byHp)[0]; if (!o) return; B.zones.push({ kind: "snipe", step: stepSnipe, team: u.team, owner: u, P, tgt: o, X: u.X, Y: u.Y, t: 0, dur: 0.4 }); } },
  "손태민": { s: "블랙홀", d: (P) => `대상 자리에 블랙홀을 열어 2.5초 동안 주변 3칸의 적을 빨아들이고, 0.25초마다 ${R0(16 * P)} 피해. 마지막에 폭발해 ${R0(100 * P)} 피해`,
    run(B, u, P, t) { if (!t) return; B.zones.push({ team: u.team, owner: u, P, r: t.r, c: t.c, X: t.c + (t.r & 1) * 0.5, Y: t.r, t: 0, dur: 2.5, tick: 0, pull: 0 }); addFloat(B, t, "블랙홀!", "#c9a0ff", true); if (B.visual) { S.shake = 0.15; sfx("boom"); } } },
  "정주환": { s: "천벌", d: (P) => `하늘에 먹구름을 부르고, 적 모두에게 하나씩 번개를 내리쳐 ${R0(110 * P)} 피해 + 0.6초 기절. 마지막엔 체력이 가장 많은 적에게 거대한 심판의 번개로 ${R0(150 * P)} 피해, 주변 적 ${R0(60 * P)}. ★3이 되면 마지막 번개 대신 적이 가장 많이 모인 곳에 엄청 큰 "신의 심판" 번개가 떨어져 둘레 2칸 적에게 ${R0(260 * P)} 피해 + 1초 기절, 나머지 적 모두 ${R0(120 * P)}. 시전할 때 아군 전체 ${R0(110 * P)} 회복 + 4초 동안 공격 속도 +30%`,
    run(B, u, P) {
      B.zones.push({ kind: "smite", step: stepSmite, team: u.team, owner: u, P, r: u.r, c: u.c, X: u.X, Y: u.Y, t: 0, dur: 2, strikes: null, big: null });
      B.f.filter((o) => o.alive && o.team === u.team).forEach((o) => { heal(B, o, 110 * P); o.asBuff = Math.max(o.asBuff || 0, 0.3); o.asBuffT = 4; addFx(B, o.X, o.Y, 0.8, "#bfe8ff", 0.6); });
      if (B.visual) { S.shake = 0.15; sfx("charge"); }
    } },
};

const SPANISH = ["¡Hola!", "¡Vamos!", "¡Toma!", "¡Olé!", "¡Ay, caramba!", "¡Fuego!", "¡Venga!", "¡Qué fácil!"];
const PHILO = ["무위자연", "음양오행", "중용", "상선약수", "물아일체", "도(道)", "호접지몽", "지행합일"];
const SHOUT = { "조하윤": [SPANISH, "#ffd36b", 0.7], "윤동욱": [PHILO, "#cfe0ff", 0.5] };
// 소환수 이다연: 김예균 주변 빈칸에 나타나요
const SUMMON_DEF = { n: "이다연", c: 2, k: "응원단", t: [] };
function summon(B, u, P, max, opt = {}) {
  const made = [];
  const mine = B.f.filter((o) => o.alive && o.owner === u && !(o.mon && o.mon.giant)).length;
  let need = opt.n != null ? opt.n : max - mine; if (need <= 0) return made;
  const occ = new Set(B.f.filter((o) => o.alive).map((o) => o.r * COLS + o.c));
  const seen = new Set([u.r * COLS + u.c]), q = [[u.r, u.c]];
  while (q.length && need > 0) {
    const [r, c] = q.shift();
    for (const [nr, nc] of neighbors(r, c)) {
      const k = nr * COLS + nc; if (seen.has(k)) continue; seen.add(k); q.push([nr, nc]);
      if (occ.has(k) || need <= 0) continue;
      const g = opt.giant ? { hp: 4, ad: 3 } : { hp: 1, ad: 1 };
      const f = makeFighter({ mon: { mn: opt.giant ? "거대 다연" : "다연", hp: 260 * P * g.hp, ad: 28 * P * g.ad, as: 0.8, rg: 1, ar: opt.giant ? 0.3 : 0.1, col: "#7ff0e0", summon: 1, giant: opt.giant ? 1 : 0 } }, u.team, nr, nc, {});
      f.owner = u; f.X = nc + (nr & 1) * 0.5; f.Y = nr; occ.add(k); B.f.push(f); made.push(f); need--;
    }
  }
  return made;
}
// 김예균 "세계를 가르는 참격": 하늘이 물들고(REND_AT초) → 참격이 하나씩 쏟아지고(REND_GAP초 간격) → 전장을 가로로 가르는 거대한 참격
const REND_AT = 0.7, REND_GAP = 0.09, REND_FALL = 0.22;
function stepRend(B, z, dt) {
  z.t += dt;
  const u = z.owner, foes = () => B.f.filter((o) => o.alive && o.team !== z.team);
  z.X = u.X; z.Y = u.Y;
  while (z.drops.length < z.n && z.t >= REND_AT + z.drops.length * REND_GAP - REND_FALL) { // 떨어질 자리를 미리 정해요 (가까운 적부터 5명을 번갈아)
    const i = z.drops.length, live = foes().sort((a, b) => hexDist(a, u) - hexDist(b, u) || a.r - b.r || a.c - b.c);
    const o = live.length ? live[i % Math.min(live.length, 5)] : null;
    z.drops.push({ o, at: REND_AT + i * REND_GAP, X: o ? o.X : u.X, Y: o ? o.Y : u.Y, tilt: (i % 2 ? 1 : -1) * (0.3 + (i % 3) * 0.22), yaw: (i % 2 ? 1 : -1) * (0.15 + (i % 3) * 0.12), hit: 0 });
  }
  for (const d of z.drops) {
    if (d.hit) continue;
    if (d.o && d.o.alive) { d.X = d.o.X; d.Y = d.o.Y; }
    if (z.t < d.at) continue;
    d.hit = 1;
    if (d.o && d.o.alive && u.alive) { dealDamage(B, u, d.o, 55 * z.P, "skill"); addFx(B, d.X, d.Y, 1.1, "#ff2a3a", 0.3); }
    if (B.visual) { S.shake = Math.max(S.shake || 0, 0.1); sfx("kick"); }
  }
  if (!z.world && z.t >= z.wAt - 0.45) { // 가를 줄: 적이 가장 많이 선 줄
    const live = foes(), cnt = {};
    live.forEach((o) => { for (const r of [o.r - 1, o.r, o.r + 1]) cnt[r] = (cnt[r] || 0) + 1; });
    let row = live.length ? live[0].r : 3, best = -1;
    for (let r = 0; r < 8; r++) if ((cnt[r] || 0) > best) { best = cnt[r] || 0; row = r; }
    z.world = { r: row, Y: row, at: z.wAt, hit: 0 };
  }
  if (z.world && !z.world.hit && z.t >= z.wAt) {
    z.world.hit = 1;
    if (u.alive) foes().forEach((o) => {
      const on = Math.abs(o.r - z.world.r) <= 1;
      dealDamage(B, u, o, (80 + (on ? (z.legend ? 170 : 110) : 0)) * z.P, "skill");
      if (on && o.alive) o.stunT = Math.max(o.stunT || 0, 0.6);
    });
    addHuge(B, { X: 3, Y: z.world.Y }, "解", "#ffffff", "#ff2a3a", z.legend ? 5.2 : 4.6);
    if (B.visual) { S.shake = Math.max(S.shake || 0, z.legend ? 0.9 : 0.7); sfx("boom"); }
  }
  if (z.t >= z.dur) z.done = 1;
}
// 김예균 "이다연 군단": 소환문이 열리고(LEGION_AT초) 이다연이 하나씩 떨어져 쿵!
const LEGION_AT = 0.6;
function stepLegion(B, z, dt) {
  z.t += dt;
  for (const f of z.news) {
    if (f.landed) continue;
    f.dropT = Math.max(0, Math.min(1, (f.dropAt - z.t) / 0.35)); // 1 → 0 이 되면 땅에 닿아요
    if (z.t < f.dropAt) continue;
    f.landed = 1; f.dropT = 0;
    if (!f.alive) continue;
    const big = f.mon.giant;
    near(B.f.filter((o) => o.alive && o.team !== z.team), f, big ? 2 : 1).forEach((o) => { dealDamage(B, z.owner, o, (big ? 180 : 60) * z.P, "skill"); if (o.alive) o.stunT = Math.max(o.stunT || 0, big ? 1.2 : 0.5); });
    addFx(B, f.X, f.Y, big ? 3.2 : 1.3, "#7ff0e0", 0.55); addFx(B, f.X, f.Y, big ? 2 : 0.8, "#ffffff", 0.35);
    if (B.visual) { B.fx.push({ kind: "puff", X: f.X, Y: f.Y, t: 0.5, t0: 0.5 }); S.shake = Math.max(S.shake || 0, big ? 0.6 : 0.12); sfx(big ? "boom" : "kick"); }
  }
  if (z.t >= z.dur) z.done = 1;
}

// ---------- 2코스트 스킬 연출 ----------
// 시간만 흐르는 장판 (자리는 고정)
function stepTimer(B, z, dt) { z.t += dt; if (z.t >= z.dur) z.done = 1; }
// 전하율 "약점 공략": 약점이 남아 있는 동안 대상 위에 과녁이 따라다녀요
function stepMark(B, z, dt) { z.t += dt; z.X = z.tgt.X; z.Y = z.tgt.Y; if (z.t >= z.dur || !z.tgt.alive || !(z.tgt.vulnT > 0)) z.done = 1; }
// 이준희 "덩크슛": 골대가 나타나고(0.3초) 내리꽂기
const DUNK_AT = 0.3;
function stepDunk(B, z, dt) {
  const t0 = z.t; z.t += dt;
  const u = z.owner;
  if (t0 < DUNK_AT) {
    if (!z.tgt.alive) z.tgt = nearest(B, u) || z.tgt;
    z.X = z.tgt.X; z.Y = z.tgt.Y;
    if (z.t >= DUNK_AT) {
      const t = z.tgt;
      if (t.alive) {
        dealDamage(B, u, t, u.ad * 1.8 + 140 * z.P, "skill"); if (t.alive) t.stunT = Math.max(t.stunT || 0, 1);
        near(B.f.filter((o) => o.alive && o.team !== z.team), t, 1).forEach((o) => o !== t && dealDamage(B, u, o, 60 * z.P, "skill"));
      }
      addFx(B, z.X, z.Y, 1.4, C("--accent")); addFx(B, z.X, z.Y, 2.2, "#ff8a3a", 0.6); addFx(B, z.X, z.Y, 0.9, "#ffffff", 0.35);
      addHuge(B, z, "덩크!", "#fff1b0", "#ff8a3a", 3);
      if (B.visual) { S.shake = 0.3; sfx("boom"); }
    }
  }
  if (z.t >= z.dur) z.done = 1;
}
// ---------- 3코스트 스킬 연출 ----------
// 보여 주기만 하는 장판 (전투 계산에는 영향 없음)
function stepShow(B, z, dt) { z.t += dt; z.X = z.owner.X; z.Y = z.owner.Y; if (z.t >= z.dur) z.done = 1; }
// 김민기 "노트 필기 공유": 연필이 세 번 줄을 그을 때마다 피해
const SCRIB_AT = [0.15, 0.33, 0.51];
function stepScribble(B, z, dt) {
  const t0 = z.t; z.t += dt;
  SCRIB_AT.forEach((at, i) => {
    if (!(t0 < at && z.t >= at)) return;
    near(B.f.filter((o) => o.alive && o.team !== z.team), z, 1).forEach((o) => dealDamage(B, z.owner, o, 50 * z.P, "skill"));
    addFx(B, z.X, z.Y, 1.3 + i * 0.3, i % 2 ? "#ffffff" : "#ffe66b", 0.4);
    if (i === 2) { addHuge(B, z, "필기 끝!", "#ffffff", "#c86bff", 2.4); if (B.visual) { S.shake = Math.max(S.shake || 0, 0.15); sfx("boom"); } }
    else if (B.visual) sfx("kick");
  });
  if (z.t >= z.dur) z.done = 1;
}
// 최윤서 "그물 던지기": 그물이 날아가고(NET_AT초) 떨어지는 순간 범위 안 적을 묶어요
const NET_AT = 0.45;
function stepNet(B, z, dt) {
  const t0 = z.t; z.t += dt;
  if (!(t0 < z.hitAt && z.t >= z.hitAt)) { if (z.t >= z.dur) z.done = 1; return; }
  const u = z.owner, foes = foesOf(B, z.team), hit = near(foes, z, z.rad);
  const occ = new Set(B.f.filter((o) => o.alive).map((o) => o.r * COLS + o.c));
  hit.sort((a, b) => hexDist(a, z) - hexDist(b, z)).forEach((o) => {
    dealDamage(B, u, o, 90 * z.P, "skill");
    if (!o.alive) return;
    o.stunT = Math.max(o.stunT || 0, z.hold); o.vuln = Math.max(o.vuln || 0, 0.2); o.vulnT = Math.max(o.vulnT || 0, 3);
    if (z.pull && hexDist(o, z) > 0) { // 그물 가운데로 한 칸 끌어당겨요
      let best = null, bd = hexDist(o, z);
      for (const [nr, nc] of neighbors(o.r, o.c)) { const nd = hexDistRC(nr, nc, z.r, z.c); if (nd < bd && !occ.has(nr * COLS + nc)) { bd = nd; best = [nr, nc]; } }
      if (best) { occ.delete(o.r * COLS + o.c); o.r = best[0]; o.c = best[1]; occ.add(o.r * COLS + o.c); }
    }
    addFx(B, o.X, o.Y, 0.7, "#7fffd0", 0.4);
  });
  z.caught = hit.map((o) => ({ o })); // 걸린 적마다 그물이 덮여요 (연출용)
  addFx(B, z.X, z.Y, z.rad + 1, "#2fd0a0", 0.6); addFx(B, z.X, z.Y, z.rad + 0.3, "#ffffff", 0.35);
  if (hit.length) addHuge(B, z, "꼼짝 마!", "#ffffff", "#2fd0a0", 2.6);
  if (B.visual) { S.shake = Math.max(S.shake || 0, 0.12); sfx("kick"); }
}
// 은혜린 "춤추기": 무대(은혜린을 따라다녀요) 위 아군은 빨라지고 회복, 적은 처음에 한 번 멈칫
function stepDance(B, z, dt) {
  const u = z.owner;
  if (!u.alive) { z.done = 1; return; }
  z.t += dt; z.X = u.X; z.Y = u.Y; z.r = u.r; z.c = u.c; z.tick += dt;
  if (z.tick >= 0.5 || !z.n) {
    z.tick = z.n ? z.tick - 0.5 : 0; z.n++;
    const on = B.f.filter((o) => o.alive && o.team === z.team && hexDist(o, z) <= z.rad);
    on.forEach((o) => { o.asBuff = Math.max(o.asBuff || 0, z.asb); o.asBuffT = Math.max(o.asBuffT || 0, 0.7); o.grooveUntil = B.t + 0.7; heal(B, o, z.heal); });
    z.on = on.map((o) => ({ o })); // 무대 위 아군 (연출용: 발밑 반짝임)
    if (!z.froze) { z.froze = 1; near(foesOf(B, z.team), z, z.rad).forEach((o) => { o.stunT = Math.max(o.stunT || 0, 0.5); }); }
  }
  if (z.t >= z.dur) z.done = 1;
}
// 조하윤 "¡Adiós!": 조준(0.4초) → 저격
function stepSnipe(B, z, dt) {
  z.t += dt; z.X = z.owner.X; z.Y = z.owner.Y;
  if (z.t < z.dur) return;
  z.done = 1;
  const u = z.owner, P = z.P;
  let o = z.tgt; if (!o.alive) o = B.f.filter((x) => x.alive && x.team !== u.team).sort(byHp)[0];
  if (!o) return;
  B.projs.push({ X: u.X, Y: u.Y, t: o, sp: 24, col: "#ff5a4a", sz: 0.16, trail: 1, shape: "dart", hit: () => {
    dealDamage(B, u, o, u.ad * 1.5 + 180 * P, "skill");
    addFx(B, o.X, o.Y, 0.6, "#7ff0ff", 0.35); addFx(B, o.X, o.Y, 1.4, "#ff5a4a", 0.5);
    if (!o.alive) { u.mana = Math.min(u.mm - 1, u.mana + u.mm * 0.5); addHuge(B, o, "¡Olé!", "#fff1b0", "#ffb43a", 3); }
    else addHuge(B, o, "¡Adiós!", "#ffffff", "#ff5a4a", 2.2);
    if (B.visual) S.shake = Math.max(S.shake || 0, 0.15);
  } });
  if (B.visual) sfx("kick");
}

// ---------- 4코스트 스킬 연출 (장판 zones 의 step 함수) ----------
const foesOf = (B, team) => B.f.filter((o) => o.alive && o.team !== team);
// 박희찬 "무회전 프리킥": 조준(0.45초) → 흔들리며 날아가는 불공 → 골!!
function stepFreekick(B, z, dt) {
  z.t += dt; z.X = z.owner.X; z.Y = z.owner.Y;
  if (z.t < z.dur) return;
  z.done = 1;
  const u = z.owner, P = z.P;
  let t = z.tgt; if (!t.alive) t = nearest(B, u);
  if (!t) return;
  B.projs.push({ X: u.X, Y: u.Y, t, sp: 17, col: "#ffffff", sz: 0.22, trail: 1, ball: 1, fire: 1, hit: () => {
    const dmg = u.ad * 1.8 + 220 * P;
    dealDamage(B, u, t, dmg, "skill"); if (t.alive) t.stunT = Math.max(t.stunT || 0, 0.5);
    near(foesOf(B, u.team), t, 1).forEach((o) => o !== t && dealDamage(B, u, o, dmg * 0.55, "skill"));
    addFx(B, t.X, t.Y, 2.2, "#ffb43a", 0.6); addFx(B, t.X, t.Y, 1.4, "#ffffff", 0.45); addFx(B, t.X, t.Y, 0.9, "#ff5a2a", 0.7);
    addHuge(B, t, "골!!", "#ffffff", "#ffb43a", 3.4);
    if (B.visual) { S.shake = 0.3; sfx("boom"); }
  } });
  if (B.visual) { S.shake = Math.max(S.shake, 0.12); sfx("kick"); }
}
// 진성욱 "풀코트 프레스": 뛰어올랐다가(0.28초) 내리찍기 → 피해 + 기절 + 밀쳐내기
const SLAM_AT = 0.28;
function stepSlam(B, z, dt) {
  const t0 = z.t; z.t += dt;
  const u = z.owner;
  if (t0 < SLAM_AT) { z.X = u.X; z.Y = u.Y; }
  if (t0 < SLAM_AT && z.t >= SLAM_AT) {
    if (!u.alive) { z.done = 1; return; }
    z.r = u.r; z.c = u.c;
    const occ = new Set(B.f.filter((o) => o.alive).map((o) => o.r * COLS + o.c));
    near(foesOf(B, z.team), u, 1).forEach((o) => {
      dealDamage(B, u, o, u.ad * 1.6 + 110 * z.P, "skill");
      if (!o.alive) return;
      o.stunT = Math.max(o.stunT || 0, 0.4);
      const back = neighbors(o.r, o.c).find(([nr, nc]) => hexDistRC(nr, nc, u.r, u.c) === 2 && !occ.has(nr * COLS + nc));
      if (back) { occ.delete(o.r * COLS + o.c); o.r = back[0]; o.c = back[1]; occ.add(o.r * COLS + o.c); o.moveCd = 0.5; }
    });
    heal(B, u, u.maxHp * 0.12);
    addFx(B, u.X, u.Y, 2.6, "#ff5a2a", 0.6); addFx(B, u.X, u.Y, 1.7, "#ffd36b", 0.5); addFx(B, u.X, u.Y, 1.0, "#ffffff", 0.35);
    addHuge(B, u, "쾅!", "#fff1b0", "#ff5a2a", 3.6);
    if (B.visual) { S.shake = 0.4; sfx("boom"); }
  }
  if (z.t >= z.dur) z.done = 1;
}
// 박준서 "수학 문제 폭격": 수학 공식이 하나씩 떨어져요
// 떨어지는 공식 (마지막 것이 가장 커요). 여기 글자만 바꾸면 다른 공식이 떨어져요
const MATH_SYMS = ["a²+b²=c²", "y=ax+b", "S=πr²", "sin²θ+cos²θ=1", "x=(-b±√(b²-4ac))/2a"];
function stepMathRain(B, z, dt) {
  z.t += dt;
  for (const d of z.drops) {
    if (!d.hit) { d.X = d.o.X; d.Y = d.o.Y; }
    if (d.hit || z.t < d.at) continue;
    d.hit = 1;
    if (!d.o.alive) { const live = foesOf(B, z.team); if (live.length) { d.o = rnd(live); d.X = d.o.X; d.Y = d.o.Y; } }
    if (d.o.alive) dealDamage(B, z.owner, d.o, 130 * z.P, "skill");
    addFx(B, d.X, d.Y, 1.3, "#c86bff", 0.5); addFx(B, d.X, d.Y, 0.8, "#ffffff", 0.35);
    addFloat(B, { X: d.X, Y: d.Y - 0.2 }, d.sym, "#f0d8ff", true);
    if (B.visual) { S.shake = Math.max(S.shake, 0.1); sfx("boom"); }
  }
  if (z.t >= z.dur) z.done = 1;
}

// 정주환 "천벌": ① 먹구름이 몰려오며 번개 기운을 모아요 → ② 적마다 번개가 하나씩 → ③ 마지막 거대한 심판의 번개
const SMITE_CHARGE = 0.7; // 번개를 모으는 시간(초)
const MEGA_R = 2; // ★3 큰 번개가 크게 맞히는 범위(칸)
function stepSmite(B, z, dt) {
  const t0 = z.t; z.t += dt;
  const foes = B.f.filter((o) => o.alive && o.team !== z.team);
  if (t0 < SMITE_CHARGE && z.t >= SMITE_CHARGE) {
    const order = shuffle(foes.slice());
    z.strikes = order.map((o, i) => ({ o, at: SMITE_CHARGE + i * 0.12, X: o.X, Y: o.Y }));
    const last = z.strikes.length ? z.strikes[z.strikes.length - 1].at : SMITE_CHARGE;
    const boss = foes.slice().sort((a, b) => b.hp - a.hp)[0];
    z.big = boss ? { o: boss, at: last + 0.35, X: boss.X, Y: boss.Y, big: 1 } : null;
    // ★3: 마지막은 적이 가장 많이 모인 곳에 떨어지는 엄청 큰 번개
    if (z.owner.star >= 3 && foes.length) {
      const crowd = (o) => near(foes, o, MEGA_R).length * 1000 + o.hp / 1e4;
      const c = foes.slice().sort((a, b) => crowd(b) - crowd(a))[0];
      z.big = { o: c, at: last + 0.85, X: c.X, Y: c.Y, big: 1, mega: 1 };
    }
    z.dur = (z.big ? z.big.at : last) + (z.big && z.big.mega ? 1.3 : 0.6);
  }
  for (const s of z.strikes || []) if (!s.hit && z.t >= s.at) {
    s.hit = 1; s.X = s.o.X; s.Y = s.o.Y;
    if (s.o.alive) { dealDamage(B, z.owner, s.o, 110 * z.P, "skill"); s.o.stunT = Math.max(s.o.stunT || 0, 0.6); }
    addFx(B, s.X, s.Y, 1.2, "#cfefff", 0.45); addFx(B, s.X, s.Y, 0.7, "#ffe66b", 0.6);
    if (B.visual) { S.shake = Math.max(S.shake, 0.12); sfx("thunder"); }
  }
  const s = z.big;
  if (s && !s.hit && z.t >= s.at) {
    s.hit = 1; s.X = s.o.X; s.Y = s.o.Y;
    if (s.mega) {
      // 신의 심판: 가운데 MEGA_R칸 안은 크게 + 1초 기절, 나머지 적 모두에게도 피해
      const cr = { r: s.o.r, c: s.o.c };
      foes.forEach((o) => {
        const inside = hexDist(o, cr) <= MEGA_R;
        dealDamage(B, z.owner, o, (inside ? 260 : 120) * z.P, "skill");
        if (inside && o.alive) o.stunT = Math.max(o.stunT || 0, 1);
      });
      for (const [r, col, d] of [[7, "#ffffff", 0.9], [5, "#9fdcff", 1.1], [9, "#ffe66b", 1.3], [3, "#ffffff", 0.6]]) addFx(B, s.X, s.Y, r, col, d);
      if (B.visual) { S.shake = 1.1; sfx("thunder"); sfx("boom"); setTimeout(() => sfx("thunder"), 120); }
    } else {
      if (s.o.alive) dealDamage(B, z.owner, s.o, 150 * z.P, "skill");
      near(foes, s.o, 1).forEach((o) => o !== s.o && dealDamage(B, z.owner, o, 60 * z.P, "skill"));
      addFx(B, s.X, s.Y, 3, "#9fdcff", 0.7); addFx(B, s.X, s.Y, 1.8, "#ffffff", 0.5); addFx(B, s.X, s.Y, 2.4, "#ffe66b", 0.8);
      if (B.visual) { S.shake = 0.45; sfx("thunder"); sfx("boom"); }
    }
  }
  if (z.t >= z.dur) z.done = 1;
}
