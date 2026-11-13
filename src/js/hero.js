// ============================================================
//  hero.js — 판타지 영웅 '조각' 도구 (render3d.js 의 buildStudent 가 가져다 써요)
//   · slab  : 모서리를 깎은 두꺼운 판 (칼날 · 갑옷 조각 · 도끼날)
//   · lathe : 각도마다 반지름을 바꿀 수 있는 회전체 (가슴판 · 치마 · 장화 · 팔토시)
//   · cloth : 주름과 찢어진 끝단이 있는 천 (망토 · 앞자락)
//  모든 조각은 꼭짓점 색으로 '손으로 칠한 음영'(위는 밝게, 아래는 어둡게, 모서리는 반짝)을 미리 칠해 둬요.
//  색은 꼭짓점에 들어가 있어서 재질은 흰색 하나만 써요 → bakeFigure 가 한 덩어리로 합쳐 그려요.
// ============================================================
"use strict";
const HERO = (() => {
  const TAU = Math.PI * 2;
  const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const hash = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const lc = (hex) => { const c = new THREE.Color(hex).convertSRGBToLinear(); return [c.r, c.g, c.b]; };
  const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  // 팔레트: c 기본색, e 모서리 반짝임, s 옆면 그늘
  const pal = (hex, edge, k = 1) => { const c = mul(lc(hex), k), e = edge != null ? lc(edge) : mix(mul(c, 1.35), [1, 1, 1], 0.3); return { c, e, s: mul(c, 0.45) }; };
  const METAL = {
    steel: () => pal(0x8a94a6, 0xe8eef8), dark: () => pal(0x4a4c56, 0xc4c8d2), gold: () => pal(0xc89a3e, 0xfff0b0),
    bronze: () => pal(0x9a6232, 0xf0c080), silver: () => pal(0xb8c0cc, 0xffffff),
  };

  // ---------- 그물 만들기 ----------
  class GB {
    constructor() { this.p = []; this.c = []; this.i = []; }
    // rows: 위→아래 줄, 줄마다 [x,y,z] 점들. col(j,i,q) → [r,g,b]. out(x,y,z) → 바깥쪽 방향 (면 방향을 자동으로 맞춰요)
    grid(rows, col, out) {
      const nu = rows[0].length, base = this.p.length / 3, P = this.p;
      rows.forEach((row, j) => row.forEach((q, i) => { P.push(q[0], q[1], q[2]); const c = col(j, i, q); this.c.push(c[0], c[1], c[2]); }));
      const at = (j, i) => (base + j * nu + i) * 3;
      let s = 0;
      for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < nu - 1; i++) {
        const a = at(j, i), b = at(j, i + 1), c = at(j + 1, i), d = at(j + 1, i + 1);
        for (const [p0, p1, p2] of [[a, c, b], [b, c, d]]) {
          const ux = P[p1] - P[p0], uy = P[p1 + 1] - P[p0 + 1], uz = P[p1 + 2] - P[p0 + 2], vx = P[p2] - P[p0], vy = P[p2 + 1] - P[p0 + 1], vz = P[p2 + 2] - P[p0 + 2];
          const o = out(P[p0], P[p0 + 1], P[p0 + 2]);
          s += (uy * vz - uz * vy) * o[0] + (uz * vx - ux * vz) * o[1] + (ux * vy - uy * vx) * o[2];
        }
      }
      for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < nu - 1; i++) {
        const a = base + j * nu + i, b = a + 1, c = a + nu, d = c + 1;
        if (s >= 0) this.i.push(a, c, b, b, c, d); else this.i.push(a, b, c, b, d, c);
      }
      return this;
    }
    geo(warp) {
      const P = this.p;
      if (warp) for (let i = 0; i < P.length; i += 3) { const o = warp(P[i], P[i + 1], P[i + 2]); P[i] = o[0]; P[i + 1] = o[1]; P[i + 2] = o[2]; }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(this.c, 3));
      g.setIndex(this.i); g.computeVertexNormals();
      return g;
    }
  }
  const OUTZ = () => [0, 0, 1], INZ = () => [0, 0, -1];

  // ---------- 판 ----------
  // L, R: 아래→위로 가는 왼쪽·오른쪽 가장자리 [x,y] (같은 개수). th: 두께
  // o.pal 팔레트, o.ridge 가운데 솟은 등줄기, o.kc(u) 길이 방향 밝기, o.warp 휘기, o.edgeCol 모서리색 덮어쓰기
  function slab(L, R, th, o = {}) {
    const n = L.length, gb = new GB(), t = th / 2, ts = t * (o.sideK ?? 0.3), bev = o.bev ?? Math.min(0.014, th * 0.8);
    const P = o.pal || pal(0x888888), rg = o.ridge || 0, kc = o.kc || ((u) => 0.8 + 0.34 * u);
    const mid = L.map((l, i) => [(l[0] + R[i][0]) / 2, (l[1] + R[i][1]) / 2]);
    const inset = (p, m) => { const dx = m[0] - p[0], dy = m[1] - p[1], d = Math.hypot(dx, dy); if (d < 1e-6) return [p[0], p[1]]; const f = Math.min(0.45, bev / d); return [p[0] + dx * f, p[1] + dy * f]; };
    const QL = L.map((p, i) => inset(p, mid[i])), QR = R.map((p, i) => inset(p, mid[i]));
    const front = [], back = [];
    for (let i = n - 1; i >= 0; i--) {
      const m = [(QL[i][0] + QR[i][0]) / 2, (QL[i][1] + QR[i][1]) / 2];
      front.push([[QL[i][0], QL[i][1], t], [m[0], m[1], t + rg], [QR[i][0], QR[i][1], t]]);
      back.push([[QR[i][0], QR[i][1], -t], [m[0], m[1], -t - rg * (o.rb ?? 1)], [QL[i][0], QL[i][1], -t]]);
    }
    const u = (j) => (n > 1 ? 1 - j / (n - 1) : 1);
    gb.grid(front, (j, i) => mul(P.c, kc(u(j)) * (i === 1 && rg ? 1.22 : 1)), OUTZ);
    gb.grid(back, (j) => mul(P.c, 0.62 * kc(u(j))), INZ);
    const O = [...R, ...L.slice().reverse()], Q = [...QR, ...QL.slice().reverse()];
    O.push(O[0]); Q.push(Q[0]);
    const cx = mid.reduce((a, m) => a + m[0], 0) / n, cy = mid.reduce((a, m) => a + m[1], 0) / n, ref = (x, y) => [x - cx, y - cy, 0];
    const r0 = Q.map((p) => [p[0], p[1], t]), r1 = O.map((p) => [p[0], p[1], ts]), r2 = O.map((p) => [p[0], p[1], -ts]), r3 = Q.map((p) => [p[0], p[1], -t]);
    const E = o.edgeCol || P.e;
    gb.grid([r0, r1], () => E, ref).grid([r1, r2], () => P.s, ref).grid([r2, r3], () => mul(P.c, 0.5), ref);
    return gb.geo(o.warp);
  }
  // 칼날: len 길이, hw(u) 반폭, cv(u) 옆으로 휨, n 마디. 한쪽 날이면 back(u) 로 등 쪽 폭
  function blade(len, hw, o = {}) {
    const n = o.n || 12, L = [], R = [];
    for (let i = 0; i <= n; i++) { const u = i / n, c = o.cv ? o.cv(u) : 0, w = hw(u), wb = o.back ? o.back(u) : w; L.push([c - wb, u * len]); R.push([c + w, u * len]); }
    return slab(L, R, o.th || 0.02, o);
  }
  // 모서리 깎은 직사각 판 (가운데가 원점). o.point: 아래를 뾰족하게
  function plate(w, h, o = {}) {
    const c = o.ch ?? Math.min(w, h) * 0.18, b = o.point ? h * o.point : c, hw = w / 2, hh = h / 2;
    const L = [[-hw + (o.point ? hw : c), -hh], [-hw, -hh + b], [-hw * (o.topK ?? 1), hh - c], [-hw * (o.topK ?? 1) + c, hh]];
    const R = L.map(([x, y]) => [-x, y]);
    return slab(L, R, o.th || 0.018, o);
  }
  // 휘기: bendX 는 세로축 둘레로(몸을 감싸듯), bendY 는 가로축 둘레로
  const bendX = (Rr) => (x, y, z) => { const a = x / Rr; return [(Rr + z) * Math.sin(a), y, (Rr + z) * Math.cos(a) - Rr]; };
  const bendY = (Rr) => (x, y, z) => { const a = y / Rr; return [x, (Rr + z) * Math.sin(a), (Rr + z) * Math.cos(a) - Rr]; };
  const chain = (...ws) => (x, y, z) => ws.reduce((p, w) => (w ? w(p[0], p[1], p[2]) : p), [x, y, z]);

  // ---------- 회전체 ----------
  // prof: 위→아래 [반지름, y]. o.a0~a1 각도(0 = 앞쪽 +z), o.rmod(ph,y,j) 반지름 배율, o.ymod(ph,y,j) 높이 보정,
  // o.col(ph,j,y) → [r,g,b] 색, o.th 두께(있으면 안쪽 면 + 테두리)
  function lathe(prof, o = {}) {
    const seg = o.seg || 24, a0 = o.a0 ?? 0, a1 = o.a1 ?? TAU, sx = o.sx ?? 1, sz = o.sz ?? 1, gb = new GB(), th = o.th || 0;
    const P = o.pal || pal(0x888888), full = a1 - a0 >= TAU - 1e-6;
    const ph = (i) => a0 + ((a1 - a0) * i) / seg;
    const rows = (inner) => prof.map(([r, y], j) => { const row = []; for (let i = 0; i <= seg; i++) { const a = ph(i), m = o.rmod ? o.rmod(a, y, j) : 1, Rr = Math.max(0, r * m - (inner ? th : 0)), yy = y + (o.ymod ? o.ymod(a, y, j) : 0); row.push([Rr * Math.sin(a) * sx, yy, Rr * Math.cos(a) * sz]); } return row; });
    const col = o.col || ((a, j, y) => mul(P.c, 0.82 + 0.3 * (1 - j / (prof.length - 1))));
    const outer = rows(false);
    gb.grid(outer, (j, i, q) => col(ph(i), j, q[1]), (x, y, z) => [x, 0, z]);
    if (th) {
      const inner = rows(true);
      gb.grid(inner, (j, i, q) => mul(col(ph(i), j, q[1]), 0.5), (x, y, z) => [-x, 0, -z]);
      const E = o.edgeCol || P.e, last = prof.length - 1;
      gb.grid([outer[0], inner[0]], () => E, () => [0, 1, 0]);
      gb.grid([outer[last], inner[last]], () => E, () => [0, -1, 0]);
      if (!full) {
        gb.grid(outer.map((r, j) => [r[0], inner[j][0]]), () => E, () => [-Math.cos(a0), 0, Math.sin(a0)]);
        gb.grid(outer.map((r, j) => [r[seg], inner[j][seg]]), () => E, () => [Math.cos(a1), 0, -Math.sin(a1)]);
      }
    }
    return gb.geo(o.warp);
  }

  // ---------- 천 ----------
  // 위 가운데가 원점, 아래(-y)로 h 만큼. face: 바깥 면이 향하는 z 방향(-1 = 뒤). w0 위 폭, w1 아래 폭
  // folds 주름 수, fold 주름 깊이, flare 아래로 갈수록 바깥으로 뜸, wrap 양끝이 몸 쪽으로 감김, tatter 찢어진 끝단
  function cloth(o) {
    const nu = o.nu || 14, nv = o.nv || 10, gb = new GB(), f = o.face ?? -1, P = o.pal || pal(0x884444), TR = o.trim ? lc(o.trim) : null;
    const pt = (i, j, off) => {
      const u = i / nu, v = j / nv, tat = o.tatter ? o.tatter * (i % 2 ? 0.35 + 0.65 * hash(i * 3.1 + (o.seed || 0)) : 0) : 0;
      const vv = v * (1 - tat * sm(0.55, 1, v)), w = o.w0 + (o.w1 - o.w0) * vv, x = (u - 0.5) * w;
      const crest = 0.5 - 0.5 * Math.cos((u * (o.folds ?? 3) * 2 + (o.phase || 0)) * Math.PI);
      const z = f * ((o.fold ?? 0.03) * crest * (0.25 + vv) + (o.flare || 0) * vv * vv) - f * (o.wrap || 0) * Math.pow(2 * (u - 0.5), 2) * (1 - 0.5 * vv) + off;
      return [x, -o.h * vv, z];
    };
    const paint = (j, i, inner) => {
      const u = i / nu, v = j / nv, crest = 0.5 - 0.5 * Math.cos((u * (o.folds ?? 3) * 2 + (o.phase || 0)) * Math.PI);
      if (TR && (v > 1 - (o.trimW ?? 0.1) || (o.trimSide && (u < 0.06 || u > 0.94)))) return mul(TR, (inner ? 0.55 : 1) * (0.85 + 0.3 * crest));
      if (o.pattern && !inner) { const pc = o.pattern(u, v); if (pc) return pc; }
      return mul(P.c, (inner ? 0.5 : 1) * (0.68 + 0.42 * crest) * (1.12 - 0.32 * v));
    };
    const rowsO = [], rowsI = [];
    for (let j = 0; j <= nv; j++) { const ro = [], ri = []; for (let i = 0; i <= nu; i++) { ro.push(pt(i, j, 0)); ri.push(pt(i, j, -f * (o.th ?? 0.008))); } rowsO.push(ro); rowsI.push(ri); }
    gb.grid(rowsO, (j, i) => paint(j, i, false), () => [0, 0, f]);
    gb.grid(rowsI, (j, i) => paint(j, i, true), () => [0, 0, -f]);
    return gb.geo(o.warp);
  }

  // ---------- 조립 ----------
  const GC = {};
  const once = (k, f) => GC[k] || (GC[k] = f());
  // 몸에 붙이는 헬퍼: mesh 를 만들어 부모에 붙여요
  function mount(C, geo, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
    const m = C.put(geo, C.mP, x, y, z, parent); m.rotation.set(rx, ry, rz); if (typeof s === "number") m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]); return m;
  }
  function group(parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(rx, ry, rz); parent.add(g); return g; }

  // 어깨갑옷: 둥글게 솟은 덮개 + 테두리 + 팔을 감싸며 겹겹이 내려오는 판 + 가시
  function pauldron(C, sh, o) {
    const side = sh.position.x < 0 ? -1 : 1, s = o.s || 1, P = o.pal, T = o.trim || P;
    const g = group(sh, side * 0.035 * s, 0.035 * s, 0, 0, 0, -side * (o.tilt ?? 0.38));
    const dome = lathe([[0, 0.115], [0.05, 0.108], [0.09, 0.085], [0.118, 0.05], [0.132, 0.012], [0.136, -0.006], [0.128, -0.02], [0.0, -0.02]].map(([r, y]) => [r * s, y * s]), {
      seg: 26, sz: 1.08, pal: P,
      col: (a, j) => j === 4 || j === 5 ? T.e : j >= 6 ? T.c : mul(P.c, 0.7 + 0.5 * (1 - j / 4) + 0.15 * Math.cos(a - side * 1.3)),
      rmod: o.ridge ? (a) => 1 + 0.06 * Math.pow(Math.max(0, Math.cos(a * 2)), 10) : null,
    });
    C.put(dome, C.mP, 0, 0, 0, g);
    for (let k = 0; k < (o.lames ?? 2); k++) { // 팔을 감싸며 내려오는 판 (아래로 갈수록 바깥으로 벌어짐)
      const R = (0.11 + k * 0.004) * s, w = R * 2.5, h = 0.062 * s;
      const geo = plate(w, h, { th: 0.016 * s, pal: P, edgeCol: T.e, warp: bendX(R), kc: (u) => 0.62 + 0.45 * u, ch: 0.012 * s });
      const lame = group(g, 0, (-0.035 - k * 0.05) * s, 0, 0, side * Math.PI / 2, 0);
      const m = C.put(geo, C.mP, 0, 0, R, lame); m.rotation.x = -0.18 - k * 0.07;
    }
    const sp = o.spikes || 0;
    for (let i = 0; i < sp; i++) {
      const t = sp === 1 ? 0 : i / (sp - 1) - 0.5;
      const k = C.put(o.spikeGeo || spikeGeo(), C.mP, side * 0.02 * s, 0.075 * s, t * 0.16 * s, g);
      k.rotation.set(t * 0.9, 0, -side * (0.35 + Math.abs(t) * 0.4)); k.scale.setScalar(s * (o.spikeS || 1) * (1 - Math.abs(t) * 0.45));
    }
    return g;
  }
  // 투구: 머리 전체를 덮고, 눈 높이에 어두운 틈 · 가운데 볏 · 뺨 가리개
  function helm(C, head, o) {
    const P = o.pal, T = o.trim || P, VIS = lc(0x0c0a0e);
    const geo = lathe([[0, 0.29], [0.1, 0.275], [0.17, 0.235], [0.222, 0.16], [0.24, 0.085], [0.243, 0.07], [0.245, 0.055], [0.246, 0.012], [0.246, 0.0], [0.24, -0.08], [0.225, -0.16], [0.2, -0.22]], {
      seg: 32, sz: 1.08, pal: P,
      rmod: (a, y) => 1 + 0.06 * Math.exp(-a * a / 0.02) * (y > 0.1 ? 1 : 0) + (y < -0.05 ? 0.04 * Math.exp(-a * a / 0.3) : 0),
      col: (a, j, y) => {
        const front = Math.abs(a) < 1.0;
        if (front && y > 0.005 && y < 0.075 && Math.abs(a) > 0.06) return VIS; // 눈 틈
        if (front && y <= 0.0 && y > -0.2 && Math.abs(a) < 0.6 && Math.abs(a) > 0.05 && o.breath && Math.abs(Math.sin(a * 22)) > 0.8) return VIS;
        if (Math.abs(a) < 0.05 && y > -0.1) return T.e; // 가운데 볏
        if (j >= 10) return T.c;
        return mul(P.c, 0.66 + 0.5 * Math.max(0, (y + 0.2) / 0.5) + 0.12 * Math.cos(a - 0.5));
      },
    });
    C.put(geo, C.mP, 0, 0.0, 0.0, head);
    if (o.crest) { const c = C.put(blade(0.32, (u) => 0.03 * Math.sin(Math.PI * Math.min(1, u * 1.2)) + 0.006, { th: 0.02, pal: T, cv: (u) => -0.06 * u * u, n: 8 }), C.mP, 0, 0.18, 0.12, head); c.rotation.set(-1.35, Math.PI / 2, 0); }
  }
  const spikeGeo = () => once("spike", () => lathe([[0, 0.17], [0.012, 0.12], [0.026, 0.05], [0.034, 0.0], [0.0, 0.0]], { seg: 8, pal: METAL.silver(), col: (a, j) => mul(lc(0xd8dce4), 0.7 + 0.5 * Math.max(0, Math.cos(a - 0.6)) + 0.2 * (1 - j / 4)) }));

  // 가슴판: 몸통 앞을 감싸는 판 + 가슴 근육 굴곡 + 가운데 등줄기
  function chestPlate(C, torso, o) {
    const P = o.pal, prof = [[0.118, 0.6], [0.17, 0.56], [0.2, 0.5], [0.205, 0.43], [0.192, 0.34], [0.172, 0.25], [0.16, 0.19]];
    const geo = lathe(prof, {
      seg: 26, a0: o.back ? Math.PI - 1.35 : -1.35, a1: o.back ? Math.PI + 1.35 : 1.35, th: 0.016, sx: o.sx || 1.35, sz: o.sz || 0.84, pal: P,
      rmod: o.back ? null : (a, y) => 1 + 0.07 * Math.exp(-Math.pow((Math.abs(a) - 0.55) / 0.3, 2)) * Math.exp(-Math.pow((y - 0.44) / 0.07, 2)) + 0.03 * Math.exp(-a * a / 0.01),
      col: (a, j, y) => { const ridge = !o.back && Math.abs(a) < 0.08, pec = Math.exp(-Math.pow((Math.abs(a) - 0.5) / 0.3, 2)) * (y > 0.38 ? 1 : 0.4); return ridge ? P.e : mul(P.c, 0.66 + 0.5 * (y - 0.19) / 0.41 + 0.18 * pec); },
    });
    C.put(geo, C.mP, 0, 0, 0, torso);
  }
  // 허리 아래로 둘러 매다는 판(태싯)
  function faulds(C, torso, o) {
    const P = o.pal, n = o.n || 4, angs = o.angs || [-1.15, -0.4, 0.4, 1.15];
    for (let i = 0; i < angs.length; i++) {
      const a = angs[i], h = (o.h || 0.24) * (Math.abs(a) > 1 ? 0.85 : 1), w = o.w || 0.15;
      const geo = plate(w, h, { th: 0.016, pal: P, edgeCol: (o.trim || P).e, point: o.point ? 0.25 : 0, warp: bendX(0.2), kc: (u) => 0.62 + 0.5 * u });
      const g = group(torso, Math.sin(a) * 0.17 * (o.sx || 1), 0.1, Math.cos(a) * 0.17 * (o.sz || 0.82), 0, a, 0);
      const m = C.put(geo, C.mP, 0, -h / 2, -0.2 + 0.2, g); m.rotation.x = -0.16; // 바깥으로 살짝 벌어지게
    }
  }
  function belt(C, torso, o) {
    const P = o.pal, geo = lathe([[0.168, 0.15], [0.176, 0.135], [0.176, 0.085], [0.168, 0.07]], { seg: 26, sx: o.sx || 1.08, sz: o.sz || 0.8, pal: P, col: (a, j) => (j === 0 || j === 3 ? P.e : mul(P.c, 0.85 + 0.2 * Math.cos(a))) });
    C.put(geo, C.mP, 0, 0, 0, torso);
    if (o.buckle) { const bk = plate(0.09, 0.075, { th: 0.02, pal: o.buckle, ridge: 0.006, ch: 0.02 }); C.put(bk, C.mP, 0, 0.11, 0.145 * (o.sz || 0.8) / 0.8, torso); }
  }
  function vambrace(C, el, o) {
    const P = o.pal, s = o.s || 1;
    const geo = lathe([[0.066, -0.05], [0.074, -0.065], [0.07, -0.1], [0.066, -0.16], [0.074, -0.22], [0.08, -0.235]].map(([r, y]) => [r * s, y]), {
      seg: 16, pal: P, rmod: o.ridge ? (a) => 1 + 0.18 * Math.exp(-Math.pow(a - Math.PI * (o.side > 0 ? 0.5 : 1.5), 2) / 0.08) : null,
      col: (a, j) => (j === 0 || j >= 4 ? (o.trim || P).e : mul(P.c, 0.75 + 0.35 * Math.max(0, Math.cos(a - 0.4)))),
    });
    C.put(geo, C.mP, 0, 0, 0, el);
  }
  function greave(C, kn, o) {
    const P = o.pal;
    const geo = lathe([[0.078, 0.02], [0.092, -0.02], [0.09, -0.12], [0.082, -0.24], [0.094, -0.33], [0.1, -0.37]], { seg: 16, sz: 1.12, pal: P, col: (a, j) => (j === 0 || j === 5 ? (o.trim || P).e : mul(P.c, 0.7 + 0.45 * Math.max(0, Math.cos(a)) * (1 - j * 0.1))) });
    C.put(geo, C.mP, 0, 0, 0.004, kn);
    const cop = lathe([[0, 0.05], [0.05, 0.045], [0.075, 0.02], [0.08, 0], [0, 0]], { seg: 14, sz: 0.7, pal: P, col: (a, j) => (j === 3 ? (o.trim || P).e : mul(P.c, 1.1 - j * 0.1)) });
    const m = C.put(cop, C.mP, 0, 0.0, 0.05, kn); m.rotation.x = Math.PI / 2 - 0.2;
    sabaton(C, kn, P, o.trim || P);
    if (o.wing) { const w = plate(0.06, 0.09, { th: 0.012, pal: P, point: 0.4 }); for (const s of [-1, 1]) { const wm = C.put(w, C.mP, s * 0.07, 0.0, 0.03, kn); wm.rotation.set(0, s * 1.1, s * 0.4); } }
  }
  function boot(C, kn, o) {
    const P = o.pal;
    const geo = lathe([[0.078, -0.18], [0.088, -0.28], [0.09, -0.38], [0.094, -0.43]], { seg: 14, sz: 1.08, pal: P, col: (a, j) => (j === 0 ? (o.trim || P).e : mul(P.c, 0.7 + 0.35 * Math.max(0, Math.cos(a)))) });
    C.put(geo, C.mP, 0, 0, 0, kn);
    sabaton(C, kn, P, o.trim || P);
    const cuff = lathe([[0.1, -0.16], [0.106, -0.19], [0.094, -0.22], [0.08, -0.22]], { seg: 14, sz: 1.1, a0: -2.2, a1: 2.2, pal: o.cuff || P, th: 0.008 });
    C.put(cuff, C.mP, 0, 0, 0.004, kn);
  }
  // 발등 판 (발끝이 살짝 뾰족한 신발)
  function sabaton(C, kn, P, T) {
    const geo = lathe([[0, 0.05], [0.05, 0.045], [0.065, 0.02], [0.07, 0.0], [0.07, -0.03], [0, -0.03]], { seg: 14, sx: 1.0, sz: 2.0, a0: -Math.PI / 2, a1: Math.PI / 2, pal: P, col: (a, j) => (j === 3 ? T.e : mul(P.c, 0.75 + 0.35 * (1 - j / 5))) });
    C.put(geo, C.mP, 0, -0.42, 0.03, kn);
  }
  // 손등을 덮는 판 + 손가락 마디 판 (건틀릿)
  function gauntlet(C, el, P, T) {
    const geo = lathe([[0, 0.05], [0.05, 0.045], [0.068, 0.02], [0.07, -0.02], [0.06, -0.06]], { seg: 14, sx: 0.9, sz: 0.7, pal: P, col: (a, j) => (j === 4 ? T.e : mul(P.c, 0.75 + 0.4 * Math.max(0, Math.cos(a)))) });
    C.put(geo, C.mP, 0, -0.28, 0.0, el);
    const cuff = lathe([[0.085, -0.19], [0.09, -0.22], [0.082, -0.25], [0.068, -0.25]], { seg: 14, pal: P, col: (a, j) => (j === 1 ? T.e : mul(P.c, 0.8)) });
    C.put(cuff, C.mP, 0, 0, 0, el);
  }
  function cape(C, torso, ud, o) {
    const geo = cloth({ w0: o.w0 || 0.4, w1: o.w1 || 0.7, h: o.h || 0.95, folds: o.folds || 3.5, fold: 0.045, flare: o.flare ?? 0.12, wrap: o.wrap ?? 0.06, tatter: o.tatter || 0, pal: o.pal, trim: o.trim, trimW: 0.07, trimSide: !!o.trimSide, seed: o.seed || 0, nu: 16, nv: 12 });
    const c = C.put(geo, C.mP, 0, 0.6, -0.15, torso); c.rotation.x = 0.12; ud.cape = c;
    return c;
  }
  // 털 목도리: 들쭉날쭉한 털 뭉치를 목 둘레에
  function furCollar(C, torso, o) {
    const geo = lathe([[0.1, 0.7], [0.19, 0.66], [0.26, 0.6], [0.27, 0.55], [0.2, 0.53], [0.12, 0.56]], {
      seg: 40, sx: o.sx || 1.15, sz: o.sz || 0.95, pal: o.pal,
      rmod: (a, y, j) => 1 + (j >= 2 && j <= 3 ? 0.16 * Math.pow(Math.abs(Math.sin(a * 9)), 3) : 0.05 * Math.sin(a * 13)),
      ymod: (a, y, j) => (j === 3 || j === 4 ? -0.06 * Math.pow(Math.abs(Math.sin(a * 9 + 0.5)), 4) : 0),
      col: (a, j) => mul(o.pal.c, j <= 1 ? 1.25 : j === 2 ? 1.0 : 0.62),
    });
    C.put(geo, C.mP, 0, 0, -0.01, torso);
  }
  // 여민 깃: 가슴 앞에서 V 자로 겹치는 천 띠 두 장
  function lapels(C, torso, o) {
    for (const s of [-1, 1]) {
      const geo = cloth({ w0: 0.07, w1: 0.08, h: 0.36, folds: 0.5, fold: 0.006, face: 1, pal: o.pal, trim: o.trim, trimSide: true, trimW: 0.0, nu: 4, nv: 6, warp: bendX(0.2) });
      const m = C.put(geo, C.mP, s * 0.07, 0.58, 0.152, torso); m.rotation.set(-0.12, 0, s * 0.42);
    }
  }
  // 허리 앞뒤로 늘어지는 천 자락
  function loinCloth(C, torso, o) {
    for (const f of o.back ? [1, -1] : [1]) {
      const geo = cloth({ w0: o.w || 0.18, w1: (o.w || 0.18) * 1.15, h: o.h || 0.5, folds: 1.5, fold: 0.02, flare: 0.03, face: f, pal: o.pal, trim: o.trim, trimW: 0.12, trimSide: true, tatter: o.tatter || 0, nu: 6, nv: 8, pattern: o.pattern });
      C.put(geo, C.mP, 0, 0.1, f * 0.135 * (o.sz || 1), torso).rotation.x = f * 0.06;
    }
  }
  // 긴 치마·로브 (주름 있는 원통). 다리 위를 덮어요
  function robe(C, torso, o) {
    const P = o.pal, TR = o.trim ? lc(o.trim) : null, folds = o.folds || 9, h = o.h || 0.7, n = 8;
    const prof = []; for (let j = 0; j <= n; j++) { const v = j / n; prof.push([0.17 + (o.flare ?? 0.17) * v * v + 0.05 * v, 0.14 - h * v]); }
    const geo = lathe(prof, {
      seg: 36, sx: o.sx || 1.05, sz: o.sz || 0.85, pal: P, a0: o.open ? 0.5 : 0, a1: o.open ? TAU - 0.5 : TAU, th: o.open ? 0.01 : 0,
      rmod: (a, y, j) => 1 + 0.07 * (j / n) * Math.sin(a * folds),
      ymod: o.tatter ? (a, y, j) => (j === n ? 0.06 * Math.pow(Math.abs(Math.sin(a * folds * 0.5)), 2) : 0) : null,
      col: (a, j) => (TR && j >= n - 1 ? mul(TR, 0.9 + 0.2 * Math.sin(a * folds)) : mul(P.c, (0.72 + 0.38 * (0.5 + 0.5 * Math.sin(a * folds))) * (1.1 - 0.35 * j / n))),
    });
    C.put(geo, C.mP, 0, 0, 0, torso);
  }
  // 어깨에 비스듬히 두르는 가죽끈
  function strap(C, torso, o) {
    const P = o.pal, s = o.dir || 1;
    const geo = lathe([[0.2, 0.025], [0.2, -0.025]], { seg: 30, sx: 1.25, sz: 0.85, pal: P, col: (a, j) => mul(P.c, 0.8 + 0.3 * Math.cos(a)) });
    const m = C.put(geo, C.mP, 0, 0.36, 0, torso); m.rotation.z = s * 0.75;
    if (o.studs) for (let i = 0; i < 4; i++) { const a = -0.6 + i * 0.4; const st = C.put(gemGeo(), C.mP, 0, 0, 0, torso); const R2 = 0.2; const lx = Math.sin(a) * R2 * 1.25, lz = Math.cos(a) * R2 * 0.85 + 0.005; const c = Math.cos(s * 0.75), sn = Math.sin(s * 0.75); st.position.set(lx * c, 0.36 + lx * sn, lz); st.scale.setScalar(0.6); }
  }
  const gemGeo = () => once("gem", () => lathe([[0, 0.03], [0.02, 0.015], [0.022, 0], [0.02, -0.015], [0, -0.03]], { seg: 6, pal: METAL.gold(), col: (a, j) => mul(lc(0xf0d070), 0.7 + 0.5 * Math.max(0, Math.cos(a))) }));
  function bandage(C, el, n, col) { const P = pal(col || 0xe6dcc4); for (let i = 0; i < n; i++) { const geo = once("wrap" + (col || 0), () => lathe([[0.067, 0.012], [0.07, 0], [0.067, -0.012]], { seg: 14, pal: P, col: (a, j) => mul(P.c, j === 1 ? 1.05 : 0.75) })); const m = C.put(geo, C.mP, 0, -0.12 - i * 0.022, 0, el); m.rotation.z = (i % 2 ? 0.12 : -0.12); } }
  function hood(C, torso, o) { // 뒤로 젖힌 두건 (목 뒤)
    const P = o.pal, geo = lathe([[0.02, 0.1], [0.12, 0.08], [0.17, 0.02], [0.17, -0.05], [0.1, -0.09]], { seg: 20, a0: Math.PI - 1.7, a1: Math.PI + 1.7, th: 0.012, pal: P });
    C.put(geo, C.mP, 0, 0.6, -0.04, torso).rotation.x = 0.4;
  }

  // ---------- 5코스트 신 (정주환 · 김예균) ----------
  // 몸을 키우고, 등 뒤 거대한 광륜 · 날개 · 떠 있는 왕관 · 몸 둘레를 도는 파편 · 발밑 문양까지 둘러요
  const DIVINE = {
    "정주환": { theme: "sun", glow: 0xffd86b, glow2: 0xfff4c8 },
    "김예균": { theme: "demon", glow: 0xff2a3a, glow2: 0xff9a5a },
  };
  // 평면(XY)에 그린 것을 그 평면 안에서 돌게 하는 묶음: P(눕힘) → S(회전) → Q(되돌림)
  function planeSpinner(parent, x, y, z, ud, speed, tilt = 0) {
    const P = group(parent, x, y, z, Math.PI / 2 + tilt, 0, 0), S = group(P), Q = group(S, 0, 0, 0, -Math.PI / 2, 0, 0);
    (ud.dspin || (ud.dspin = [])).push([S, speed]); return Q;
  }
  function feather(len, w, P, edge) {
    return blade(len, (u) => w * Math.sin(Math.PI * Math.min(1, u * 1.25 + 0.08)) * (1 - u * 0.35) + 0.004, { th: 0.014, pal: P, edgeCol: edge, ridge: 0.006, cv: (u) => 0.05 * u * u, back: (u) => w * 0.55 * Math.sin(Math.PI * Math.min(1, u * 1.1 + 0.1)), n: 10 });
  }
  function divine(def, CH, C) {
    const D = DIVINE[def.n]; if (!D) return false;
    const { torso, ud } = C, root = torso.parent, [shL, shR] = ud.arms, [elL, elR] = ud.elbows, [knL, knR] = ud.knees;
    const glow = (hex, k = 1.8) => C.mk(hex, 0.2, { emissive: lin(hex), emissiveIntensity: k });
    const gem = (parent, x, y, z, s = 1, hex = D.glow) => { const g = C.put(gemGeo(), glow(hex), x, y, z, parent); g.scale.setScalar(s); return g; };
    ud.divine = D; ud.bodyK = 1.14;
    const sun = D.theme === "sun";
    const GOLD = pal(0xd8a840, 0xfff4c0), WHITE = pal(0xf6f0e2, 0xffe8a0), PEARL = pal(0x2a2630, 0xff5a48), TEAL = pal(0x6a1420, 0xff6a4a), DEEP = pal(0x180a10, 0xff3a3a); // 악마: 흑요석 갑옷 · 핏빛 테 · 검은 천
    const A = sun ? GOLD : PEARL, T = sun ? WHITE : TEAL, CL = sun ? WHITE : DEEP;
    // --- 갑옷: 3겹 큰 어깨 + 가시 대신 깃털/수정 장식 ---
    for (const sh of [shL, shR]) {
      const g = pauldron(C, sh, { pal: A, trim: T, s: 1.6, lames: 3, ridge: 1, tilt: 0.3 });
      const side = sh.position.x < 0 ? -1 : 1;
      for (let i = 0; i < 3; i++) { // 어깨 위로 솟은 깃털(해) / 수정(바다)
        const geo = sun ? feather(0.3 - i * 0.06, 0.04, WHITE, GOLD.e) : blade(0.3 - i * 0.06, (u) => 0.04 * (1 - u), { th: 0.05, pal: pal(0x1c181e, 0xff4a3a), edgeCol: lc(0xff4a3a), cv: (u) => -0.08 * u * u, n: 8, bev: 0.02 });
        const f = C.put(geo, C.mP, side * 0.05, 0.1, -0.05 + i * 0.05, g); f.rotation.set(-0.3 + i * 0.3, 0, -side * (0.35 + i * 0.25));
      }
      gem(g, side * 0.03, 0.12, 0.12, 1.2);
    }
    chestPlate(C, torso, { pal: A }); chestPlate(C, torso, { pal: A, back: 1 });
    // 가슴 한가운데 빛나는 핵 + 둘레 테
    gem(torso, 0, 0.44, 0.2, 2.2, D.glow2);
    C.put(lathe([[0.05, 0.012], [0.055, 0], [0.05, -0.012]], { seg: 16, pal: T, col: () => T.e }), C.mP, 0, 0.44, 0.19, torso).rotation.x = Math.PI / 2;
    belt(C, torso, { pal: T, buckle: A });
    faulds(C, torso, { pal: A, trim: T, point: 1, h: 0.3 });
    robe(C, torso, { pal: CL, h: 0.86, flare: 0.26, folds: 12, trim: sun ? 0xd8a840 : 0x8a1020 });
    for (const el of [elL, elR]) { vambrace(C, el, { pal: A, trim: T, s: 1.15, ridge: 1, side: el === elL ? -1 : 1 }); gauntlet(C, el, A, T); }
    for (const kn of [knL, knR]) greave(C, kn, { pal: A, trim: T, wing: 1 });
    // 망토: 해는 흰 바탕 금테, 바다는 깊은 물빛에서 밝은 물결로 번지는 무늬
    const wave = sun ? null : (u, v) => { const k = Math.abs(Math.sin(u * 19 + Math.sin(v * 11 + u * 5) * 1.6)); if (k < 0.07 && v > 0.15) return mul(lc(0xff3a2a), 1.3); return mix(lc(0x120810), lc(0x4a0c18), v * v); }; // 검은 천에 핏빛 균열
    const cp = cloth({ w0: 0.56, w1: 1.15, h: 1.12, folds: 4.5, fold: 0.06, flare: 0.22, wrap: 0.08, pal: CL, trim: sun ? 0xd8a840 : 0x9a1424, trimW: 0.08, trimSide: true, pattern: wave, nu: 18, nv: 12, tatter: sun ? 0 : 0.5, seed: 4 });
    const cm = C.put(cp, C.mP, 0, 0.62, -0.17, torso); cm.rotation.x = 0.12; ud.cape = cm;
    // --- 등 뒤 날개 (해) / 물결 지느러미 (바다) ---
    ud.wings = [];
    for (const s of [-1, 1]) {
      const wr = group(torso, s * 0.09, 0.5, -0.2, 0, s * 0.35, 0); wr.userData.base = s * 0.35; ud.wings.push(wr);
      if (sun) {
        const rows = [[9, 0.95, 0.075, WHITE], [7, 0.55, 0.07, pal(0xf2e2b8, 0xfff4c0)], [6, 0.28, 0.06, GOLD]];
        rows.forEach(([n, L, w, P], r) => { for (let i = 0; i < n; i++) {
          const t = i / (n - 1), a = 0.2 + t * 1.55, len = L * (1 - t * 0.38);
          const f = C.put(feather(len, w, P, r === 2 ? lc(0xfff8d8) : GOLD.e), C.mP, s * (0.04 + Math.sin(a) * 0.16 * (1 - r * 0.3)), Math.cos(a) * 0.14 * (1 - r * 0.3) + r * 0.02, -0.015 * r + 0.02, wr);
          f.rotation.set(0, 0, -s * a); if (s < 0) f.rotation.y = Math.PI;
        } });
        for (let i = 0; i < 4; i++) { const t = i / 3, a = 0.3 + t * 1.3; gem(wr, s * (0.06 + Math.sin(a) * 0.5), Math.cos(a) * 0.5 + 0.05, 0.03, 0.9, D.glow2); }
      } else {
        const BONE = pal(0x2a2228, 0xff5a48), MEM = pal(0x3a0c16, 0xff3a2a), angs = [0.15, 0.55, 0.95, 1.35, 1.75], lens = [1.0, 0.92, 0.8, 0.66, 0.5];
        for (let i = 0; i < angs.length; i++) { // 뼈대: 끝에 갈고리 발톱
          const b = C.put(blade(lens[i], (u) => 0.022 * (1 - u * 0.75), { th: 0.03, pal: BONE, edgeCol: lc(0x6a5a64), cv: (u) => -0.12 * u * u, n: 10 }), C.mP, s * 0.03, 0.0, 0.0, wr); b.rotation.set(0, s < 0 ? Math.PI : 0, -s * angs[i]);
          const cl = C.put(blade(0.1, (u) => 0.018 * (1 - u), { th: 0.02, pal: BONE, edgeCol: lc(0xff5a48), cv: (u) => 0.06 * u, n: 4 }), C.mP, s * Math.sin(angs[i]) * lens[i] * 0.98, Math.cos(angs[i]) * lens[i] * 0.98, 0, wr); cl.rotation.set(0, s < 0 ? Math.PI : 0, -s * (angs[i] - 0.5));
          if (i < angs.length - 1) { // 뼈 사이를 잇는 막 (끝단이 안으로 파인 모양)
            const am = (angs[i] + angs[i + 1]) / 2, lm = (lens[i] + lens[i + 1]) / 2;
            const m = C.put(blade(lm * 0.95, (u) => 0.2 * lm * Math.sin(Math.PI * u) * (1 - 0.25 * u), { th: 0.008, pal: MEM, edgeCol: lc(0xc8202a), kc: (u) => 0.55 + 0.6 * u, cv: (u) => -0.06 * u * u, n: 12 }), C.mP, s * 0.03, 0, -0.01, wr);
            m.rotation.set(0, s < 0 ? Math.PI : 0, -s * am);
          }
        }
        for (let i = 0; i < 3; i++) { const a = angs[i]; gem(wr, s * Math.sin(a) * lens[i] * 0.55, Math.cos(a) * lens[i] * 0.55, 0.03, 0.8); }
      }
    }
    // --- 머리 뒤 거대한 광륜 (천천히 돌아요) ---
    const halo = planeSpinner(torso, 0, 0.9, -0.3, ud, sun ? 0.35 : -0.45);
    C.put(new THREE.TorusGeometry(0.44, 0.016, 6, 64), glow(D.glow, 1.4), 0, 0, 0, halo);
    C.put(new THREE.TorusGeometry(0.33, 0.008, 6, 48), glow(D.glow2, 1.6), 0, 0, 0, halo);
    const nR = sun ? 16 : 14;
    for (let i = 0; i < nR; i++) {
      const a = (i / nR) * TAU, long = i % 2 === 0;
      const geo = sun ? blade(long ? 0.22 : 0.13, (u) => 0.026 * (1 - u), { th: 0.012, pal: GOLD, edgeCol: lc(0xfff8d8), ridge: 0.005, n: 4 })
        : blade((long ? 0.24 : 0.1) * (0.7 + 0.6 * hash(i * 5.3)), (u) => 0.03 * (1 - u), { th: 0.016, pal: pal(0x1c181e, 0xff4a3a), edgeCol: lc(0xff4a3a), cv: (u) => (i % 2 ? 0.05 : -0.05) * u * u, n: 6 });
      const r = C.put(geo, C.mP, Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0, halo); r.rotation.z = a - Math.PI / 2;
    }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.26; gem(halo, Math.cos(a) * 0.33, Math.sin(a) * 0.33, 0.01, 1.0, D.glow2); }
    // --- 머리 위에 떠 있는 왕관 ---
    const cr = group(C.head, 0, 0.42, 0); ud.float = [[cr, 0.42]];
    C.put(new THREE.TorusGeometry(0.2, 0.02, 6, 32), glow(D.glow, 1.3), 0, 0, 0, cr).rotation.x = Math.PI / 2;
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; const sp = C.put(blade(i % 3 === 0 ? 0.26 : 0.16, (u) => 0.03 * (1 - u), { th: sun ? 0.014 : 0.03, pal: sun ? GOLD : pal(0x1c181e, 0xff4a3a), edgeCol: lc(sun ? 0xfff8d8 : 0xff4a3a), n: 4, bev: 0.01, cv: sun ? null : (u) => 0.04 * u * u }), C.mP, Math.sin(a) * 0.2, 0, Math.cos(a) * 0.2, cr); sp.rotation.set(Math.cos(a) * 0.25, a, 0); sp.rotation.order = "YXZ"; }
    if (!sun) for (const s of [-1, 1]) { // 악마의 뿔: 관자놀이에서 뒤로 휘었다가 위로 솟아요
      const hn = C.put(blade(0.62, (u) => 0.07 * (1 - u * 0.92), { th: 0.11, pal: pal(0x2e282e, 0x9a8a94), edgeCol: lc(0xff4a3a), cv: (u) => 0.32 * u * u - 0.05 * u, n: 14, bev: 0.03, kc: (u) => (u > 0.8 ? 2.2 : 0.7 + 0.3 * u) }), C.mP, s * 0.17, 0.12, -0.02, C.head);
      hn.rotation.set(-0.12, s > 0 ? 0 : Math.PI, -s * 0.85); hn.scale.setScalar(1.25);
      gem(C.head, s * 0.2, 0.14, 0.02, 0.9);
    }
    // --- 몸 둘레를 도는 파편 ---
    const orb = group(torso, 0, 0.25, 0); (ud.dspin || (ud.dspin = [])).push([orb, sun ? 0.9 : -0.8]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU, rr = 0.62, y = Math.sin(i * 1.7) * 0.18;
      const geo = sun ? feather(0.2, 0.04, GOLD, lc(0xfff8d8)) : lathe([[0, 0.12], [0.035, 0.03], [0.04, 0], [0.03, -0.04], [0, -0.07]], { seg: 6, pal: TEAL, col: (aa, j) => (j === 0 ? lc(0xff4a3a) : mul(lc(0x2a2630), 0.7 + 0.8 * Math.max(0, Math.cos(aa)))) });
      const s2 = C.put(geo, C.mP, Math.cos(a) * rr, y, Math.sin(a) * rr, orb); s2.rotation.set(0.3, -a, 0.4);
      gem(orb, Math.cos(a) * rr, y - 0.06, Math.sin(a) * rr, 0.7, D.glow2);
    }
    // --- 발밑 문양 ---
    const sig = group(root, 0, 0.215, 0); (ud.dspin || (ud.dspin = [])).push([sig, sun ? 0.25 : -0.3]);
    const flat = (r, t) => { const g2 = new THREE.TorusGeometry(r, t, 4, 72); g2.rotateX(Math.PI / 2); g2.scale(1, 0.15, 1); return g2; };
    C.put(flat(0.72, 0.012), glow(D.glow, 1.1), 0, 0, 0, sig); C.put(flat(0.58, 0.006), glow(D.glow2, 1.2), 0, 0, 0, sig);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; const tk = C.put(new THREE.BoxGeometry(i % 3 ? 0.03 : 0.07, 0.004, 0.012), glow(D.glow, 1.2), Math.cos(a) * 0.65, 0, Math.sin(a) * 0.65, sig); tk.rotation.y = -a; }
    return true;
  }
  // ---------- 영웅별 갑옷 ----------
  function armor(def, CH, C) {
    if (divine(def, CH, C)) return true;
    const { torso, ud } = C, [shL, shR] = ud.arms, [elL, elR] = ud.elbows, [knL, knR] = ud.knees;
    const kit = CH.kit, M = (METAL[CH.metal] || METAL.steel)(), GOLD = METAL.gold(), DARK = METAL.dark();
    const main = pal(CH.top), sub = pal(CH.bottom ?? CH.top), acc = pal(CH.accent, CH.accent), leather = pal(0x5a3a26, 0xb08058), leatherD = pal(0x2e2018, 0x7a5a40);
    const trimP = CH.metal === "gold" || kit === "god" ? GOLD : CH.metal === "bronze" ? METAL.bronze() : M;
    const glow = (hex, k = 1.6) => C.mk(hex, 0.2, { emissive: lin(hex), emissiveIntensity: k });
    const gem = (parent, x, y, z, s = 1, hex = CH.accent) => { const g = C.put(gemGeo(), glow(hex), x, y, z, parent); g.scale.setScalar(s); return g; };
    switch (kit) {
      case "guard": { // 판금 기사: 둥근 어깨 3겹, 가슴판, 태싯, 정강이받이, 망토
        pauldron(C, shL, { pal: M, trim: GOLD, s: 1.3, lames: 3, ridge: 1 }); pauldron(C, shR, { pal: M, trim: GOLD, s: 1.3, lames: 3, ridge: 1 });
        chestPlate(C, torso, { pal: M }); chestPlate(C, torso, { pal: M, back: 1 });
        gem(torso, 0, 0.45, 0.19, 1.3);
        belt(C, torso, { pal: leatherD, buckle: GOLD }); faulds(C, torso, { pal: M, trim: GOLD });
        loinCloth(C, torso, { pal: main, trim: CH.accent, h: 0.5, w: 0.16 });
        for (const el of [elL, elR]) { vambrace(C, el, { pal: M, trim: GOLD }); gauntlet(C, el, M, GOLD); }
        for (const kn of [knL, knR]) { greave(C, kn, { pal: M, trim: GOLD, wing: 1 }); }
        cape(C, torso, ud, { pal: main, trim: CH.accent, w0: 0.46, w1: 0.78, h: 1.0 });
        break;
      }
      case "juggernaut": { // 거대한 가시 어깨, 털 목도리, 두꺼운 판금
        const T = pal(CH.accent, CH.accent, 0.8);
        pauldron(C, shL, { pal: M, trim: T, s: 1.65, lames: 3, spikes: 3, spikeS: 1.2, tilt: 0.3 }); pauldron(C, shR, { pal: M, trim: T, s: 1.65, lames: 3, spikes: 3, spikeS: 1.2, tilt: 0.3 });
        chestPlate(C, torso, { pal: M, sx: 1.42, sz: 0.9 }); chestPlate(C, torso, { pal: M, back: 1, sx: 1.42, sz: 0.9 });
        furCollar(C, torso, { pal: pal(0x4a3a2e) });
        for (const s of [-1, 1]) { const k = C.put(spikeGeo(), C.mP, s * 0.08, 0.38, 0.19, torso); k.rotation.set(1.3, 0, s * 0.3); k.scale.setScalar(0.8); }
        gem(torso, 0, 0.34, 0.2, 1.4);
        belt(C, torso, { pal: leatherD, buckle: M, sx: 1.15, sz: 0.88 }); faulds(C, torso, { pal: M, trim: T, w: 0.17, h: 0.27, sx: 1.08, sz: 0.9 });
        loinCloth(C, torso, { pal: main, trim: CH.accent, h: 0.55, w: 0.2, tatter: 0.25, back: 1 });
        for (const el of [elL, elR]) { vambrace(C, el, { pal: M, trim: T, s: 1.25, ridge: 1, side: el === elL ? -1 : 1 }); if (CH.weapon !== "gauntlets") gauntlet(C, el, M, T); }
        for (const kn of [knL, knR]) greave(C, kn, { pal: M, trim: T, wing: 1 });
        cape(C, torso, ud, { pal: main, w0: 0.5, w1: 0.7, h: 0.8, tatter: 0.35, seed: 3 });
        break;
      }
      case "warrior": { // 한쪽 어깨만 무거운 갑옷, 반대 팔은 붕대. 허리끈 + 긴 앞자락
        pauldron(C, shR, { pal: M, trim: acc, s: 1.45, lames: 2, spikes: 3 });
        const lp = lathe([[0, 0.05], [0.07, 0.045], [0.11, 0.02], [0.115, -0.01], [0, -0.01]], { seg: 16, pal: leather, sz: 1.1 }); C.put(lp, C.mP, -0.01, 0.02, 0, shL).rotation.z = 0.3;
        if (CH.weapon === "blades") lapels(C, torso, { pal: pal(CH.bottom), trim: CH.accent });
        else chestPlate(C, torso, { pal: leather });
        strap(C, torso, { pal: leatherD, dir: -1, studs: 1 });
        belt(C, torso, { pal: pal(CH.accent, CH.accent, 0.8), buckle: M });
        robe(C, torso, { pal: sub, h: 0.48, flare: 0.12, folds: 8, open: 1, trim: CH.accent });
        loinCloth(C, torso, { pal: main, trim: CH.accent, h: 0.62, w: 0.15, tatter: 0.3, back: 1 });
        bandage(C, elL, 5); vambrace(C, elR, { pal: M, trim: acc });
        for (const kn of [knL, knR]) boot(C, kn, { pal: leatherD, cuff: leather });
        const sc = cloth({ w0: 0.12, w1: 0.16, h: 0.75, folds: 1.5, fold: 0.02, flare: 0.2, face: -1, pal: main, tatter: 0.5, nu: 6, nv: 10, seed: 7 }); // 목에서 흩날리는 긴 띠
        const sm2 = C.put(sc, C.mP, 0.06, 0.6, -0.14, torso); sm2.rotation.set(0.25, 0.3, -0.1); ud.cape = sm2;
        break;
      }
      case "ranger": { // 반쯤 덮는 두건 망토, 가죽 겹어깨, 화살통
        for (const sh of [shL, shR]) pauldron(C, sh, { pal: leather, trim: leatherD, s: 1.1, lames: 2 });
        hood(C, torso, { pal: main });
        chestPlate(C, torso, { pal: leather });
        strap(C, torso, { pal: leatherD, dir: 1 });
        belt(C, torso, { pal: leatherD, buckle: M });
        loinCloth(C, torso, { pal: main, trim: CH.accent, h: 0.46, w: 0.15, back: 1 });
        for (const el of [elL, elR]) vambrace(C, el, { pal: leather, trim: leatherD });
        for (const kn of [knL, knR]) boot(C, kn, { pal: leatherD, cuff: leather });
        cape(C, torso, ud, { pal: pal(CH.top, null, 0.75), w0: 0.42, w1: 0.62, h: 0.75, tatter: 0.4, seed: 5 });
        if (CH.weapon === "bow") { // 화살통
          const q = group(torso, 0.1, 0.36, -0.2, 0.15, 0, -0.45);
          C.put(lathe([[0.055, 0.22], [0.06, 0.2], [0.055, -0.2], [0.045, -0.22], [0, -0.22]], { seg: 12, pal: leatherD, col: (a, j) => (j <= 1 ? M.e : mul(leatherD.c, 0.8 + 0.4 * Math.cos(a))) }), C.mP, 0, 0, 0, q);
          for (let i = 0; i < 4; i++) { const f = C.put(plate(0.03, 0.08, { th: 0.006, pal: acc, point: 0.3 }), C.mP, (i - 1.5) * 0.022, 0.3, (i % 2) * 0.015, q); f.rotation.y = i * 0.7; }
        }
        break;
      }
      case "assassin": { // 날렵한 가죽 갑옷, 팔뚝 칼날, 긴 찢어진 목도리
        for (const sh of [shL, shR]) pauldron(C, sh, { pal: leatherD, trim: acc, s: 1.0, lames: 2 });
        chestPlate(C, torso, { pal: leatherD });
        strap(C, torso, { pal: leatherD, dir: -1, studs: 1 }); strap(C, torso, { pal: leatherD, dir: 1 });
        belt(C, torso, { pal: leatherD, buckle: DARK });
        loinCloth(C, torso, { pal: main, trim: CH.accent, h: 0.55, w: 0.13, tatter: 0.45, back: 1, seed: 2 });
        for (const el of [elL, elR]) { vambrace(C, el, { pal: DARK, trim: acc, ridge: 1, side: el === elL ? -1 : 1 }); const b = C.put(blade(0.16, (u) => 0.018 * (1 - u * 0.9), { th: 0.008, pal: METAL.silver(), n: 4 }), C.mP, (el === elL ? -1 : 1) * 0.07, -0.14, -0.02, el); b.rotation.set(Math.PI, 0, (el === elL ? -1 : 1) * 0.1); }
        for (const kn of [knL, knR]) { boot(C, kn, { pal: DARK, cuff: leatherD }); greave(C, kn, { pal: DARK, trim: acc }); }
        cape(C, torso, ud, { pal: pal(CH.top, null, 0.9), w0: 0.36, w1: 0.6, h: 0.95, tatter: 0.6, seed: 9, trim: CH.accent });
        break;
      }
      case "mage": { // 바닥까지 끌리는 로브, 높은 깃, 겹친 어깨판, 떠 있는 구슬
        robe(C, torso, { pal: sub, h: 0.86, flare: 0.22, folds: 10, trim: CH.accent, open: CH.coat ? 1 : 0 });
        robe(C, torso, { pal: main, h: 0.5, flare: 0.1, folds: 7, open: 1, trim: CH.accent });
        const col = lathe([[0.16, 0.8], [0.2, 0.76], [0.17, 0.66], [0.12, 0.6]], { seg: 24, a0: Math.PI - 2.2, a1: Math.PI + 2.2, th: 0.01, sx: 1.2, pal: main, edgeCol: lc(CH.accent) });
        C.put(col, C.mP, 0, 0, 0, torso);
        for (const sh of [shL, shR]) pauldron(C, sh, { pal: trimP, trim: acc, s: 1.05, lames: 1 });
        belt(C, torso, { pal: pal(CH.accent, null, 0.7), buckle: trimP });
        strap(C, torso, { pal: pal(CH.accent, null, 0.8), dir: 1 });
        for (const el of [elL, elR]) vambrace(C, el, { pal: main, trim: trimP });
        cape(C, torso, ud, { pal: pal(CH.top, null, 0.7), w0: 0.44, w1: 0.82, h: 1.05, trim: CH.accent, trimSide: 1, flare: 0.16 });
        const oc = CH.accent, o = new THREE.Group(); o.position.set(0.32, 0.82, -0.18); o.scale.setScalar(0.85); torso.add(o);
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), glow(oc)); o.add(orb);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.008, 5, 28), glow(oc, 0.8)); ring.rotation.x = 1.2; o.add(ring); ud.orb = o;
        break;
      }
      case "bard": { // 긴 외투(뒤로 갈라진 자락), 장식 어깨, 깃발
        robe(C, torso, { pal: main, h: 0.72, flare: 0.16, folds: 8, open: 1, trim: CH.accent });
        for (const sh of [shL, shR]) pauldron(C, sh, { pal: trimP, trim: acc, s: 1.15, lames: 2, ridge: 1 });
        strap(C, torso, { pal: pal(CH.accent, null, 0.85), dir: 1 });
        belt(C, torso, { pal: leatherD, buckle: GOLD });
        for (const el of [elL, elR]) vambrace(C, el, { pal: leather, trim: GOLD });
        for (const kn of [knL, knR]) boot(C, kn, { pal: leatherD, cuff: GOLD });
        const p = group(torso, -0.1, 0.5, -0.18, 0, 0, 0.12);
        C.put(lathe([[0.012, 0.5], [0.012, -0.45]], { seg: 6, pal: GOLD }), C.mP, 0, 0, 0, p);
        gem(p, 0, 0.53, 0, 1.6);
        const fl = new THREE.Mesh(cloth({ w0: 0.26, w1: 0.2, h: 0.4, face: 1, folds: 2, fold: 0.02, pal: main, trim: CH.accent, trimW: 0.15, tatter: 0.3, nu: 6, nv: 6 }), C.mP); fl.position.set(0.14, 0.45, 0); fl.rotation.y = -Math.PI / 2; fl.castShadow = true; p.add(fl); ud.banner = fl;
        break;
      }
      case "monk": { // 넓은 바지(하카마), 긴 허리띠 자락, 염주, 한쪽 어깨 판
        robe(C, torso, { pal: sub, h: 0.62, flare: 0.2, folds: 12 });
        lapels(C, torso, { pal: pal(CH.top), trim: 0x1c1c22 });
        belt(C, torso, { pal: pal(CH.accent === 0x111111 ? 0x1c1c22 : CH.accent), sx: 1.12 });
        for (const s of [-1, 1]) { const t = cloth({ w0: 0.06, w1: 0.07, h: 0.42, folds: 1, fold: 0.01, face: 1, pal: pal(0x1c1c22), nu: 3, nv: 6 }); C.put(t, C.mP, s * 0.04, 0.1, 0.15, torso).rotation.z = s * 0.15; }
        for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; const b = C.put(gemGeo(), C.mP, Math.sin(a) * 0.11, 0.5 - (1 - Math.cos(a)) * 0.08, 0.13 + Math.cos(a) * 0.03, torso); b.scale.setScalar(0.75); }
        pauldron(C, shL, { pal: METAL.bronze(), trim: GOLD, s: 1.05, lames: 1 });
        for (const el of [elL, elR]) bandage(C, el, 6);
        break;
      }
      case "god": { // 금빛 판금 + 흰 로브 + 큰 망토
        pauldron(C, shL, { pal: GOLD, trim: METAL.silver(), s: 1.45, lames: 3, ridge: 1 }); pauldron(C, shR, { pal: GOLD, trim: METAL.silver(), s: 1.45, lames: 3, ridge: 1 });
        chestPlate(C, torso, { pal: GOLD }); chestPlate(C, torso, { pal: GOLD, back: 1 });
        gem(torso, 0, 0.45, 0.19, 1.6, 0xffe08a);
        robe(C, torso, { pal: pal(0xf4ecd8), h: 0.82, flare: 0.2, folds: 10, trim: 0xd8a83a });
        belt(C, torso, { pal: GOLD });
        faulds(C, torso, { pal: GOLD, trim: METAL.silver(), point: 1 });
        for (const el of [elL, elR]) { vambrace(C, el, { pal: GOLD, trim: METAL.silver(), ridge: 1, side: el === elL ? -1 : 1 }); gauntlet(C, el, GOLD, METAL.silver()); }
        for (const kn of [knL, knR]) greave(C, kn, { pal: GOLD, trim: METAL.silver(), wing: 1 });
        cape(C, torso, ud, { pal: pal(0xf4ecd8), trim: 0xd8a83a, w0: 0.5, w1: 0.9, h: 1.05, trimSide: 1 });
        break;
      }
      default: return false;
    }
    return true;
  }

  // ---------- 머리 장비 ----------
  function headGear(CH, C) {
    const M = (METAL[CH.metal] || METAL.steel)(), T = CH.metal === "gold" ? METAL.silver() : CH.kit === "juggernaut" ? pal(CH.accent, CH.accent, 0.8) : METAL.gold();
    if (CH.head === "helm" || CH.head === "horned") {
      helm(C, C.head, { pal: M, trim: T, crest: CH.head === "helm" && CH.kit === "guard", breath: CH.kit === "juggernaut" });
      if (CH.head === "horned" || CH.kit === "juggernaut") for (const s of [-1, 1]) { // 휘어 솟은 뿔
        const hn = C.put(blade(0.34, (u) => 0.05 * (1 - u), { th: 0.07, pal: pal(0xe8dcc0, 0xffffff), cv: (u) => 0.1 * u * u, n: 10, bev: 0.02 }), C.mP, s * 0.2, 0.12, 0.0, C.head);
        hn.rotation.set(0, s > 0 ? 0 : Math.PI, -s * 1.0);
      }
      return true;
    }
    return false;
  }
  // ---------- 무기 ----------
  // C: { holder(hand, rx, idle, atk), L, R, mk, ud, CH }
  function weapon(CH, C) {
    const { holder, L, R } = C, M = (METAL[CH.metal] || METAL.steel)(), GOLD = METAL.gold(), SIL = METAL.silver(), W = pal(0x5a3a24, 0x9a7050), LE = pal(0x2e2018, 0x6a4a34);
    const glow = (hex, k = 1.6) => C.mk(hex, 0.2, { emissive: lin(hex), emissiveIntensity: k });
    const add = (w, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, mat = C.mP) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; w.add(m); return m; };
    const rod = (len, r, P, y0 = 0) => lathe([[r * 0.9, y0 + len], [r, y0 + len * 0.98], [r, y0], [r * 0.9, y0 - 0.005]], { seg: 8, pal: P, col: (a, j) => mul(P.c, 0.7 + 0.45 * Math.max(0, Math.cos(a - 0.5))) });
    const grip = (w, len = 0.17) => { add(w, rod(len, 0.022, LE, -len / 2)); for (let i = 0; i < 4; i++) add(w, lathe([[0.025, 0.006], [0.025, -0.006]], { seg: 8, pal: LE, col: () => LE.e }), 0, -len / 2 + 0.02 + i * 0.04, 0, 0, 0, 0.3); };
    const pommel = (w, y, P = GOLD) => add(w, lathe([[0, 0.03], [0.026, 0.02], [0.03, 0], [0.02, -0.025], [0, -0.03]], { seg: 10, pal: P }), 0, y, 0);
    const cross = (w, y, wd = 0.2, P = GOLD) => add(w, blade(wd, (u) => 0.022 * (1 - Math.abs(u - 0.5) * 0.9), { th: 0.03, pal: P, cv: (u) => 0, n: 6 }), wd / 2, y, 0, 0, 0, Math.PI / 2);
    const swordBlade = (len, wd, P = SIL, o = {}) => blade(len, (u) => wd * (u < 0.8 ? 1 - u * 0.15 : (1 - u) / 0.2 * 0.85), { th: 0.016, pal: P, ridge: 0.008, n: 10, ...o });
    const edgeGlow = (w, len, hex, cv, y0, side = 1, wd = 0.006) => add(w, blade(len, () => wd, { th: 0.004, pal: pal(hex), cv: (u) => (cv ? cv(u) : 0), n: 10 }), 0, y0, 0, 0, 0, 0, glow(hex, 1.8));
    switch (CH.weapon) {
      case "sword": { const w = holder(R); grip(w); pommel(w, -0.11); cross(w, 0.09, 0.24); add(w, swordBlade(0.78, 0.042), 0, 0.1, 0); break; }
      case "blades": { // 한쪽 날의 휜 칼 두 자루, 날 끝을 따라 붉은 빛
        for (const hand of [R, L]) {
          const w = holder(hand); grip(w, 0.15); pommel(w, -0.1, M);
          add(w, lathe([[0.04, 0.012], [0.045, 0], [0.04, -0.012]], { seg: 10, pal: GOLD, sz: 0.6 }), 0, 0.085, 0);
          const cv = (u) => -0.14 * u * u, hw = (u) => 0.042 * (u < 0.82 ? 1 - u * 0.2 : (1 - u) / 0.18 * 0.84);
          add(w, blade(0.8, hw, { th: 0.014, pal: SIL, cv, back: (u) => 0.014 * (u < 0.82 ? 1 : (1 - u) / 0.18), n: 14 }), 0, 0.09, 0);
          add(w, blade(0.68, (u) => 0.008 * (1 - u * 0.7), { th: 0.016, pal: pal(CH.accent), cv: (u) => cv(u * 0.85) + hw(u * 0.85) - 0.006, n: 12 }), 0, 0.09, 0, 0, 0, 0, glow(CH.accent, 2.2));
        }
        break;
      }
      case "greataxe": { // 긴 자루 + 양날 초승달 도끼 + 꼭대기 창날 + 붉은 룬 줄
        const w = holder(R, Math.PI / 2 - 0.6);
        add(w, rod(1.25, 0.026, W, -0.35)); for (let i = 0; i < 3; i++) add(w, lathe([[0.03, 0.01], [0.03, -0.01]], { seg: 8, pal: M, col: () => M.e }), 0, -0.3 + i * 0.05, 0);
        for (const s of [-1, 1]) {
          const L2 = [], R2 = [], n = 12;
          for (let i = 0; i <= n; i++) { const t = i / n, a = -1.15 + 2.3 * t, outer = 0.3, inner = 0.12; R2.push([s * (0.02 + Math.cos(a) * outer * 0.95), 0.72 + Math.sin(a) * outer]); L2.push([s * (0.02 + Math.cos(a) * inner * 0.55), 0.72 + Math.sin(a) * inner * 0.9]); }
          const geo = slab(s > 0 ? L2 : R2, s > 0 ? R2 : L2, 0.03, { pal: METAL.steel(), edgeCol: lc(0xf4f8ff), kc: (u) => 0.75 + 0.45 * u });
          add(w, geo);
          add(w, blade(0.5, () => 0.006, { th: 0.034, pal: pal(CH.accent), n: 8, cv: (u) => s * 0.09 }), 0, 0.5, 0, 0, 0, 0, glow(CH.accent, 1.8)).scale.set(1, 0.85, 1);
        }
        add(w, swordBlade(0.22, 0.03, M), 0, 0.88, 0);
        add(w, lathe([[0, 0.05], [0.05, 0.03], [0.055, 0], [0.05, -0.03], [0, -0.05]], { seg: 10, pal: M }), 0, 0.72, 0, 0, 0, 0, glow(CH.accent, 1.4)).scale.set(0.8, 0.8, 1.2);
        break;
      }
      case "hammer": { // 팔각 망치 머리 + 금 테 + 번개 문양
        const w = holder(R, Math.PI / 2 - 0.6);
        add(w, rod(1.1, 0.026, W, -0.3));
        const head = lathe([[0.1, 0.22], [0.13, 0.2], [0.13, 0.13], [0.115, 0.1], [0.115, -0.1], [0.13, -0.13], [0.13, -0.2], [0.1, -0.22], [0, -0.22]], { seg: 8, pal: M, col: (a, j) => (j === 1 || j === 2 || j === 5 || j === 6 ? GOLD.c : mul(M.c, 0.75 + 0.4 * Math.max(0, Math.cos(a - 0.4)))) });
        add(w, head, 0, 0.8, 0, Math.PI / 2, 0, 0);
        for (const s of [-1, 1]) add(w, lathe([[0, 0.02], [0.06, 0.015], [0.065, 0], [0, 0]], { seg: 6, pal: pal(CH.accent) }), 0, 0.8, s * 0.225, s * Math.PI / 2, 0, 0, glow(CH.accent, 1.6));
        add(w, lathe([[0, 0.16], [0.03, 0.08], [0.045, 0.0], [0, 0]], { seg: 8, pal: GOLD }), 0, 0.93, 0);
        break;
      }
      case "bow": { // 겹쳐 휜 활: 활대를 판으로 만들고 끝을 뒤로 젖힘
        const w = holder(L, 0.15, "up", "up"), bw = new THREE.Group(); bw.position.z = -0.4; w.add(bw);
        const limb = (s) => { const Lp = [], Rp = []; const n = 12; for (let i = 0; i <= n; i++) { const t = i / n, y = s * (0.05 + t * 0.5), z = 0.4 - 0.32 * t * t + (t > 0.85 ? -0.12 * (t - 0.85) / 0.15 : 0), wd = 0.03 * (1 - t * 0.6); Lp.push([z - wd, y]); Rp.push([z + wd, y]); } return s > 0 ? slab(Lp, Rp, 0.025, { pal: W, edgeCol: GOLD.e }) : slab(Rp.map(([x, y]) => [x, y]), Lp, 0.025, { pal: W, edgeCol: GOLD.e }); };
        for (const s of [-1, 1]) add(bw, limb(s), 0, 0, 0, 0, -Math.PI / 2, 0);
        add(bw, lathe([[0.003, 0.56], [0.003, -0.56]], { seg: 4, pal: pal(0xe8e8f0) }), 0, 0, 0.08, 0, 0, 0, glow(CH.accent, 1.2));
        add(w, rod(0.14, 0.03, LE, -0.07));
        break;
      }
      case "crossbow": {
        const w = holder(R, Math.PI / 2 - 0.2, null, "fwd");
        add(w, plate(0.07, 0.42, { th: 0.06, pal: W, ch: 0.02 }), 0, 0.14, 0);
        add(w, plate(0.04, 0.38, { th: 0.03, pal: M }), 0, 0.2, 0.045);
        for (const s of [-1, 1]) add(w, blade(0.26, (u) => 0.018 * (1 - u * 0.5), { th: 0.02, pal: M, cv: (u) => -0.06 * u * u, n: 8 }), 0, 0.32, 0.02, 0, 0, s * (Math.PI / 2 - 0.25));
        add(w, lathe([[0.003, 0.25], [0.003, -0.25]], { seg: 4, pal: pal(0xe8e8f0) }), 0, 0.29, 0.03, 0, 0, Math.PI / 2, glow(CH.accent, 1.4));
        add(w, gemGeo(), 0, 0.3, 0.07, 0, 0, 0, glow(CH.accent, 1.8));
        break;
      }
      case "rifle": {
        const w = holder(R, Math.PI / 2 - 0.15, null, "fwd");
        add(w, plate(0.07, 0.36, { th: 0.07, pal: pal(0x22242c), ch: 0.025 }), 0, -0.04, 0);
        add(w, lathe([[0.022, 0.92], [0.03, 0.88], [0.03, 0.8], [0.026, 0.78], [0.028, 0.2], [0.034, 0.15]], { seg: 10, pal: M }), 0, 0, 0.02);
        add(w, lathe([[0.03, 0.12], [0.032, 0.1], [0.032, -0.1], [0.03, -0.12]], { seg: 10, pal: M }), 0, 0.3, 0.085);
        add(w, lathe([[0, 0.05], [0.03, 0], [0, -0.05]], { seg: 8, pal: pal(CH.accent) }), 0, 0.36, 0.02, 0, 0, 0, glow(CH.accent, 1.8));
        add(w, blade(0.5, () => 0.004, { th: 0.064, pal: pal(CH.accent), n: 4 }), 0, 0.28, 0.0, 0, 0, 0, glow(CH.accent, 1.6));
        break;
      }
      case "tome": {
        const w = holder(L, 0.2);
        add(w, plate(0.26, 0.32, { th: 0.075, pal: pal(CH.top), ch: 0.03, edgeCol: GOLD.e }), 0, 0.02, 0.06, -0.3);
        for (const s of [-1, 1]) for (const t of [-1, 1]) add(w, plate(0.05, 0.05, { th: 0.08, pal: GOLD, point: 0 }), s * 0.11, 0.02 + t * 0.14, 0.06, -0.3);
        add(w, lathe([[0, 0.012], [0.07, 0.008], [0.075, 0], [0, -0.004]], { seg: 6, pal: pal(CH.accent) }), 0, 0.03, 0.105, Math.PI / 2 - 0.3, 0, 0, glow(CH.accent, 1.6));
        break;
      }
      case "mawshield": { // 김현우 '한입에 꿀꺽': 오른손엔 큰 포크, 왼손엔 이빨 달린 입이 그려진 방패
        const ws = holder(R); add(ws, rod(0.55, 0.018, SIL, -0.18));
        add(ws, plate(0.12, 0.05, { th: 0.022, pal: SIL }), 0, 0.38, 0);
        for (const x of [-0.042, 0, 0.042]) add(ws, blade(0.2, () => 0.009, { th: 0.014, pal: SIL, n: 4 }), x, 0.4, 0);
        const w = holder(L, 0.05);
        const Lp = [], Rp = []; for (let i = 0; i <= 10; i++) { const t = i / 10, y = -0.34 + t * 0.66, hw = t < 0.35 ? 0.24 * Math.sin((t / 0.35) * Math.PI / 2) : 0.24 - 0.02 * (t - 0.35); Lp.push([-hw, y]); Rp.push([hw, y]); }
        add(w, slab(Lp, Rp, 0.04, { pal: pal(CH.top), edgeCol: lc(CH.accent), bev: 0.03, ridge: 0.03, warp: bendX(0.4) }), -0.1, 0.05, 0.08, 0, Math.PI / 2 - 0.2, 0);
        const f = new THREE.Group(); f.position.set(-0.155, 0.0, 0.07); f.rotation.y = -Math.PI / 2 - 0.2; f.scale.setScalar(1.3); w.add(f);
        add(f, plate(0.3, 0.12, { th: 0.02, pal: pal(0xa0141e), ch: 0.045 }), 0, 0, 0);
        for (let i = 0; i < 6; i++) { const x = -0.12 + i * 0.048;
          add(f, blade(0.065, (u) => 0.022 * (1 - u), { th: 0.014, pal: pal(0xf4f0e6), n: 3 }), x, 0.06, 0.012, 0, 0, Math.PI);
          if (i < 5) add(f, blade(0.055, (u) => 0.02 * (1 - u), { th: 0.014, pal: pal(0xf4f0e6), n: 3 }), x + 0.024, -0.06, 0.012); }
        for (const x of [-0.08, 0.08]) add(f, gemGeo(), x, 0.15, 0.01, 0, 0, 0, glow(CH.accent, 2)).scale.setScalar(1.3);
        break;
      }
      case "pizzabox": { // 왼손엔 피자 상자(빨간 피자 그림), 오른손엔 피자 한 조각
        const w = holder(L, 0.2);
        add(w, plate(0.34, 0.34, { th: 0.07, pal: pal(0xd9a86a), ch: 0.015, edgeCol: lc(0xb07a3a) }), 0, 0.02, 0.06, -0.3);
        add(w, lathe([[0, 0.012], [0.1, 0.008], [0.105, 0], [0, -0.004]], { seg: 16, pal: pal(0xc8322a) }), 0, 0.03, 0.1, Math.PI / 2 - 0.3);
        add(w, slab([[0, -0.05], [-0.045, 0.05]], [[0, -0.05], [0.045, 0.05]], 0.01, { pal: pal(0xf0b030) }), 0, 0.03, 0.112, -0.3);
        const ws = holder(R, 0.3), sl = [], sr = [];
        for (let i = 0; i <= 6; i++) { const t = i / 6; sl.push([-0.11 * t, -0.04 + 0.24 * t]); sr.push([0.11 * t, -0.04 + 0.24 * t]); }
        add(ws, slab(sl, sr, 0.025, { pal: pal(0xf0a830), edgeCol: lc(0xc8843a) }), 0, 0.06, 0.03, -0.2);
        add(ws, plate(0.24, 0.035, { th: 0.04, pal: pal(0xc8843a) }), 0, 0.27, 0.03, -0.2);
        for (const [x, y] of [[0, 0.1], [-0.04, 0.18], [0.045, 0.17]]) add(ws, lathe([[0, 0.006], [0.022, 0.004], [0.022, -0.004], [0, -0.006]], { seg: 10, pal: pal(0xc8322a) }), x, y, 0.05, Math.PI / 2 - 0.2);
        break;
      }
      case "shield": {
        const ws = holder(R); grip(ws); pommel(ws, -0.11); cross(ws, 0.09, 0.22); add(ws, swordBlade(0.66, 0.04), 0, 0.1, 0);
        const w = holder(L, 0.05);
        const Lp = [], Rp = []; for (let i = 0; i <= 10; i++) { const t = i / 10, y = -0.34 + t * 0.66, hw = t < 0.35 ? 0.24 * Math.sin((t / 0.35) * Math.PI / 2) : 0.24 - 0.02 * (t - 0.35); Lp.push([-hw, y]); Rp.push([hw, y]); }
        const sh = add(w, slab(Lp, Rp, 0.04, { pal: pal(CH.top), edgeCol: GOLD.c, bev: 0.03, ridge: 0.03, warp: bendX(0.4) }), -0.1, 0.05, 0.08, 0, Math.PI / 2 - 0.2, 0);
        add(w, lathe([[0, 0.03], [0.06, 0.02], [0.08, 0], [0, 0]], { seg: 8, pal: GOLD }), -0.15, 0.08, 0.06, 0, 0, Math.PI / 2);
        add(w, gemGeo(), -0.17, 0.08, 0.055, 0, 0, Math.PI / 2, glow(CH.accent, 1.8)).scale.setScalar(1.6);
        break;
      }
      case "bo": { const w = holder(R, Math.PI / 2 - 0.9); add(w, rod(1.6, 0.024, pal(0x6a4a2a), -0.65)); for (const y of [-0.62, 0.86]) add(w, lathe([[0.03, 0.08], [0.033, 0.06], [0.033, -0.06], [0.03, -0.08]], { seg: 8, pal: M }), 0, y, 0); for (const y of [-0.2, 0.4]) add(w, lathe([[0.028, 0.03], [0.028, -0.03]], { seg: 8, pal: pal(0xc83030) }), 0, y, 0); break; }
      case "quill": { const w = holder(R); add(w, rod(0.6, 0.012, pal(0xf2ead8), -0.1)); add(w, blade(0.5, (u) => 0.06 * Math.sin(Math.PI * Math.min(1, u * 1.1)), { th: 0.01, pal: pal(CH.accent), cv: (u) => 0.03 * u, back: (u) => 0.025 * Math.sin(Math.PI * u), n: 10 }), 0, 0.12, 0); add(w, lathe([[0, 0.0], [0.012, -0.06], [0, -0.12]], { seg: 6, pal: pal(0xe8d0ff) }), 0, -0.1, 0, 0, 0, 0, glow(0xe8d0ff, 1.8)); break; }
      case "gauntlets": for (const hand of [L, R]) {
        const w = holder(hand, 0);
        add(w, lathe([[0, 0.13], [0.07, 0.12], [0.11, 0.07], [0.12, 0.0], [0.11, -0.06], [0.08, -0.1], [0.06, -0.12]], { seg: 14, sx: 1.0, sz: 1.2, pal: M }), 0, 0.02, 0);
        for (let i = 0; i < 4; i++) { const k = add(w, plate(0.045, 0.05, { th: 0.03, pal: M, edgeCol: pal(CH.accent).e }), (i - 1.5) * 0.05, 0.1, 0.09, -0.4); }
        for (let i = 0; i < 3; i++) add(w, lathe([[0, 0.09], [0.02, 0.04], [0.026, 0], [0, 0]], { seg: 6, pal: SIL }), (i - 1) * 0.06, 0.06, 0.12, Math.PI / 2 - 0.2);
        add(w, gemGeo(), 0, 0.03, -0.12, 0, 0, 0, glow(CH.accent, 1.8)).scale.setScalar(1.4);
      } break;
      case "horn": { const w = holder(L, 0.6); add(w, lathe([[0.09, 0.24], [0.075, 0.2], [0.04, 0.08], [0.025, -0.05], [0.02, -0.12]], { seg: 14, pal: pal(0xe8dcc0), col: (a, j) => (j === 0 || j === 2 ? GOLD.c : mul(lc(0xe8dcc0), 0.7 + 0.4 * Math.max(0, Math.cos(a)))) }), 0, 0.12, 0.05, 0, 0, Math.PI); const ws = holder(R); grip(ws, 0.13); cross(ws, 0.07, 0.17); add(ws, swordBlade(0.5, 0.034), 0, 0.08, 0); break; }
      case "astrolabe": { const w = holder(R, Math.PI / 2 - 0.85, "up", "up"); add(w, rod(1.3, 0.022, W, -0.33)); const top = 0.97; const r1 = add(w, new THREE.TorusGeometry(0.15, 0.012, 6, 32), 0, top + 0.06, 0, 0, 0, 0, C.mk(0xd8b45a, 0.3)); const r2 = add(w, new THREE.TorusGeometry(0.12, 0.012, 6, 32), 0, top + 0.06, 0, 0, Math.PI / 2, 0, C.mk(0xd8b45a, 0.3)); add(w, new THREE.SphereGeometry(0.06, 14, 10), 0, top + 0.06, 0, 0, 0, 0, glow(CH.accent)); for (const s of [-1, 1]) add(w, blade(0.18, (u) => 0.02 * (1 - u), { th: 0.012, pal: GOLD, cv: (u) => s * 0.08 * u, n: 6 }), 0, top - 0.12, 0); r1.userData.keep = r2.userData.keep = true; C.ud.spin = [r1, r2]; break; }
      case "abyssorb": { const w = holder(R, 0); add(w, new THREE.SphereGeometry(0.1, 16, 12), 0, 0.1, 0.12, 0, 0, 0, C.mk(0x1a0a2a, 0.2, { emissive: lin(0x4a1a8a), emissiveIntensity: 1.2 })); for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; add(w, blade(0.14, (u) => 0.018 * (1 - u), { th: 0.01, pal: METAL.dark(), cv: (u) => 0.03 * u, n: 5 }), Math.cos(a) * 0.09, 0.02, 0.12 + Math.sin(a) * 0.09, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); } const r = add(w, new THREE.TorusGeometry(0.16, 0.008, 5, 28), 0, 0.1, 0.12, 1.2, 0, 0, glow(CH.accent)); r.userData.keep = true; C.ud.spin = [r]; break; }
      case "spear": if (C.ud.divine) { // 천벌의 창: 더 길고, 해 모양 날개 + 떠 있는 고리
        const w = holder(R, Math.PI / 2 - 0.85, "up", "fwd"), G2 = pal(0xd8a840, 0xfff4c0);
        add(w, rod(1.75, 0.026, pal(0xf6f0e2), -0.45));
        add(w, blade(0.52, (u) => 0.09 * Math.sin(Math.PI * Math.pow(u, 0.65)) * (1 - u * 0.25) + 0.012 * (1 - u), { th: 0.024, pal: G2, ridge: 0.016, n: 14 }), 0, 1.3, 0);
        for (const s of [-1, 1]) for (let i = 0; i < 3; i++) add(w, feather(0.26 - i * 0.05, 0.035, pal(0xf6f0e2), G2.e), s * 0.03, 1.24 - i * 0.05, 0, 0, s < 0 ? Math.PI : 0, -s * (0.9 + i * 0.35));
        add(w, lathe([[0.045, 0.06], [0.052, 0], [0.045, -0.06]], { seg: 10, pal: G2 }), 0, 1.27, 0);
        add(w, gemGeo(), 0, 1.27, 0.04, 0, 0, 0, glow(0xfff4c8, 2.2)).scale.setScalar(1.8);
        add(w, blade(0.42, () => 0.006, { th: 0.03, pal: pal(0xffd86b), n: 4 }), 0, 1.33, 0, 0, 0, 0, glow(0xffd86b, 2));
        const r = add(w, new THREE.TorusGeometry(0.16, 0.01, 6, 36), 0, 1.45, 0, Math.PI / 2, 0, 0, glow(0xffd86b, 1.6)); r.userData.keep = true; (C.ud.dspin || (C.ud.dspin = [])).push([r, 0]); C.ud.bob = r;
        break;
      } else { // 긴 자루 + 잎 모양 창날 + 양옆 날개
        const w = holder(R, Math.PI / 2 - 0.85, "up", "fwd");
        const P2 = CH.metal === "gold" ? GOLD : SIL;
        add(w, rod(1.5, 0.022, CH.metal === "gold" ? pal(0xf0e6d0) : W, -0.38));
        add(w, blade(0.36, (u) => 0.065 * Math.sin(Math.PI * Math.pow(u, 0.7)) * (1 - u * 0.2) + 0.012 * (1 - u), { th: 0.02, pal: P2, ridge: 0.012, n: 12 }), 0, 1.12, 0);
        for (const s of [-1, 1]) add(w, blade(0.16, (u) => 0.022 * (1 - u), { th: 0.014, pal: P2, cv: (u) => s * 0.09 * u, n: 6 }), s * 0.02, 1.08, 0, 0, 0, s * -0.6);
        add(w, lathe([[0.035, 0.05], [0.04, 0], [0.035, -0.05]], { seg: 8, pal: GOLD }), 0, 1.1, 0);
        add(w, gemGeo(), 0, 1.1, 0.03, 0, 0, 0, glow(CH.accent, 1.8)).scale.setScalar(1.3);
        add(w, blade(0.28, () => 0.005, { th: 0.026, pal: pal(CH.accent), n: 4 }), 0, 1.14, 0, 0, 0, 0, glow(CH.accent, 1.6));
        break;
      }
      case "crystalstaff": if (C.ud.divine) { // 마왕의 홀: 검은 자루 + 양쪽으로 휜 낫날 + 핏빛 수정 + 가시 고리
        const w = holder(R, Math.PI / 2 - 0.85, "up", "up"), OB = pal(0x231e26, 0xff4a3a), BL = pal(0x2a2630, 0xff5a48);
        add(w, rod(1.5, 0.026, pal(0x1c181e, 0x5a4a54), -0.38));
        for (let i = 0; i < 4; i++) add(w, lathe([[0.034, 0.02], [0.038, 0], [0.034, -0.02]], { seg: 8, pal: pal(0x6a1420, 0xff5a3a), col: () => lc(0xb01c28) }), 0, -0.2 + i * 0.35, 0);
        const top = 1.12;
        add(w, lathe([[0, 0.34], [0.04, 0.18], [0.055, 0.05], [0.045, 0.0], [0, -0.06]], { seg: 5, pal: pal(0xff3a3a) }), 0, top, 0, 0, 0, 0, glow(0xff2a3a, 1.6));
        for (const s of [-1, 1]) {
          add(w, blade(0.5, (u) => 0.05 * Math.sin(Math.PI * Math.min(1, u * 1.3 + 0.1)) * (1 - u * 0.4) + 0.006, { th: 0.022, pal: BL, edgeCol: lc(0xff5a48), cv: (u) => s * (0.34 * u - 0.12 * u * u), back: (u) => 0.012, n: 14 }), s * 0.03, top - 0.12, 0, 0, 0, -s * 0.35);
          add(w, blade(0.16, (u) => 0.02 * (1 - u), { th: 0.02, pal: OB, edgeCol: lc(0xff4a3a), cv: (u) => -s * 0.05 * u, n: 4 }), s * 0.02, top - 0.18, 0, 0, 0, s * 2.3);
        }
        const r1 = add(w, new THREE.TorusGeometry(0.2, 0.012, 6, 40), 0, top + 0.1, 0, Math.PI / 2 - 0.3, 0, 0, glow(0xff2a3a, 1.6)); r1.userData.keep = true;
        const r2 = add(w, new THREE.TorusGeometry(0.15, 0.008, 6, 36), 0, top + 0.1, 0, Math.PI / 2 + 0.4, 0, 0, glow(0xff9a5a, 1.6)); r2.userData.keep = true;
        (C.ud.dspin || (C.ud.dspin = [])).push([r1, 1.4], [r2, -1.8]);
        break;
      } else { const w = holder(R, Math.PI / 2 - 0.85, "up", "up"); add(w, rod(1.3, 0.022, W, -0.33)); const top = 0.97; for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; add(w, blade(0.22, (u) => 0.02 * (1 - u * 0.7), { th: 0.014, pal: M, cv: (u) => 0.05 * u * u, n: 6 }), Math.cos(a) * 0.03, top - 0.08, Math.sin(a) * 0.03, 0, -a, 0); } add(w, lathe([[0, 0.2], [0.05, 0.1], [0.055, 0.0], [0, -0.08]], { seg: 6, pal: pal(CH.accent) }), 0, top + 0.12, 0, 0, 0, 0, glow(CH.accent, 1.4)); break; }
      case "sunstaff": { const w = holder(R, Math.PI / 2 - 0.85, "up", "up"); add(w, rod(1.25, 0.022, pal(0xf0e6d0), -0.3)); const top = 0.95; add(w, new THREE.TorusGeometry(0.13, 0.014, 6, 32), 0, top + 0.08, 0, 0, 0, 0, C.mk(0xd8b45a, 0.3)); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; add(w, blade(0.1 + (i % 2) * 0.05, (u) => 0.02 * (1 - u), { th: 0.012, pal: GOLD, n: 4 }), Math.cos(a) * 0.14, top + 0.08 + Math.sin(a) * 0.14, 0, 0, 0, a - Math.PI / 2); } add(w, new THREE.SphereGeometry(0.075, 16, 12), 0, top + 0.08, 0, 0, 0, 0, glow(0xffe08a)); break; }
      default: return false;
    }
    return true;
  }
  return { slab, blade, plate, lathe, cloth, bendX, bendY, chain, pal, lc, METAL, armor, weapon, headGear, DIVINE };
})();
