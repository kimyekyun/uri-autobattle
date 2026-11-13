// ============================================================
//  robot.js — 4인 합체로봇 (조하윤 · 박희찬 · 윤동욱 · 이보경)
//  ROBOT_MEMBERS: 합체에 필요한 친구들 / combineRobot: 합체 능력치 / stepCombo: 합체 연출 /
//  buildRobot: 로봇 3D 모양
// ============================================================
"use strict";
// 네 명이 모두 보드에 있으면 전투 시작 때 합체로봇으로 합체 (모두 ★3이면 초합체로봇)
const ROBOT_NAME = "4인 합체로봇 (하윤·희찬·동욱·보경)";
const ROBOT_MEMBERS = ["조하윤", "박희찬", "윤동욱", "이보경"];
const ROBOT_COLS = ["#3fd8ff", "#ff8a2a", "#f0ece0", "#5ae08a"]; // 합체 연출에 쓰는 네 친구 색 (하윤·희찬·동욱·보경)
function combineRobot(f, team, visual) {
  const ms = ROBOT_MEMBERS.map((n) => f.find((x) => x.team === team && x.d >= 0 && DEFS[x.d].n === n));
  if (ms.some((m) => !m)) return;
  const b = ms[1], sum = (k) => ms.reduce((s2, m) => s2 + m[k], 0);
  const robot = Object.assign({}, b, {
    robot: 1, star: Math.max(...ms.map((m) => m.star)), items: [],
    maxHp: sum("maxHp") * 0.9, ad: sum("ad") * 0.55, as0: sum("as0") / 4,
    rg: 2, ar: Math.min(0.75, Math.max(...ms.map((m) => m.ar)) + 0.1), mm: 90, mana: 10,
    amp: Math.max(...ms.map((m) => m.amp)), crit: Math.max(...ms.map((m) => m.crit)), power: sum("power") * 0.45,
    shield: sum("shield"), tgt: null, dmg: 0, flash: 0, lunge: 0,
  });
  robot.maxHp *= ROBOT_K; robot.ad *= ROBOT_K; robot.power *= ROBOT_K; // 네 명을 모은 보상이 되도록 (같은 골드 무작위 팀 상대 약 55%)
  if (ms.every((m) => m.star >= 3)) { // 네 명 모두 ★3: 초합체로봇 (정주환 ★3 과 비슷한 세기)
    const K = MEGA_K;
    Object.assign(robot, { mega: 1, maxHp: robot.maxHp * K.hp, ad: robot.ad * K.ad, power: robot.power * K.sk, ar: Math.min(0.75, robot.ar + 0.05), mana: robot.mm });
  }
  robot.hp = robot.maxHp;
  for (const m of ms) { m.alive = false; m.deadT = 0; m.merged = 1; }
  f.push(robot);
  if (visual) {
    const cx = worldX(robot.X), cz = worldZ(robot.Y);
    robot.combo = { t: 0, dur: 3.2, cx, cz, members: ms.map((m) => { const x = worldX(m.X), z = worldZ(m.Y); return { m, a0: Math.atan2(z - cz, x - cx), r0: Math.max(0.8, Math.hypot(x - cx, z - cz)) }; }), ring: 0 };
  }
}
let ROBOT_K = 1.16; // 일반 합체로봇 배율 (원래는 네 명을 모으면 오히려 손해였어요: 같은 골드 무작위 팀 상대 34%)
const MEGA_K = { hp: 3.53, ad: 3.53, sk: 3.53 }; // 초합체로봇 배율 (정주환 ★3 과 1대1이 비슷하도록 맞춘 값)
// 초합체로봇 필살기: 거대한 빛의 대검을 들어 올렸다가 전장 전체를 한 번에 베어요
const MEGA_SLASH_AT = 0.65;
const MEGA_SK = { s: "초합체 대검!", d: (P) => `빛의 대검을 들어 올려 전장 전체를 베어요. 적 모두 공격력×2 + ${Math.round(260 * P)} 피해 + 1.2초 기절`,
  run(B, u, P) {
    B.zones.push({ kind: "megasword", step: stepMegaSword, team: u.team, owner: u, P, X: u.X, Y: u.Y, t: 0, dur: 1.6, hit: 0 });
    addHuge(B, u, "초합체 대검!", "#ffffff", "#ffd36b", 3.2);
    if (B.visual) sfx("charge");
  } };
function stepMegaSword(B, z, dt) {
  const u = z.owner; z.t += dt; z.X = u.X; z.Y = u.Y;
  if (!z.hit && z.t >= MEGA_SLASH_AT) {
    z.hit = 1;
    if (u.alive) B.f.filter((o) => o.alive && o.team !== z.team).forEach((o) => {
      dealDamage(B, u, o, u.ad * 2 + 260 * z.P, "skill");
      if (o.alive) o.stunT = Math.max(o.stunT || 0, 1.2);
      addFx(B, o.X, o.Y, 1.1, "#ffd36b", 0.4); addFx(B, o.X, o.Y, 0.6, "#ffffff", 0.3);
    });
    if (B.visual) { S.shake = Math.max(S.shake || 0, 0.7); sfx("boom"); sfx("crit"); }
  }
  if (z.t >= z.dur) z.done = 1;
}
const ROBOT_SK = { s: "합체 필살기: ¡Gol Final!", d: () => "축구공 5개를 연속으로 차서 대상과 주변 적에게 피해",
  run(B, u, P, t, al, fo) {
    const live = fo.filter((o) => o.alive); if (!live.length) return;
    for (let i = 0; i < 5; i++) {
      const o = i === 0 && t ? t : rnd(live);
      B.projs.push({ X: u.X, Y: u.Y, t: o, sp: 13 + i, col: "#ffffff", sz: 0.22, trail: 1, ball: 1, hit: () => {
        const dmg = u.ad * 0.7 + 80 * P;
        dealDamage(B, u, o, dmg, "skill");
        near(B.f.filter((x) => x.alive && x.team !== u.team), o, 1).forEach((x) => x !== o && dealDamage(B, u, x, dmg * 0.4, "skill"));
        addFx(B, o.X, o.Y, 1.1, "#7ff0ff", 0.4);
      } });
    }
    if (B.visual) { S.shake = 0.25; sfx("boom"); }
  } };
// 합체 순서: 친구들이 빙글 모임(0~0.55초) → 탈것으로 변신해 달려옴(~1.25초, 섬광) → 부품이 하나씩 철컥철컥 조립(1.3~2.45초) → 눈이 켜지며 "합체!"
const COMBO_TF = 0.55, COMBO_ASM = 1.3, COMBO_DONE = 2.45;
const ROBOT_ASM = [ // 조립 순서: [부품, 시작, 끝] (조립 진행도 0~1 기준)
  ["legs", 0.0, 0.22], ["torso", 0.16, 0.4], ["armL", 0.36, 0.56], ["armR", 0.46, 0.66], ["wings", 0.62, 0.8], ["head", 0.76, 0.94],
];
function stepCombo(B, u, dt) {
  const k = u.combo, t0 = k.t; k.t += dt;
  const cross = (x) => t0 < x && k.t >= x;
  if (cross(0.0001)) sfx("cast");
  if (cross(COMBO_TF)) { sfx("transform"); addFx(B, u.X, u.Y, 2.6, "#ffffff", 0.4); }
  if (k.t < 1.25 && Math.floor(k.t / 0.22) !== k.ring) { k.ring = Math.floor(k.t / 0.22); addFx(B, u.X, u.Y, 1.2 + k.ring * 0.15, ROBOT_COLS[k.ring % 4], 0.5); }
  if (cross(1.25)) { S.shake = 0.5; sfx("boom"); }
  ROBOT_ASM.forEach(([, , e], i) => { if (cross(COMBO_ASM + e * (COMBO_DONE - COMBO_ASM))) { sfx("clank"); S.shake = Math.max(S.shake || 0, 0.12); addFx(B, u.X, u.Y, 1.4, ROBOT_COLS[i % 4], 0.3); } });
  if (cross(COMBO_DONE)) {
    S.shake = u.mega ? 0.9 : 0.6; sfx("merge"); if (u.mega) sfx("boom");
    [2.2, 3.0, 3.8, 4.6, 5.4].forEach((r, i) => addFx(B, u.X, u.Y, r, i ? ROBOT_COLS[i - 1] : "#ffffff", 0.6 + i * 0.12));
    B.fx.push({ kind: "spark", X: u.X, Y: u.Y, col: "#ffe9a0", t: 0.6, t0: 0.6 }, { kind: "spark", X: u.X, Y: u.Y, col: "#7ff0ff", t: 0.7, t0: 0.7 });
  }
}
// 조립 진행도 a(0~1)에 맞춰 부품을 제자리로 날아오게 해요. 다 끝나면(a=1) 원래 자리
function robotAssemble(ud, a) {
  const ease = (x) => 1 - Math.pow(1 - x, 3);
  for (const [name, s0, s1] of ROBOT_ASM) {
    const q = ease(Math.max(0, Math.min(1, (a - s0) / (s1 - s0))));
    for (const pt of ud.parts[name]) {
      pt.o.position.set(pt.rest.x + pt.off[0] * (1 - q), pt.rest.y + pt.off[1] * (1 - q), pt.rest.z + pt.off[2] * (1 - q));
      if (pt.spin) pt.o.rotation.z = pt.restRz + pt.spin * (1 - q);
      pt.o.visible = q > 0;
    }
  }
  ud.eyeOn = a >= 1;
}
// 네 친구 영웅 색을 합친 메카: 머리·가슴 = 박희찬(파랑·주황), 어깨·방패 = 이보경(초록·금), 다리 = 윤동욱(흰·검정), 팔 대포·추진기 = 조하윤(검정·청록)
function buildRobot(enemy, mega) {
  const g = new THREE.Group(); g.rotation.order = "YXZ";
  const ud = g.userData; ud.mats = []; ud.walk = 0; ud.move = 0; ud.restZ = [-0.2, 0.2];
  const T = (hex) => { const m = toonMat(hex); ud.mats.push(m); return m; };
  const glowM = (hex, k = 1.6) => { const m = toonMat(hex, { emissive: lin(hex), emissiveIntensity: k }); ud.mats.push(m); return m; };
  const add = (geo, mat, x, y, z, parent, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; parent.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, parent = g, rx, ry, rz) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent, rx, ry, rz);
  const cyl = (r1, r2, h, mat, x, y, z, parent = g, rx, ry, rz, sg = 16) => add(new THREE.CylinderGeometry(r1, r2, h, sg), mat, x, y, z, parent, rx, ry, rz);
  // 위가 넓고 아래가 좁은 판 (가슴·어깨·치마 갑옷)
  const wedge = (wt, wb, h, d, mat, x, y, z, parent, rx, ry, rz) => { const gm = new THREE.CylinderGeometry(wt / Math.SQRT2, wb / Math.SQRT2, h, 4, 1); gm.rotateY(Math.PI / 4); gm.scale(1, 1, d / Math.max(wt, wb)); return add(gm, mat, x, y, z, parent, rx, ry, rz); };
  const blue = T(0x2a4ab0), blueD = T(0x1c2f78), orange = T(0xff8a2a), white = T(0xf0ece0), whiteD = T(0xb9b4a8), black = T(0x1e1f26);
  const green = T(0x2a7a4a), gold = T(0xe8c25a), dark = T(0x16161e), steel = T(0x5a6270);
  const cyan = glowM(0x3fd8ff, 1.8), eye = glowM(enemy ? 0xff5a4a : 0x7ff0ff, 2.2);
  const rm = new THREE.MeshBasicMaterial({ color: lin(enemy ? 0xff5a4a : 0x5ae0a0), transparent: true, opacity: 0.9 }); ud.mats.push(rm);
  const ring = new THREE.Mesh(GEO.teamRing, rm); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.21; ring.scale.setScalar(1.15); g.add(ring);
  // ----- 다리 (윤동욱: 흰 장갑 + 검은 관절) -----
  ud.legs = []; ud.knees = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sx * 0.15, 0.84, 0); g.add(hip);
    cyl(0.075, 0.075, 0.14, black, 0, 0, 0, hip, 0, 0, Math.PI / 2);
    wedge(0.2, 0.15, 0.3, 0.2, white, 0, -0.16, 0, hip);
    box(0.06, 0.2, 0.02, black, sx * 0.02, -0.16, 0.105, hip);
    const knee = new THREE.Group(); knee.position.set(0, -0.32, 0); hip.add(knee);
    add(new THREE.SphereGeometry(0.07, 12, 8), black, 0, 0, 0, knee);
    box(0.13, 0.12, 0.08, blue, 0, 0.01, 0.08, knee, -0.2);
    wedge(0.16, 0.21, 0.27, 0.22, white, 0, -0.16, 0, knee);
    box(0.17, 0.05, 0.23, whiteD, 0, -0.06, 0, knee);
    box(0.22, 0.08, 0.34, black, 0, -0.32, 0.04, knee);
    box(0.2, 0.05, 0.12, steel, 0, -0.3, 0.2, knee);
    for (const [wy, wr] of [[-0.12, 0.085], [-0.25, 0.07]]) { // 윤동욱 오토바이 바퀴가 정강이 바깥에
      cyl(wr, wr, 0.06, black, sx * 0.13, wy, -0.03, knee, 0, 0, Math.PI / 2, 18);
      cyl(wr * 0.55, wr * 0.55, 0.065, steel, sx * 0.13, wy, -0.03, knee, 0, 0, Math.PI / 2, 10);
    }
    ud.legs.push(hip); ud.knees.push(knee);
  }
  // ----- 몸통 (박희찬: 파란 가슴 + 주황 V 줄무늬, 가운데 축구공 코어) -----
  const torso = new THREE.Group(); torso.position.y = 0.84; g.add(torso); ud.torso = torso;
  box(0.36, 0.12, 0.26, black, 0, 0.02, 0, torso);
  for (const sx of [-1, 0, 1]) wedge(0.15, 0.11, 0.18, 0.05, sx ? green : gold, sx * 0.15, -0.08, 0.13, torso, -0.12, 0, sx * 0.12);
  for (const sx of [-1, 1]) wedge(0.12, 0.09, 0.2, 0.18, green, sx * 0.23, -0.06, 0, torso, 0, 0, sx * 0.25);
  box(0.3, 0.14, 0.22, dark, 0, 0.14, 0, torso);
  for (let i = 0; i < 3; i++) box(0.24, 0.025, 0.02, steel, 0, 0.09 + i * 0.045, 0.115, torso);
  wedge(0.72, 0.42, 0.36, 0.36, blue, 0, 0.39, 0, torso);
  wedge(0.5, 0.3, 0.3, 0.04, blueD, 0, 0.38, 0.17, torso, -0.08);
  for (const sx of [-1, 1]) box(0.04, 0.16, 0.02, orange, sx * 0.17, 0.35, 0.175, torso, -0.08, 0, sx * 0.4);
  box(0.62, 0.05, 0.3, white, 0, 0.58, 0, torso);
  const glass = T(0x9fe4ff);
  for (const sx of [-1, 1]) { // 박희찬 자동차 앞유리 · 전조등이 가슴에
    box(0.17, 0.12, 0.02, glass, sx * 0.19, 0.49, 0.185, torso, -0.25, sx * 0.25, 0);
    box(0.13, 0.015, 0.025, white, sx * 0.19, 0.52, 0.19, torso, -0.25, sx * 0.25, 0);
    box(0.07, 0.04, 0.03, glowM(0xfff2c0, 1.6), sx * 0.21, 0.27, 0.15, torso);
  }
  const core = new THREE.Group(); core.position.set(0, 0.42, 0.19); torso.add(core); ud.core = core;
  add(new THREE.TorusGeometry(0.1, 0.022, 8, 24), gold, 0, 0, 0, core);
  add(new THREE.TorusGeometry(0.125, 0.012, 6, 24), cyan, 0, 0, -0.01, core);
  const ball = new THREE.Mesh(GEO.ball, new THREE.MeshStandardMaterial({ map: ballTex(), roughness: 0.4, emissive: lin(0x3fd8ff), emissiveIntensity: 0.25 })); ud.mats.push(ball.material);
  ball.scale.setScalar(0.62); core.add(ball); ud.ball = ball;
  // ----- 등 (조하윤: 검은 추진기 + 청록 불꽃, 박희찬 주황 날개) -----
  box(0.4, 0.34, 0.16, dark, 0, 0.4, -0.24, torso);
  ud.flames = [];
  for (const sx of [-1, 1]) {
    cyl(0.07, 0.09, 0.26, steel, sx * 0.13, 0.26, -0.32, torso);
    cyl(0.05, 0.05, 0.02, cyan, sx * 0.13, 0.12, -0.32, torso);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 10), additive("#7ff0ff")); ud.mats.push(fl.material); fl.rotation.x = Math.PI; fl.position.set(sx * 0.13, -0.04, -0.32); torso.add(fl); ud.flames.push(fl);
    const wing = new THREE.Group(); wing.position.set(sx * 0.18, 0.55, -0.3); wing.rotation.set(-0.3, sx * 0.5, sx * -0.9); torso.add(wing); (ud.wings = ud.wings || []).push(wing);
    wedge(0.12, 0.04, 0.5, 0.03, orange, 0, 0.24, 0, wing);
    box(0.02, 0.4, 0.035, white, sx * -0.035, 0.24, 0.01, wing);
    box(0.03, 0.14, 0.04, cyan, 0, 0.44, 0.012, wing);
  }
  // ----- 머리 (박희찬 투구 + 이보경 금빛 뿔 + 조하윤 청록 눈) -----
  const head = new THREE.Group(); head.position.y = 0.72; torso.add(head); ud.head = head;
  box(0.12, 0.08, 0.12, black, 0, -0.08, 0, head);
  box(0.26, 0.22, 0.26, white, 0, 0.06, 0, head);
  box(0.28, 0.08, 0.28, blue, 0, 0.17, -0.01, head);
  wedge(0.2, 0.12, 0.1, 0.04, dark, 0, 0.0, 0.135, head);
  box(0.22, 0.045, 0.03, eye, 0, 0.075, 0.135, head);
  box(0.05, 0.1, 0.05, orange, 0, 0.17, 0.13, head);
  for (const sx of [-1, 1]) {
    box(0.04, 0.24, 0.035, gold, sx * 0.1, 0.27, 0.12, head, 0, 0, sx * -0.85);
    box(0.06, 0.14, 0.12, blueD, sx * 0.15, 0.05, 0, head);
    cyl(0.012, 0.012, 0.16, steel, sx * 0.17, 0.2, -0.05, head, 0, 0, sx * -0.3, 6);
  }
  box(0.05, 0.05, 0.05, cyan, 0, 0.17, 0.155, head);
  // ----- 팔: 왼팔 = 이보경 방패, 오른팔 = 조하윤 대포 -----
  ud.arms = []; ud.elbows = [];
  for (const sx of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(sx * 0.42, 0.5, 0); torso.add(sh);
    add(new THREE.SphereGeometry(0.1, 14, 10), black, 0, 0, 0, sh);
    const pad = wedge(0.32, 0.22, 0.2, 0.3, green, sx * 0.04, 0.06, 0, sh, 0, 0, sx * -0.35);
    box(0.3, 0.035, 0.32, gold, sx * 0.07, 0.15, 0, sh, 0, 0, sx * -0.35);
    box(0.06, 0.06, 0.06, cyan, sx * 0.15, 0.06, 0.14, sh);
    box(0.13, 0.26, 0.14, dark, 0, -0.16, 0, sh);
    const el = new THREE.Group(); el.position.set(0, -0.3, 0); sh.add(el);
    add(new THREE.SphereGeometry(0.075, 12, 8), black, 0, 0, 0, el);
    wedge(0.2, 0.16, 0.26, 0.2, sx < 0 ? green : dark, 0, -0.14, 0, el);
    box(0.16, 0.04, 0.2, sx < 0 ? gold : cyan, 0, -0.04, 0, el);
    box(0.13, 0.1, 0.13, black, 0, -0.31, 0, el);
    if (sx < 0) { // 큰 방패: 초록 판 + 금 테두리 + 가운데 보석
      const sg = new THREE.Group(); sg.position.set(-0.1, -0.2, 0.06); sg.rotation.set(0, -0.25, 0); el.add(sg);
      wedge(0.36, 0.22, 0.6, 0.05, green, 0, 0, 0, sg, 0, Math.PI / 2, 0);
      wedge(0.42, 0.26, 0.66, 0.035, gold, -0.012, 0, 0, sg, 0, Math.PI / 2, 0);
      add(new THREE.SphereGeometry(0.05, 12, 8), cyan, -0.04, 0.05, 0, sg);
      box(0.03, 0.4, 0.03, gold, -0.035, -0.02, 0, sg);
      box(0.06, 0.3, 0.12, black, -0.09, -0.14, 0, el); // 이보경 탱크 무한궤도가 팔뚝에
      for (let i = 0; i < 5; i++) box(0.065, 0.015, 0.125, steel, -0.09, -0.02 - i * 0.06, 0, el);
    } else { // 팔 대포: 검은 포신 두 개 + 청록 포구
      const cg = new THREE.Group(); cg.position.set(0, -0.32, 0.02); el.add(cg); ud.cannon = cg;
      box(0.18, 0.18, 0.18, steel, 0, 0, 0, cg);
      for (const ox of [-0.045, 0.045]) { cyl(0.035, 0.04, 0.3, dark, ox, -0.2, 0, cg); cyl(0.042, 0.042, 0.03, cyan, ox, -0.36, 0, cg); }
      box(0.04, 0.2, 0.06, cyan, 0.1, -0.08, 0, cg);
      add(new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), T(0x9fe4ff), 0, 0.02, 0.09, cg, Math.PI / 2, 0, 0).scale.set(0.8, 1.6, 0.6); // 조하윤 제트기 조종석
    }
    ud.arms.push(sh); ud.elbows.push(el);
  }
  if (mega) { // 초합체로봇: 오른손에 빛의 대검
    const sw = new THREE.Group(); sw.position.set(0, -0.12, 0.12); sw.rotation.x = -1.25; ud.cannon.add(sw); ud.sword = sw;
    cyl(0.04, 0.04, 0.26, black, 0, 0.05, 0, sw);
    box(0.42, 0.07, 0.1, gold, 0, -0.1, 0, sw);
    box(0.08, 0.08, 0.12, cyan, 0, -0.1, 0.03, sw);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.5, 0.035), glowM(0xbff4ff, 1.4)); blade.position.y = -0.88; sw.add(blade);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.56, 0.012), glowM(0xffd36b, 2.2)); edge.position.y = -0.9; sw.add(edge);
    ud.blade = blade;
  }
  bakeFigure(g, ud); // 친구들처럼 만화 음영 + 외곽선
  // 합체 조립 연출용: 부품마다 제자리와 날아올 방향
  const P = (o, off, spin) => ({ o, rest: o.position.clone(), off, spin, restRz: o.rotation.z });
  ud.parts = {
    legs: ud.legs.map((h, i) => P(h, [0, -1.4, 0])),
    torso: [P(torso, [0, 2.2, 0])],
    armL: [P(ud.arms[0], [-1.6, 0.4, 0])], armR: [P(ud.arms[1], [1.6, 0.4, 0])],
    wings: ud.wings.map((w, i) => P(w, [0, 0, 0], i ? 1.6 : -1.6)),
    head: [P(head, [0, -0.35, 0])],
  };
  ud.eye = eye; ud.eyeOn = true;
  return g;
}
// 합체 전 변신한 탈것: 0 조하윤 제트기 · 1 박희찬 스포츠카 · 2 윤동욱 오토바이 · 3 이보경 탱크
function buildRobotVehicle(i) {
  const g = new THREE.Group(), ud = g.userData; ud.mats = [];
  const T = (hex) => { const m = toonMat(hex); ud.mats.push(m); return m; };
  const G = (hex) => { const m = toonMat(hex, { emissive: lin(hex), emissiveIntensity: 1.8 }); ud.mats.push(m); return m; };
  const body = new THREE.Group(); g.add(body); // 합칠 부품은 묶음 안에
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; body.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, rx, ry, rz) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz);
  const wheel = (r, w, x, y, z) => { add(new THREE.CylinderGeometry(r, r, w, 18), T(0x1e1f26), x, y, z, 0, 0, Math.PI / 2); add(new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.01, 10), T(0x8a929c), x, y, z, 0, 0, Math.PI / 2); };
  const glass = T(0x9fe4ff);
  if (i === 0) { // 제트기 (앞이 +z)
    const dark = T(0x16161e), cyan = G(0x3fd8ff);
    box(0.16, 0.12, 0.8, dark, 0, 0, 0); add(new THREE.ConeGeometry(0.08, 0.3, 10), dark, 0, 0, 0.55, Math.PI / 2);
    add(new THREE.SphereGeometry(0.07, 12, 8), glass, 0, 0.07, 0.2).scale.set(1, 0.8, 2.2);
    for (const sx of [-1, 1]) { box(0.5, 0.025, 0.28, dark, sx * 0.3, -0.01, -0.05, 0, sx * 0.5, 0); box(0.05, 0.03, 0.1, cyan, sx * 0.52, -0.01, -0.22, 0, sx * 0.5, 0); box(0.02, 0.18, 0.14, dark, sx * 0.07, 0.11, -0.33, 0, 0, sx * 0.3); }
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), cyan, 0, 0, -0.41, Math.PI / 2);
  } else if (i === 1) { // 스포츠카
    const blue = T(0x2a4ab0), orange = T(0xff8a2a);
    box(0.42, 0.13, 0.8, blue, 0, 0.13, 0); box(0.34, 0.11, 0.36, blue, 0, 0.25, -0.06);
    box(0.32, 0.1, 0.02, glass, 0, 0.25, 0.13, -0.6); box(0.06, 0.005, 0.8, orange, 0.08, 0.2, 0); box(0.06, 0.005, 0.8, orange, -0.08, 0.2, 0);
    box(0.4, 0.04, 0.08, orange, 0, 0.33, -0.36); for (const sx of [-1, 1]) box(0.08, 0.04, 0.02, G(0xfff2c0), sx * 0.14, 0.14, 0.41);
    for (const sx of [-1, 1]) for (const z of [-0.26, 0.26]) wheel(0.09, 0.06, sx * 0.22, 0.09, z);
  } else if (i === 2) { // 오토바이
    const white = T(0xf0ece0), black = T(0x1e1f26);
    wheel(0.13, 0.05, 0, 0.13, 0.28); wheel(0.13, 0.05, 0, 0.13, -0.28);
    box(0.12, 0.14, 0.42, white, 0, 0.24, 0); box(0.1, 0.05, 0.22, black, 0, 0.33, -0.08);
    box(0.04, 0.2, 0.04, black, 0, 0.3, 0.24, -0.4); box(0.28, 0.025, 0.025, black, 0, 0.4, 0.2);
    box(0.06, 0.04, 0.02, G(0xfff2c0), 0, 0.3, 0.31);
  } else { // 탱크
    const green = T(0x2a7a4a), gold = T(0xe8c25a), dark = T(0x1e1f26);
    box(0.44, 0.14, 0.66, green, 0, 0.17, 0);
    for (const sx of [-1, 1]) { box(0.12, 0.14, 0.72, dark, sx * 0.26, 0.1, 0); for (let k = 0; k < 6; k++) box(0.125, 0.02, 0.03, T(0x8a929c), sx * 0.26, 0.17, -0.3 + k * 0.12); }
    add(new THREE.CylinderGeometry(0.15, 0.17, 0.1, 16), gold, 0, 0.29, -0.04);
    add(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 8), gold, 0, 0.3, 0.2, Math.PI / 2);
    add(new THREE.SphereGeometry(0.04, 10, 8), G(0x3fd8ff), 0, 0.35, -0.04);
  }
  bakeFigure(g, ud);
  return g;
}
