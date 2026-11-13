// ============================================================
//  battle.js — 전투 계산 (능력치 · 이동 · 공격 · 스킬 · 피해)
// ============================================================
"use strict";
// =============== 전투 엔진 ===============
function makeFighter(spec, team, r, c, cnt, buff) {
  const f = { team, r, c, X: c + (r & 1) * 0.5, Y: r, alive: true, shield: 0, mana: 0, crit: 0, amp: 1, mgain: 1,
    asStack: 0, atkCd: 0.25 + Math.random() * 0.3, moveCd: 0, sec: 0, tgt: null, flash: 0, lunge: 0, lx: 0, ly: 0, deadT: 0, items: [], star: 1 };
  if (spec.mon) {
    const m = spec.mon;
    Object.assign(f, { mon: m, d: -1, maxHp: m.hp, ad: m.ad, as0: m.as, rg: m.rg, ar: m.ar, mm: Infinity });
    f.hp = f.maxHp; return f;
  }
  const def = DEFS[spec.d], cl = CLASS[def.k], cf = 1 + (def.c - 1) * 0.22, sm = STARM[spec.star], tn = tuneOf(def), lg = legendOf(def, spec.star);
  Object.assign(f, { d: spec.d, star: spec.star, items: spec.items.slice(), maxHp: cl.hp * cf * sm * tn.hp * lg.hp, ad: cl.ad * cf * sm * tn.ad * lg.ad,
    as0: cl.as, rg: cl.rg, ar: cl.ar, mm: cl.mm, power: cf * sm * tn.sk * lg.sk });
  if (lg.sk > 1) f.mana = cl.mm; // 전설은 시작하자마자 스킬을 써요
  const L = (t) => traitLvl(t, cnt[t] || 0), has = (t) => (def.t.includes(t) ? L(t) : 0);
  f.maxHp *= [1, 1.2, 1.4, 1.5][has("운동광")];
  if (has("지는 거 못 참음")) { f.ad *= [1, 1.2, 1.45, 1.6][has("지는 거 못 참음")]; f.crit = 0.2; }
  f.amp = 1; f.power *= [1, 1.6, 2.1, 2.8][has("공부는 잘함")]; // 공부는 잘함: 스킬 세기(피해·회복·보호막 모두) 증가
  f.as0 *= [1, 1.3, 1.55, 1.65][has("축구부")];
  if (has("수학왕")) f.mgain = 1.6;
  if (has("댄스부")) { f.dance = 1; f.as0 *= 1.25; } // 댄스부(은혜린·최윤서) 2명: 공격 속도 +25%, 은혜린 춤추기 무대 1초 더
  if (has("프로게이머")) f.as0 *= 1.3;
  if (has("전교 1등")) f.amp += 0.4;
  if (L("신") > 0) { f.maxHp *= 1.12; f.ad *= 1.12; }
  const st = {};
  for (const id of f.items) for (const [k, v] of Object.entries(ITEMS[id].st)) st[k] = (st[k] || 0) + v;
  f.ad *= 1 + (st.adPct || 0); f.as0 *= 1 + (st.asPct || 0);
  f.maxHp = (f.maxHp + (st.hp || 0)) * (1 + (st.hpPct || 0));
  f.ar = Math.min(0.75, f.ar + (st.ar || 0)); f.amp += st.amp || 0; f.mana += st.mana || 0;
  f.crit += st.crit || 0; f.mgain *= 1 + (st.mgainPct || 0);
  for (const k of ["stackAs", "lifesteal", "splash", "skillCrit", "manaOnHit", "lowHpAs", "thorns", "manaTick", "lowShield", "regen", "teamShield", "castShield", "castHeal", "refund"]) f[k] = st[k] || 0;
  if (buff) { f.as0 *= 1 + buff.as; f.ar = Math.min(0.75, f.ar + buff.ar); f.ad *= 1 + buff.ad; f.maxHp *= 1 + buff.hp; }
  f.shield += f.maxHp * [0, 0.15, 0.5][L("다 퍼줌")]; // 다 퍼줌: 최대 체력 비율만큼 보호막 (별·아이템이 오를수록 같이 커져요)
  f.hp = f.maxHp; f.mana = Math.min(f.mana, f.mm - 1);
  return f;
}
function teamCounts(side, P) {
  const c = traitCounts(side.filter((x) => !x.spec.mon).map((x) => x.spec.d));
  if (P && side.length) for (const [t, n] of Object.entries(P.emb)) c[t] = (c[t] || 0) + n;
  return c;
}
function makeBattle(sideA, sideB, visual, PA, PB) {
  const cA = teamCounts(sideA, PA), cB = teamCounts(sideB, PB);
  const f = [];
  sideA.forEach((x) => f.push(makeFighter(x.spec, 0, 4 + x.lr, x.c, cA, PA && PA.buff)));
  sideB.forEach((x) => f.push(makeFighter(x.spec, 1, 3 - x.lr, COLS - 1 - x.c, cB, PB && PB.buff)));
  for (const team of [0, 1]) combineRobot(f, team, visual);
  for (const u of f) if (u.teamShield) for (const o of f) if (o !== u && o.team === u.team && hexDist(u, o) <= 1) o.shield += u.teamShield;
  return { f, projs: [], fx: [], floats: [], zones: [], t: 0, done: false, win: null, visual };
}
function runBattle(B) { let n = 0; while (!B.done && n++ < 4000) stepBattle(B, 1 / 20); }
const speedOf = (u) => Math.min(4, u.as0 * (1 + u.asStack + (u.asBuffT > 0 ? u.asBuff : 0) + (u.lowHpAs && u.hp < u.maxHp * 0.5 ? u.lowHpAs : 0)));
function nearest(B, u) {
  let best = null, bd = 1e9;
  for (const o of B.f) if (o.alive && o.team !== u.team) { const d = hexDist(u, o) + Math.random() * 0.1; if (d < bd) { bd = d; best = o; } }
  return best;
}
function nextStep(B, u, t) {
  const occ = new Set(B.f.filter((o) => o.alive && o !== u).map((o) => o.r * COLS + o.c));
  const start = u.r * COLS + u.c, first = new Map([[start, -1]]), q = [[u.r, u.c]];
  while (q.length) {
    const [r, c] = q.shift(), key0 = r * COLS + c;
    if (key0 !== start && hexDistRC(r, c, t.r, t.c) <= u.rg) { const f = first.get(key0); return [Math.floor(f / COLS), f % COLS]; }
    for (const [nr, nc] of neighbors(r, c)) {
      const key = nr * COLS + nc;
      if (first.has(key) || occ.has(key)) continue;
      const fk = first.get(key0); first.set(key, fk === -1 ? key : fk);
      q.push([nr, nc]);
    }
  }
  return null;
}
function addFloat(B, t, text, col, big) {
  if (!B.visual) return;
  B.fn = ((B.fn || 0) + 1) % 7; // 숫자가 겹치지 않게 조금씩 옆으로
  B.floats.push({ X: t.X + (B.fn - 3) * 0.08, Y: t.Y, h: 2.1, text, col, t: 0.9, big });
}
// 화면에 크게 뜨는 글자 (스킬 연출용)
function addHuge(B, t, text, c1, c2, size = 3.2) { if (B.visual) B.floats.push({ X: t.X, Y: t.Y, h: 2.6, text, col: c1, col2: c2, t: 0.9, t0: 0.9, huge: size }); }
function addFx(B, X, Y, r, col, dur = 0.5) { if (B.visual) B.fx.push({ X, Y, r, col, t: dur, t0: dur }); }
function dealDamage(B, src, t, amt, kind) {
  if (!t.alive) return 0;
  let crit = false;
  if (kind === "skill") amt *= src.amp;
  if (kind === "exec") { amt = Math.ceil(t.hp + t.shield); t.shield = 0; t.hp = 0; } // 처형: 보호막·방어 무시하고 바로 쓰러뜨려요
  else {
    if ((kind === "atk" || (kind === "skill" && src.skillCrit)) && Math.random() < src.crit) { amt *= 1.5; crit = true; }
    amt = Math.max(1, Math.round(amt * (1 - t.ar) * (t.vulnT > 0 ? 1 + t.vuln : 1)));
    const abs = Math.min(t.shield, amt); t.shield -= abs; t.hp -= amt - abs;
  }
  t.flash = 0.12;
  if (src && !src.mon) src.dmg = (src.dmg || 0) + amt;
  if (t.mm !== Infinity && kind !== "thorn") t.mana = Math.min(t.mm, t.mana + 3 * t.mgain);
  if (t.lowShield && !t.lsUsed && t.hp > 0 && t.hp < t.maxHp * 0.4) { t.lsUsed = 1; t.shield += t.lowShield; addFx(B, t.X, t.Y, 0.7, TOK["--c3"]); }
  if (B.visual && kind !== "thorn" && kind !== "splash") B.fx.push({ kind: "spark", X: t.X, Y: t.Y, col: crit ? TOK["--accent"] : kind === "skill" ? TOK["--c4"] : "#ffe9c0", t: 0.3, t0: 0.3 });
  addFloat(B, t, crit ? amt + "!" : String(amt), crit ? TOK["--accent"] : kind === "skill" ? TOK["--c4"] : TOK["--chalk"], crit ? 2 : kind === "skill");
  if (crit && B.visual) { addFx(B, t.X, t.Y, 0.9, TOK["--accent"], 0.3); S.shake = Math.max(S.shake || 0, 0.08); sfx("crit"); }
  if (t.hp <= 0) {
    t.alive = false; t.hp = 0; t.deadT = 0.6;
    if (B.visual) { // 쓰러질 때: 펑 하는 연기와 별
      const boss = t.mon && t.mon.boss;
      B.fx.push({ kind: "spark", X: t.X, Y: t.Y, col: "#ffffff", t: 0.5, t0: 0.5 }, { kind: "spark", X: t.X, Y: t.Y, col: "#ffe66b", t: 0.65, t0: 0.65 }, { kind: "puff", X: t.X, Y: t.Y, t: 0.55, t0: 0.55 });
      addFx(B, t.X, t.Y, boss ? 2.6 : 1.2, "#ffffff", 0.45);
      if (boss) { addFx(B, t.X, t.Y, 3.6, "#ffd36b", 0.7); S.shake = 0.5; addHuge(B, t, "격파!", "#ffffff", "#ffd36b", 3.6); }
      sfx(boss ? "boom" : "ko");
    }
  }
  return amt;
}
function heal(B, t, amt) {
  if (!t.alive) return;
  amt = Math.round(Math.min(amt, t.maxHp - t.hp)); if (amt <= 0) return;
  t.hp += amt;
  if (amt >= 8) addFloat(B, t, "+" + amt, TOK["--c2"], false);
}
function gainMana(B, u, n) {
  if (u.mm === Infinity || !u.alive) return;
  u.mana += n * u.mgain;
  if (u.mana >= u.mm) { u.mana = u.refund || 0; cast(B, u); }
}
function onHit(B, u, t) {
  if (!t.alive) return;
  const dealt = dealDamage(B, u, t, u.ad, "atk");
  if (u.lifesteal) heal(B, u, dealt * u.lifesteal);
  if (u.stackAs) u.asStack = Math.min(2, u.asStack + u.stackAs);
  if (u.splash) for (const o of B.f) if (o.alive && o.team !== u.team && o !== t && hexDist(o, t) === 1) dealDamage(B, u, o, u.ad * u.splash, "splash");
  if (u.rg <= 1 && t.thorns && u.alive) dealDamage(B, t, u, dealt * t.thorns, "thorn");
  if (B.visual) sfx("hit");
}
function attack(B, u, t) {
  const sh = u.robot ? (Math.random() < 0.5 ? SHOUT["조하윤"] : SHOUT["윤동욱"]) : u.d >= 0 && SHOUT[DEFS[u.d].n];
  if (B.visual && sh && Math.random() < sh[2]) addFloat(B, { X: u.X + (Math.random() - 0.5) * 0.8, Y: u.Y - 0.3 }, rnd(sh[0]), sh[1], false);
  u.atkT = ATK_T;
  if (u.rg > 1) {
    const wp = u.d >= 0 && WEAPONS[DEFS[u.d].n], pr = wp && wp.pr, who = u.d >= 0 && DEFS[u.d].n;
    if (who === "정주환") B.zones.push({ kind: "zap", step: stepZap, team: u.team, owner: u, tgt: t, X: t.X, Y: t.Y, t: 0, hitAt: ZAP_AT, dur: ZAP_AT + 0.22 }); // 평타도 하늘에서 번개
    else B.projs.push({ X: u.X, Y: u.Y, t, sp: 9, col: who === "조하윤" ? (Math.random() < 0.5 ? "#e8402e" : "#f6c431") : pr && pr.col ? pr.col : u.team ? TOK["--danger"] : TOK["--chalk"], shape: pr && pr.shape, trail: pr && pr.shape === "plane" ? 1 : 0, sz: 0.1, who: who || null, hit: () => onHit(B, u, t) });
  }
  else {
    u.lunge = 0.18; u.lx = t.X - u.X; u.ly = t.Y - u.Y;
    if (B.visual) B.fx.push({ kind: "slash", X: t.X, Y: t.Y, ax: u.X, ay: u.Y, col: u.team ? "#ffb0a0" : "#fff6d0", t: 0.26, t0: 0.26, flip: (B.sn = (B.sn || 0) + 1) % 2, who: !u.robot && u.d >= 0 ? DEFS[u.d].n : null });
    onHit(B, u, t);
  }
  gainMana(B, u, 10 + u.manaOnHit);
}
// 정주환 평타: 대상 머리 위로 작은 번개가 떨어져요 (ZAP_AT초 뒤에 맞아요, 예전 구슬이 날아가던 시간과 비슷하게)
const ZAP_AT = 0.18;
function stepZap(B, z, dt) {
  z.t += dt;
  if (!z.hit) { if (z.tgt.alive) { z.X = z.tgt.X; z.Y = z.tgt.Y; } if (z.t >= z.hitAt) { z.hit = 1; if (z.tgt.alive) onHit(B, z.owner, z.tgt); } }
  if (z.t >= z.dur) z.done = 1;
}
function cast(B, u) {
  const def = DEFS[u.d], P = u.power;
  if (!u.tgt || !u.tgt.alive) u.tgt = nearest(B, u);
  const t = u.tgt;
  const allies = B.f.filter((o) => o.alive && o.team === u.team), foes = B.f.filter((o) => o.alive && o.team !== u.team);
  u.castT = 0.35;
  const SKU = u.robot ? (u.mega ? MEGA_SK : ROBOT_SK) : SK[def.n];
  addFloat(B, { X: u.X, Y: u.Y }, SKU ? SKU.s : CLASS[def.k].sk, TOK["--accent"], true);
  if (B.visual) sfx("cast");
  if (SKU) SKU.run(B, u, P, t, allies, foes);
  else switch (def.k) {
    case "수호자": u.shield += 260 * P; addFx(B, u.X, u.Y, 0.8, TOK["--c3"]); break;
    case "돌격대": if (t) { dealDamage(B, u, t, u.ad * 2 + 130 * P, "skill"); addFx(B, t.X, t.Y, 0.6, TOK["--danger"], 0.35); } break;
    case "저격수":
      if (t) B.projs.push({ X: u.X, Y: u.Y, t, sp: 16, col: TOK["--accent"], sz: 0.2, trail: 1, hit: () => dealDamage(B, u, t, u.ad * 1.6 + 160 * P, "skill") });
      break;
    case "천재":
      if (t) { foes.filter((o) => hexDist(o, t) <= 1).forEach((o) => dealDamage(B, u, o, 170 * P, "skill")); addFx(B, t.X, t.Y, 1.6, TOK["--c4"]); }
      break;
    case "응원단": {
      const low = allies.slice().sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (low) { heal(B, low, 230 * P); addFx(B, low.X, low.Y, 0.8, TOK["--c2"]); }
      break;
    }
    case "신":
      foes.forEach((o) => dealDamage(B, u, o, 150 * P, "skill"));
      allies.forEach((o) => heal(B, o, 110 * P));
      addFx(B, u.X, u.Y, 6, TOK["--c5"], 0.8);
      if (B.visual) { S.shake = 0.35; sfx("boom"); }
      break;
  }
  if (u.castShield) u.shield += u.castShield;
  if (u.castHeal) allies.filter((o) => hexDist(o, u) <= 2).forEach((o) => heal(B, o, u.castHeal));
}
function stepBattle(B, dt) {
  const cr = B.f.find((u) => u.combo && u.combo.t < u.combo.dur);
  if (cr) { stepCombo(B, cr, dt); return; }
  B.t += dt;
  for (const u of B.f) {
    const k = Math.min(1, dt * 9);
    u.X += (u.c + (u.r & 1) * 0.5 - u.X) * k; u.Y += (u.r - u.Y) * k;
    if (!u.alive) continue;
    u.flash = Math.max(0, u.flash - dt); u.lunge = Math.max(0, u.lunge - dt); u.castT = Math.max(0, (u.castT || 0) - dt); u.atkT = Math.max(0, (u.atkT || 0) - dt);
    u.asBuffT = Math.max(0, (u.asBuffT || 0) - dt); u.vulnT = Math.max(0, (u.vulnT || 0) - dt);
    if (u.stunT > 0) { u.stunT -= dt; continue; }
    u.sec += dt;
    if (u.sec >= 1) { u.sec -= 1; if (u.manaTick) gainMana(B, u, u.manaTick); if (u.regen) heal(B, u, u.maxHp * u.regen); }
    if (!u.tgt || !u.tgt.alive || hexDist(u, u.tgt) > u.rg) u.tgt = nearest(B, u);
    const t = u.tgt; if (!t) continue;
    if (hexDist(u, t) <= u.rg) {
      u.atkCd -= dt;
      if (u.atkCd <= 0) { u.atkCd = 1 / speedOf(u); attack(B, u, t); }
    } else {
      u.moveCd -= dt;
      if (u.moveCd <= 0) { u.moveCd = 0.42; const s = nextStep(B, u, t); if (s) { u.r = s[0]; u.c = s[1]; } }
    }
  }
  for (const p of B.projs) {
    if (!p.t.alive) { p.done = 1; continue; }
    const dx = p.t.X - p.X, dy = p.t.Y - p.Y, d = Math.hypot(dx, dy), s = p.sp * dt;
    if (d <= s) { p.done = 1; p.hit(); } else { p.X += (dx / d) * s; p.Y += (dy / d) * s; }
  }
  B.projs = B.projs.filter((p) => !p.done);
  if (B.zones.length) stepZones(B, dt);
  const a0 = B.f.some((u) => u.alive && u.team === 0), a1 = B.f.some((u) => u.alive && u.team === 1);
  if (!a0 || !a1 || B.t >= 30) { B.done = true; B.win = a0 && !a1 ? 0 : a1 && !a0 ? 1 : -1; }
}
// 블랙홀 같은 "장판": 주변 적을 끌어당기고 계속 피해를 줘요
function stepZones(B, dt) {
  for (const z of B.zones) {
    if (z.step) { z.step(B, z, dt); continue; }
    z.t += dt; z.tick += dt; z.pull += dt;
    const foes = B.f.filter((o) => o.alive && o.team !== z.team);
    const dist = (o) => hexDistRC(o.r, o.c, z.r, z.c);
    if (z.tick >= 0.25) { z.tick -= 0.25; foes.forEach((o) => { if (dist(o) <= 2) dealDamage(B, z.owner, o, 16 * z.P, "skill"); }); }
    if (z.pull >= 0.45) {
      z.pull -= 0.45;
      const occ = new Set(B.f.filter((o) => o.alive).map((o) => o.r * COLS + o.c));
      foes.sort((a, b) => dist(a) - dist(b)).forEach((o) => {
        const d = dist(o); if (d < 1 || d > 3) return;
        let best = null, bd = d;
        for (const [nr, nc] of neighbors(o.r, o.c)) { const nd = hexDistRC(nr, nc, z.r, z.c); if (nd < bd && !occ.has(nr * COLS + nc)) { bd = nd; best = [nr, nc]; } }
        if (best) { occ.delete(o.r * COLS + o.c); o.r = best[0]; o.c = best[1]; occ.add(o.r * COLS + o.c); o.moveCd = 0.5; }
      });
    }
    if (z.t >= z.dur) {
      z.done = 1;
      foes.forEach((o) => { if (dist(o) <= 2) dealDamage(B, z.owner, o, 100 * z.P, "skill"); });
      addFx(B, z.X, z.Y, 3, "#b06bff", 0.6); addFx(B, z.X, z.Y, 1.6, "#ffffff", 0.4);
      if (B.visual) { S.shake = 0.3; sfx("boom"); }
    }
  }
  B.zones = B.zones.filter((z) => !z.done);
}
