// ============================================================
//  render3d.js — 3D 화면 (경기장 · 친구 캐릭터 모양 · 효과 · 카메라 · 조명)
// ============================================================
"use strict";
// =============== 3D 그리기 ===============
// 3D 장면(three.js) 위에 2D 캔버스를 겹쳐서 체력바·이름·숫자를 그려요
const gl = $("gl"), cv = $("cv"), ctx = cv.getContext("2d");
const HAS3D = typeof THREE !== "undefined";
let W = 0, H3 = 0, H = 0, ic = 0, itemY = 0;
const CX = 3.25 * SQ3, BENCH_Z = 7.7, SLOT_W = 13.2 / BENCH, BENCH_X0 = -6.6;
// FLIP: 온라인에서 내가 '원정' 쪽일 때 전투를 180도 돌려서 내 친구들이 항상 아래쪽에 보여요
let FLIP = false;
const worldX = (X) => (FLIP ? CX - X * SQ3 : X * SQ3 - CX), worldZ = (Y) => (FLIP ? 5.25 - Y * 1.5 : Y * 1.5 - 5.25);
const isFoe = (u) => u.team !== (FLIP ? 1 : 0);
const benchX = (i) => BENCH_X0 + SLOT_W * (i + 0.5);
const gridX = (r, c) => c + (r & 1) * 0.5;
let renderer, scene, camera, raycaster, pickPlane, carousel, camBase = null, chalk = null;
const tiles = [], pads = [], GEO = {}, PAPER = {}, TEXC = {};
const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
const SKINS = [0xe9c3a3, 0xdcb08c, 0xeecdb2, 0xd2a37e];
const HAIRC = [0x1c1612, 0x2a1d15, 0x3a291c, 0x141414, 0x4a3324];
const TRACK = [0x2f5fa8, 0x2f8a5a, 0x8a2f3a, 0x3d3d8a];
const COST_HEX = [0, 0xc9d1cc, 0x7fe0b0, 0x7fc4ff, 0xe39cff, 0xffcc4d];

function canvasTex(w, h, paint) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  paint(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.userData = { c, paint }; return t;
}
function repaint(t) { const { c, paint } = t.userData; paint(c.getContext("2d"), c.width, c.height); t.needsUpdate = true; }
const DF = () => TOK["--display"];
function paintChalk(g, w, h) {
  g.fillStyle = "#262a36"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 40 + Math.random() * 160, 10 + Math.random() * 30, Math.random(), 0, Math.PI * 2); g.fill(); }
  g.fillStyle = "rgba(170,236,255,.95)"; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `190px ${DF()}`; g.fillText("우리반 오토배틀", w / 2, h * 0.44);
  g.fillStyle = "rgba(245,215,110,.9)"; g.font = `70px ${DF()}`; g.fillText("오늘의 목표: 끝까지 살아남기!", w / 2, h * 0.78);
  g.textAlign = "right"; g.fillStyle = "rgba(240,244,232,.85)"; g.font = `58px ${DF()}`;
  { const d = new Date(); g.fillText(`${d.getMonth() + 1}월 ${d.getDate()}일 ${"일월화수목금토"[d.getDay()]}요일`, w - 70, 80); } g.fillText("주번: 정주환", w - 70, 160);
  g.textAlign = "left"; g.fillText("떠든 사람:", 70, 80);
}
function paperTex(name) {
  if (PAPER[name]) return PAPER[name];
  return (PAPER[name] = canvasTex(256, 320, (g, w, h) => {
    g.fillStyle = "#f7f4ea"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#b8c6d8"; g.lineWidth = 3;
    for (let y = 92; y < h; y += 30) { g.beginPath(); g.moveTo(20, y); g.lineTo(w - 20, y); g.stroke(); }
    g.fillStyle = "#24302a"; g.textAlign = "center"; g.font = `52px ${DF()}`; g.fillText(name, w / 2, 58);
    g.strokeStyle = "#e0453a"; g.lineWidth = 9; g.beginPath(); g.arc(w * 0.66, h * 0.68, 52, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "#e0453a"; g.font = `50px ${DF()}`; g.fillText("0점", w * 0.66, h * 0.71);
    g.strokeStyle = "rgba(224,69,58,.8)"; g.lineWidth = 6;
    for (const [x, y] of [[50, 120], [70, 180], [40, 240]]) { g.beginPath(); g.moveTo(x - 16, y - 16); g.lineTo(x + 16, y + 16); g.moveTo(x + 16, y - 16); g.lineTo(x - 16, y + 16); g.stroke(); }
  }));
}
function textTex(key, w, h, paint) { return TEXC[key] || (TEXC[key] = canvasTex(w, h, paint)); }
function M(hex, rough = 0.8, extra = {}) { return new THREE.MeshStandardMaterial({ color: lin(hex), roughness: rough, metalness: 0, ...extra }); }
function addBox(parent, w, h, d, mat, x, y, z, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true; parent.add(m); return m;
}
function noiseTex(size, base, specks, repeat) {
  const t = canvasTex(size, size, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (const [col, n, r0, r1] of specks) for (let i = 0; i < n; i++) {
      g.fillStyle = col; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, r0 + Math.random() * (r1 - r0), (r0 + Math.random() * (r1 - r0)) * 0.6, Math.random() * 3, 0, Math.PI * 2); g.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); return t;
}
let OUT = null, PLATFORM = null, SKY = null, BACKDROP = null;
// 배경 사진: 이 기기의 브라우저에만 저장돼요 (게임 파일에는 들어가지 않음)
function loadBackdrop() {
  let url = null; try { url = localStorage.getItem("uri-backdrop"); } catch (e) {}
  if (!url) return applyBackdrop(null);
  const img = new Image(); img.onload = () => applyBackdrop(img); img.onerror = () => applyBackdrop(null); img.src = url;
}
function applyBackdrop(img) {
  BACKDROP = img;
  const on = !!img;
  if (OUT) OUT.visible = !on;
  if (PLATFORM) PLATFORM.visible = on;
  if (pollen) pollen.visible = !on;
  scene.fog = on ? null : new THREE.Fog(lin(FOG_HEX), 40, 95);
  if (!on) { scene.background = SKY; return; }
  // 화면 비율에 맞게 가운데를 잘라서 꽉 채워요
  const cw = 1600, ch = Math.round(cw * (H || 800) / (W || 1200));
  const t = canvasTex(cw, ch, (g, w, h) => {
    const k = Math.max(w / img.width, h / img.height), dw = img.width * k, dh = img.height * k;
    g.fillStyle = "#000"; g.fillRect(0, 0, w, h); g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  });
  if (scene.background && scene.background !== SKY && scene.background.dispose) scene.background.dispose();
  scene.background = t;
}
function pickBackdrop(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      if (canShare()) { shareBackdrop(c); return; } // 모두에게 보이게 (photos.js)
      const url = c.toDataURL("image/jpeg", 0.85);
      try { localStorage.setItem("uri-backdrop", url); } catch (e) { toast("사진이 너무 커서 저장은 못 했어요. 이번 판에만 보여요"); }
      const im2 = new Image(); im2.onload = () => { applyBackdrop(im2); toast("배경 사진을 넣었어요"); }; im2.src = url;
    };
    img.src = r.result;
  };
  r.readAsDataURL(file);
}
// ----- 숲속 절벽 경기장 -----
const FOG_HEX = 0x241f42;
// 강: 경기장 왼쪽을 따라 굽이쳐 흘러요
const RIVER_HW = 1.45;
const riverX = (z) => -11.3 + Math.sin(z * 0.3 + 0.5);
const inRiver = (x, z, m = 0) => Math.abs(z) < 20.5 && Math.abs(x - riverX(z)) < RIVER_HW + m;
let WATER = null;
function riverRibbon(hw, y, mat, off = 0) {
  const pos = [], uv = [], idx = [], N = 72, z0 = -19.5, z1 = 19.5;
  for (let i = 0; i <= N; i++) {
    const z = z0 + ((z1 - z0) * i) / N, cx = riverX(z) + off;
    pos.push(cx - hw, y, z, cx + hw, y, z); uv.push(0, z / 5, 1, z / 5);
    if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; return m;
}
function buildWorld() {
  OUT = new THREE.Group(); scene.add(OUT);
  const R = Math.random;
  // 하늘: 별이 뜬 밤, 지평선 쪽은 보랏빛
  scene.background = canvasTex(1024, 1024, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "#070b22"); gr.addColorStop(0.42, "#16183e"); gr.addColorStop(0.74, "#3a2c5e"); gr.addColorStop(1, "#6a4a78");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 520; i++) { const y = Math.pow(R(), 1.6) * h * 0.8, a = 0.25 + R() * 0.7 * (1 - y / h); g.fillStyle = `rgba(${220 + R() * 35},${225 + R() * 30},255,${a})`; g.fillRect(R() * w, y, R() < 0.08 ? 2.4 : 1.3, R() < 0.08 ? 2.4 : 1.3); }
    const mx = w * 0.8, my = h * 0.16, glow = g.createRadialGradient(mx, my, 0, mx, my, 150);
    glow.addColorStop(0, "rgba(220,230,255,.55)"); glow.addColorStop(1, "rgba(220,230,255,0)"); g.fillStyle = glow; g.fillRect(0, 0, w, h);
    g.fillStyle = "#f2f4ff"; g.beginPath(); g.arc(mx, my, 34, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(170,180,215,.35)"; for (const [dx, dy, r] of [[-10, -6, 8], [9, 8, 6], [4, -14, 4]]) { g.beginPath(); g.arc(mx + dx, my + dy, r, 0, Math.PI * 2); g.fill(); }
  });
  scene.fog = new THREE.Fog(lin(FOG_HEX), 40, 95);
  // 떠 있는 섬: 짙은 숲 바닥
  const grass = noiseTex(512, "#22402f", [["rgba(14,34,26,.5)", 520, 3, 9], ["rgba(70,120,80,.22)", 380, 1, 5], ["rgba(50,40,90,.22)", 60, 12, 34], ["rgba(60,70,90,.2)", 40, 8, 24]], 10);
  const top = new THREE.Mesh(new THREE.CircleGeometry(24, 48), new THREE.MeshStandardMaterial({ map: grass, roughness: 0.95 }));
  top.rotation.x = -Math.PI / 2; top.position.y = 0.0; top.receiveShadow = true; OUT.add(top);
  const rockMat = new THREE.MeshStandardMaterial({ color: lin(0x4a4660), roughness: 0.95, flatShading: true });
  const cliff = new THREE.Mesh(new THREE.CylinderGeometry(24, 15, 10, 28, 3), rockMat);
  const cp = cliff.geometry.attributes.position;
  for (let i = 0; i < cp.count; i++) { const y = cp.getY(i); if (y < 4.9) { cp.setX(i, cp.getX(i) * (0.92 + R() * 0.16)); cp.setZ(i, cp.getZ(i) * (0.92 + R() * 0.16)); } }
  cliff.geometry.computeVertexNormals(); cliff.position.y = -5.02; OUT.add(cliff);
  // 강물과 강둑
  OUT.add(riverRibbon(RIVER_HW + 0.75, 0.02, new THREE.MeshStandardMaterial({ color: lin(0x3e3c4a), roughness: 1 })));
  const waterTex = canvasTex(128, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, "#5fc8e0"); gr.addColorStop(0.22, "#1f6a9a"); gr.addColorStop(0.5, "#123e70"); gr.addColorStop(0.78, "#1f6a9a"); gr.addColorStop(1, "#5fc8e0");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) {
      const x = 8 + R() * (w - 16), y = R() * h, rx = 1 + R() * 2.2, ry = 8 + R() * 22;
      g.fillStyle = `rgba(235,252,255,${0.1 + R() * 0.2})`;
      for (const dy of [-h, 0, h]) { g.beginPath(); g.ellipse(x, y + dy, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
    }
  });
  waterTex.wrapT = THREE.RepeatWrapping;
  const water = riverRibbon(RIVER_HW, 0.06, new THREE.MeshStandardMaterial({ map: waterTex, roughness: 0.16, metalness: 0.1, emissive: lin(0x1a6a9a), emissiveIntensity: 0.7 }));
  OUT.add(water); WATER = waterTex;
  // 경기장 바닥: 풀밭 가운데가 닳아서 흙이 드러난 모양
  // 경기장 바닥: 크기가 제각각인 판석, 틈새 이끼, 가운데 희미한 마법진
  const arena = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = "#23262f"; g.fillRect(0, 0, w, h);
    const slab = (x, y, sw, sh) => {
      const l = 82 + R() * 30, tint = R() * 10;
      g.fillStyle = `rgb(${l - 4 + tint},${l},${l + 10})`; g.fillRect(x + 3, y + 3, sw - 6, sh - 6);
      const gr = g.createLinearGradient(x, y, x, y + sh); gr.addColorStop(0, "rgba(255,255,255,.08)"); gr.addColorStop(1, "rgba(0,0,0,.18)"); g.fillStyle = gr; g.fillRect(x + 3, y + 3, sw - 6, sh - 6);
      for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(${R() < 0.5 ? "20,22,30" : "200,205,220"},${0.06 + R() * 0.06})`; g.beginPath(); g.ellipse(x + R() * sw, y + R() * sh, 6 + R() * 20, 4 + R() * 10, R() * 3, 0, Math.PI * 2); g.fill(); }
      if (R() < 0.35) { g.strokeStyle = "rgba(20,22,30,.5)"; g.lineWidth = 2; let cx2 = x + R() * sw, cy2 = y + R() * sh; g.beginPath(); g.moveTo(cx2, cy2); for (let k = 0; k < 4; k++) { cx2 += (R() - 0.5) * 50; cy2 += (R() - 0.5) * 40; g.lineTo(Math.max(x + 4, Math.min(x + sw - 4, cx2)), Math.max(y + 4, Math.min(y + sh - 4, cy2))); } g.stroke(); }
    };
    for (let y = 0; y < h; ) { const rh = 70 + Math.floor(R() * 4) * 18; for (let x = -R() * 80; x < w; ) { const sw = 80 + R() * 110; slab(x, y, sw, rh); x += sw; } y += rh; }
    // 틈새 이끼와 잡초
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${40 + R() * 30},${90 + R() * 40},${60 + R() * 20},${0.35 + R() * 0.3})`; g.beginPath(); g.ellipse(R() * w, R() * h, 2 + R() * 7, 1.5 + R() * 4, R() * 3, 0, Math.PI * 2); g.fill(); }
    // 가운데 마법진 (아주 희미하게)
    const cx = w / 2, cy = h * 0.47;
    g.strokeStyle = "rgba(120,220,255,.16)"; g.lineWidth = 6; for (const r of [150, 196]) { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); }
    g.lineWidth = 3; g.beginPath(); for (let i = 0; i <= 6; i++) { const a2 = (i / 6) * Math.PI * 2 - Math.PI / 2, a3 = ((i + 2) / 6) * Math.PI * 2 - Math.PI / 2; g.moveTo(cx + Math.cos(a2) * 150, cy + Math.sin(a2) * 150); g.lineTo(cx + Math.cos(a3) * 150, cy + Math.sin(a3) * 150); } g.stroke();
    g.fillStyle = "rgba(120,220,255,.16)"; g.font = "28px serif"; g.textAlign = "center"; g.textBaseline = "middle";
    for (let i = 0; i < 16; i++) { const a2 = (i / 16) * Math.PI * 2; g.save(); g.translate(cx + Math.cos(a2) * 173, cy + Math.sin(a2) * 173); g.rotate(a2 + Math.PI / 2); g.fillText("ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊ"[i], 0, 0); g.restore(); }
    // 가장자리로 갈수록 어둡게
    const vg = g.createRadialGradient(cx, cy, 200, cx, cy, 720); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(8,8,20,.45)"); g.fillStyle = vg; g.fillRect(0, 0, w, h);
  });
  const af = new THREE.Mesh(new THREE.PlaneGeometry(15.2, 16.8), new THREE.MeshStandardMaterial({ map: arena, roughness: 0.95 }));
  af.rotation.x = -Math.PI / 2; af.position.set(0, 0.16, 0.9); af.receiveShadow = true; scene.add(af);
  // 돌 재질
  const stoneTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#7e8090"; g.fillRect(0, 0, w, h);
    for (const [col, n, r0, r1] of [["rgba(96,84,66,.2)", 90, 4, 14], ["rgba(255,248,230,.25)", 70, 2, 9], ["rgba(60,52,42,.28)", 50, 1, 3], ["rgba(86,120,62,.2)", 14, 6, 16]]) for (let i = 0; i < n; i++) { g.fillStyle = col; g.beginPath(); g.ellipse(R() * w, R() * h, r0 + R() * (r1 - r0), (r0 + R() * (r1 - r0)) * 0.6, R() * 3, 0, Math.PI * 2); g.fill(); }
    const eg = (x0, y0, x1, y1, c0) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, c0); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h); };
    eg(0, 0, 26, 0, "rgba(40,32,24,.4)"); eg(w, 0, w - 26, 0, "rgba(40,32,24,.4)"); eg(0, h, 0, h - 30, "rgba(40,32,24,.5)"); eg(0, 0, 0, 22, "rgba(255,250,235,.35)");
    g.strokeStyle = "rgba(40,32,24,.35)"; g.lineWidth = 2; for (let i = 0; i < 3; i++) { let x = 30 + R() * (w - 60), y = 30 + R() * (h - 60); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (R() - 0.5) * 40; y += (R() - 0.3) * 30; g.lineTo(x, y); } g.stroke(); }
  });
  const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.92 });
  const stoneDark = new THREE.MeshStandardMaterial({ map: stoneTex, color: lin(0xa99c8c), roughness: 0.95 });
  const stoneFlat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.92, flatShading: true });
  const mauveMat = new THREE.MeshStandardMaterial({ color: lin(0x5c5272), roughness: 0.95, flatShading: true });
  const greyMat = new THREE.MeshStandardMaterial({ color: lin(0x6a6c78), roughness: 0.95, flatShading: true });
  // 바닥 받침(흙)
  const dirtTex = noiseTex(256, "#3a3a46", [["rgba(20,20,30,.3)", 120, 3, 10], ["rgba(120,125,150,.18)", 90, 2, 7]], 6);
  addBox(scene, 18.2, 0.16, 19.6, new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 1 }), 0, 0.07, 0.7, false);
  // 뒤쪽 돌담
  addBox(scene, 17.6, 0.5, 1.0, stoneDark, 0, 0.25, -8.0);
  for (let i = 0; i < 9; i++) {
    const bw = 17.6 / 9, b = addBox(scene, bw - 0.1, 0.2 + R() * 0.06, 1.16, stoneMat, -8.8 + bw * (i + 0.5), 0.6, -8.0);
    b.rotation.y = (R() - 0.5) * 0.03;
  }
  // 양옆 돌담과 둥근 돌 자리
  const seatGeo = new THREE.TorusGeometry(0.55, 0.17, 6, 12, Math.PI);
  for (const s of [-1, 1]) {
    addBox(scene, 0.9, 0.34, 16.9, stoneDark, s * 8.05, 0.17, 0.95);
    for (let i = 0; i < 12; i++) {
      const bl = 16.9 / 12, b = addBox(scene, 0.98, 0.14 + R() * 0.05, bl - 0.09, stoneMat, s * 8.05, 0.4, -7.5 + bl * (i + 0.5));
      b.rotation.y = (R() - 0.5) * 0.03;
    }
    for (const z of [-5.6, -2.7, 0.2, 3.1, 6.0]) {
      const g = new THREE.Group(); g.position.set(s * 7.72, 0.5, z); g.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2; scene.add(g);
      const arc = new THREE.Mesh(seatGeo, stoneFlat); arc.rotation.x = -Math.PI / 2; arc.castShadow = true; arc.receiveShadow = true; g.add(arc);
    }
  }
  // 앞쪽 낮은 돌 턱
  for (let i = 0; i < 11; i++) {
    const bw = 15.6 / 11, b = addBox(scene, bw - 0.08, 0.2 + R() * 0.05, 0.6, stoneMat, -7.8 + bw * (i + 0.5), 0.24, 9.65);
    b.rotation.y = (R() - 0.5) * 0.04;
  }
  // 모서리 기둥과 횃불
  TORCH.length = 0;
  const bowlMat = new THREE.MeshStandardMaterial({ color: lin(0x3a3028), roughness: 0.6, metalness: 0.4 });
  const pillar = (x, z, hgt) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
    addBox(g, 1.35, 0.5, 1.35, stoneDark, 0, 0.25, 0);
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.78, hgt, 4), stoneFlat);
    sh.rotation.y = Math.PI / 4; sh.position.y = 0.5 + hgt / 2; sh.castShadow = true; sh.receiveShadow = true; g.add(sh);
    addBox(g, 1.2, 0.2, 1.2, stoneMat, 0, 0.6 + hgt, 0);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.3, 0.3, 10), bowlMat); bowl.position.y = 0.85 + hgt; bowl.castShadow = true; g.add(bowl);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 10), new THREE.MeshBasicMaterial({ color: lin(0x3fb8ff), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    flame.position.y = 1.4 + hgt; g.add(flame);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 8), new THREE.MeshBasicMaterial({ color: lin(0xd8f8ff), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    inner.position.y = 1.3 + hgt; g.add(inner);
    const light = new THREE.PointLight(0x5fc8ff, 1.6, 10, 2); light.position.y = 1.6 + hgt; g.add(light);
    TORCH.push({ flame, inner, light });
    addTorchFx(g, 1.4 + hgt);
  };
  pillar(-8.4, -8.0, 1.7); pillar(8.4, -8.0, 1.7); pillar(-8.4, 9.6, 0.8); pillar(8.4, 9.6, 0.8);
  // 바위
  const stoneGeo = new THREE.DodecahedronGeometry(0.6, 0);
  const stone = (x, z, s, mat) => {
    const m = new THREE.Mesh(stoneGeo, mat); m.position.set(x, s * 0.16, z);
    m.scale.set(s * (0.8 + R() * 0.5), s * (0.55 + R() * 0.45), s * (0.8 + R() * 0.5));
    m.rotation.set(R(), R() * 3, R()); m.castShadow = true; m.receiveShadow = true; OUT.add(m);
  };
  for (const [x, z, s] of [[12, -11, 2.2], [14.6, -1, 1.8], [12.3, 10, 1.6], [17.5, 6.5, 2.4], [13.6, 4.4, 0.9], [18, -11, 2.6], [10.2, -5.5, 1.1], [15.5, -6.5, 1.3]]) stone(x, z, s, mauveMat);
  for (let z = -18; z <= 18; z += 2.4) {
    const side = R() < 0.5 ? -1 : 1;
    stone(riverX(z) + side * (RIVER_HW + 0.35 + R() * 0.3), z + R(), 0.5 + R() * 0.7, greyMat);
  }
  for (let i = 0; i < 18; i++) {
    const a = R() * Math.PI * 2, r = 17 + R() * 6, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!inRiver(x, z, 1)) stone(x, z, 0.6 + R() * 1.2, x > 0 ? mauveMat : greyMat);
  }
  // 나무: 왼쪽·뒤쪽은 짙은 침엽수 숲, 오른쪽은 분홍 꽃나무
  const leafP1 = new THREE.MeshStandardMaterial({ color: lin(0x1c3d36), roughness: 0.9, flatShading: true });
  const leafP2 = new THREE.MeshStandardMaterial({ color: lin(0x24493f), roughness: 0.9, flatShading: true });
  const leafP3 = new THREE.MeshStandardMaterial({ color: lin(0x34604f), roughness: 0.9, flatShading: true });
  const leafG = new THREE.MeshStandardMaterial({ color: lin(0x2e5a40), roughness: 0.9, flatShading: true });
  const leafA = new THREE.MeshStandardMaterial({ color: lin(0x5a3f7a), roughness: 0.9, flatShading: true });
  const leafK1 = new THREE.MeshStandardMaterial({ color: lin(0x3a8aa8), roughness: 0.8, flatShading: true, emissive: lin(0x0e4a6a), emissiveIntensity: 0.8 });
  const leafK2 = new THREE.MeshStandardMaterial({ color: lin(0x5a5aa8), roughness: 0.8, flatShading: true, emissive: lin(0x24206a), emissiveIntensity: 0.8 });
  const bark = new THREE.MeshStandardMaterial({ color: lin(0x3a2c2a), roughness: 0.9 });
  const pine = (x, z, s, mat) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); g.rotation.y = R() * 3; OUT.add(g); FXD.sway.push(g);
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.25, 1.2, 7), bark); tr.position.y = 0.6; tr.castShadow = true; g.add(tr);
    for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(1.35 - i * 0.28, 1.5, 8), i === 3 ? leafP3 : mat); c.rotation.y = i * 0.5; c.position.y = 1.4 + i * 0.78; c.castShadow = true; g.add(c); }
  };
  const round = (x, z, s, mat) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); g.rotation.y = R() * 3; OUT.add(g); FXD.sway.push(g);
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.4, 7), bark); tr.position.y = 0.7; tr.castShadow = true; g.add(tr);
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.92 - i * 0.1, 1), mat); b.position.set((i - 1.5) * 0.42, 1.9 + (i % 2) * 0.45, ((i * 7) % 3 - 1) * 0.3); b.castShadow = true; g.add(b); }
  };
  const bush = (x, z, s, mat) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); OUT.add(g);
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5 - i * 0.08, 1), mat); b.position.set((i - 1) * 0.45, 0.3, (i % 2) * 0.25); b.castShadow = true; g.add(b); }
  };
  const LEFT = [[-15.5, -12], [-16, -7], [-15, -2.5], [-16.5, 2], [-15.2, 6.5], [-16.8, 10.5], [-18.5, -9.5], [-19, -4], [-19.5, 1], [-19, 6], [-18, 13], [-21.5, -1.5], [-15, 14.5], [-9.6, 12.5]];
  const BACK = [[-8.6, -11.4], [-5.6, -11.8], [-2.4, -12.8], [1.2, -11.6], [4.6, -12.9], [8, -11.7], [-7.5, -15.5], [-3, -16.8], [2, -15.8], [6.5, -16.4], [10.8, -15.2], [-1, -20.5], [4, -20], [-6, -20.2], [-12, -17.5]];
  const RIGHT = [[12.6, -7], [11.6, -3.2], [14.2, 1.6], [12.0, 6.6], [13.2, 9.4], [10.9, 12.2], [15.4, -9.5], [16.4, -3.6], [16.6, 2.8], [15.8, 10], [14, 13.6], [19.2, -6], [19.8, 0.4], [19.2, 5.4], [12.6, -14], [16, -13.4]];
  LEFT.forEach(([x, z], i) => { if (inRiver(x, z, 1.2)) return; const s = 1 + R() * 0.7; if (i % 4 === 3) round(x, z, s * 1.1, leafG); else pine(x, z, s * 1.15, i % 2 ? leafP1 : leafP2); });
  BACK.forEach(([x, z], i) => { if (inRiver(x, z, 1.2)) return; const s = 1 + R() * 0.7; if (i % 3 === 1) round(x, z, s * 1.1, i % 2 ? leafG : leafA); else pine(x, z, s * 1.2, i % 2 ? leafP1 : leafP2); });
  RIGHT.forEach(([x, z], i) => { const s = 0.95 + R() * 0.6; if (i % 5 === 4) pine(x, z, s * 1.1, leafP2); else round(x, z, s * 1.1, i % 3 === 2 ? leafG : i % 2 ? leafK1 : leafK2); });
  for (const [x, z, s] of [[-9.25, -9.6, 1], [11.6, -9.4, 1.1], [9.7, 5.6, 0.9], [9.8, -4.4, 1], [-9.3, 10.9, 0.9], [9.5, 10.8, 1], [-3.5, -9.8, 0.9], [4.2, -9.9, 1]]) {
    if (!inRiver(x, z, 0.6)) bush(x, z, s, x > 0 ? (z > 0 ? leafK2 : leafG) : leafP2);
  }
  // 멀리 떠 있는 작은 섬들
  for (const [x, y, z, s] of [[-34, -2, -30, 1.6], [30, 3, -36, 2.2], [-40, 6, 8, 1.3], [38, -4, 2, 1.5]]) {
    const isl = new THREE.Group(); isl.position.set(x, y, z); isl.scale.setScalar(s); OUT.add(isl);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(3, 0.5, 4, 9), rockMat); t.position.y = -2; isl.add(t);
    const gtop = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 0.3, 9), leafG); isl.add(gtop);
    const tr = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 1), x > 0 ? leafK1 : leafP1); tr.position.y = 1.4; isl.add(tr);
  }
}
const TORCH = [];
function buildArena() {
  // 육각 칸: 얇은 선과 옅은 칠
  const fillGeo = new THREE.CircleGeometry(0.9, 6, Math.PI / 2);
  const ringPts = []; for (let i = 0; i <= 6; i++) { const a = Math.PI / 2 + (i / 6) * Math.PI * 2; ringPts.push(new THREE.Vector3(Math.cos(a) * 0.9, Math.sin(a) * 0.9, 0)); }
  const lineGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
  for (let r = 0; r < ROWS; r++) {
    tiles[r] = [];
    for (let c = 0; c < COLS; c++) {
      const g = new THREE.Group(); g.rotation.x = -Math.PI / 2; g.position.set(worldX(gridX(r, c)), 0.18, worldZ(r));
      const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.04, depthWrite: false }));
      const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xfff1cc, transparent: true, opacity: 0.16 }));
      g.add(fill); g.add(line); scene.add(g);
      tiles[r][c] = { g, fill, line };
    }
  }
  // 대기석: 돌판
  const slabMat = new THREE.MeshStandardMaterial({ color: lin(0x5c6070), roughness: 0.9 });
  addBox(scene, 13.8, 0.26, 1.5, slabMat, 0, 0.06, BENCH_Z, false).receiveShadow = true;
  const slotGeo = new THREE.PlaneGeometry(SLOT_W - 0.18, 1.2);
  for (let i = 0; i < BENCH; i++) {
    const p = new THREE.Mesh(slotGeo, new THREE.MeshStandardMaterial({ color: lin(0x40444f), roughness: 0.9 })); p.rotation.x = -Math.PI / 2;
    p.position.set(benchX(i), 0.2, BENCH_Z); p.receiveShadow = true; scene.add(p); pads.push(p);
  }
  // 급식 줄 원판
  carousel = new THREE.Group(); scene.add(carousel);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(4.7, 4.9, 0.2, 64), new THREE.MeshStandardMaterial({ color: lin(0x5a5e6e), roughness: 0.85 }));
  disc.position.y = 0.2; disc.receiveShadow = true; carousel.add(disc);
  const rimT = new THREE.Mesh(new THREE.TorusGeometry(4.75, 0.14, 10, 64), new THREE.MeshStandardMaterial({ color: lin(0xd8b45a), roughness: 0.3, metalness: 0.8 }));
  rimT.rotation.x = Math.PI / 2; rimT.position.y = 0.32; carousel.add(rimT);
}
// ----- 내 마스코트(전술가) -----
let tact = null;
const TACT = { x: -6.2, z: 6.1, tx: -6.2, tz: 6.1, face: 0, walk: 0 };
function buildTactician() {
  const g = new THREE.Group(); g.rotation.order = "YXZ";
  const body = M(0xffd34d, 0.55), belly = M(0xfff1b8, 0.6), beak = M(0xff9a2a, 0.5), dark = M(0x1c1410, 0.3), white = M(0xffffff, 0.3);
  const put = (geo, mat, x, y, z, s) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (s) m.scale.set(...s); m.castShadow = true; g.add(m); return m; };
  put(new THREE.SphereGeometry(0.5, 24, 18), body, 0, 0.62, 0, [1, 0.95, 1]);
  put(new THREE.SphereGeometry(0.36, 20, 14), belly, 0, 0.55, 0.2, [1, 1, 0.7]);
  for (const s of [-1, 1]) {
    put(new THREE.SphereGeometry(0.08, 12, 10), white, s * 0.17, 0.82, 0.4, [1, 1.1, 0.6]);
    put(new THREE.SphereGeometry(0.05, 10, 8), dark, s * 0.17, 0.81, 0.44);
    const w = put(new THREE.SphereGeometry(0.2, 12, 10), body, s * 0.47, 0.6, 0, [0.35, 0.8, 0.7]); w.rotation.z = s * 0.4;
    put(new THREE.CylinderGeometry(0.04, 0.04, 0.2, 6), beak, s * 0.15, 0.12, 0.05);
    put(new THREE.BoxGeometry(0.16, 0.04, 0.2), beak, s * 0.15, 0.03, 0.1);
  }
  const bk = put(new THREE.ConeGeometry(0.08, 0.18, 8), beak, 0, 0.7, 0.5); bk.rotation.x = Math.PI / 2;
  put(new THREE.ConeGeometry(0.06, 0.18, 6), body, 0, 1.18, 0.05);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.66, 36), new THREE.MeshBasicMaterial({ color: lin(0xf0cf74), transparent: true, opacity: 0.85 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; g.add(ring);
  return g;
}
function moveTactician(p) {
  if (!p) return;
  const r = Math.hypot(p.x, p.z - 1);
  if (r > 18) return;
  TACT.tx = Math.max(-9.5, Math.min(9.5, p.x)); TACT.tz = Math.max(-8.5, Math.min(10.5, p.z));
}
function stepTactician(dt) {
  if (!tact) { tact = buildTactician(); scene.add(tact); }
  const dx = TACT.tx - TACT.x, dz = TACT.tz - TACT.z, d = Math.hypot(dx, dz);
  const sp = Math.min(d, dt * 4.5);
  if (d > 0.02) { TACT.x += (dx / d) * sp; TACT.z += (dz / d) * sp; TACT.face = Math.atan2(dx, dz); TACT.walk += dt * 14; }
  if (S.orbs && S.orbs.length) collectOrbs(false);
  const moving = d > 0.05 ? 1 : 0;
  tact.position.set(TACT.x, 0.17 + Math.abs(Math.sin(TACT.walk)) * 0.12 * moving + Math.sin(clock3d * 2) * 0.02, TACT.z);
  const cur = tact.rotation.y, df = ((((TACT.face) - cur) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  tact.rotation.y = cur + df * Math.min(1, dt * 8);
  tact.rotation.z = Math.sin(TACT.walk) * 0.12 * moving;
}
// ----- 상점 카드 그림: 친구 3D 캐릭터를 미리 찍어 둬요 -----
const PORTRAIT = {};
function makePortraits() {
  try {
    const cvs = document.createElement("canvas"); cvs.width = 240; cvs.height = 300;
    const r2 = new THREE.WebGLRenderer({ canvas: cvs, antialias: true, preserveDrawingBuffer: true });
    r2.outputEncoding = THREE.sRGBEncoding; r2.toneMapping = THREE.ACESFilmicToneMapping; r2.toneMappingExposure = 0.95;
    const sc = new THREE.Scene();
    if (THREE.RoomEnvironment) sc.environment = new THREE.PMREMGenerator(r2).fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    const key = new THREE.DirectionalLight(0xfff0d8, 1.6); key.position.set(-2, 3, 3); sc.add(key);
    const rim = new THREE.DirectionalLight(0x9fd0ff, 1.2); rim.position.set(2, 2, -3); sc.add(rim);
    sc.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.3));
    const cam = new THREE.PerspectiveCamera(26, 240 / 300, 0.1, 20);
    cam.position.set(0.38, 1.72, 2.0); cam.lookAt(0, 1.52, 0);
    const BG = { 1: ["#4a5560", "#20262b"], 2: ["#2f7a52", "#122a1e"], 3: ["#2f5f9a", "#121f33"], 4: ["#6a3a9a", "#1f1230"], 5: ["#b07a1e", "#2e1d06"] };
    DEFS.forEach((def, i) => {
      const [a, b] = BG[def.c];
      sc.background = canvasTex(8, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
      const unit = buildStudent(def, false); unit.children[0].visible = false; unit.rotation.y = 0.25;
      const tall = lookOf(def, nameHash(def.n)).tall, hy = 0.2 + 1.36 * tall;
      cam.position.set(0.4, hy + 0.2, 2.25); cam.lookAt(0, hy, 0);
      sc.add(unit); r2.render(sc, cam); PORTRAIT[i] = cvs.toDataURL("image/jpeg", 0.88); sc.remove(unit);
      unit.traverse((m) => { if (m.material) [].concat(m.material).forEach((x) => x.dispose()); });
    });
    r2.dispose(); if (r2.forceContextLoss) r2.forceContextLoss();
  } catch (e) { /* 그림 없이도 카드는 보여요 */ }
}
let composer = null, bloomPass = null, HQ = true, pollen = null;
try { HQ = localStorage.getItem("uri-hq") !== "0"; } catch (e) {}
const FINAL_SHADER = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, 1.2);
      c = toSRGB(clamp(c, 0.0, 1.0));
      c = (c - 0.5) * 1.06 + 0.5;
      c *= vec3(1.025, 1.0, 0.965);
      float l2 = dot(c, vec3(0.299, 0.587, 0.114));
      c += (1.0 - l2) * (1.0 - l2) * vec3(0.02, 0.0, 0.045);
      float v = smoothstep(0.9, 0.3, length((vUv - 0.5) * vec2(1.15, 1.0)));
      c *= mix(0.74, 1.0, v);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};
function setupPost() {
  if (!THREE.EffectComposer || !THREE.UnrealBloomPass || !THREE.ShaderPass) return;
  const opts = { format: THREE.RGBAFormat };
  const rt = renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget ? new THREE.WebGLMultisampleRenderTarget(16, 16, opts) : new THREE.WebGLRenderTarget(16, 16, opts);
  composer = new THREE.EffectComposer(renderer, rt);
  composer.addPass(new THREE.RenderPass(scene, camera));
  bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.45, 0.86);
  composer.addPass(bloomPass);
  composer.addPass(new THREE.ShaderPass(FINAL_SHADER));
}
function softTex(inner, outer) {
  return canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
}
function buildDecor() {
  // 풀 포기 (한 번에 그리는 인스턴스)
  const tuft = new THREE.ConeGeometry(0.05, 0.38, 3); tuft.translate(0, 0.19, 0);
  const N = HQ ? 7000 : 2500, grass = new THREE.InstancedMesh(tuft, new THREE.MeshStandardMaterial({ roughness: 0.9 }), N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
  let n = 0;
  while (n < N) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 23.5, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (inRiver(x, z, 0.6)) continue;
    const inArena = Math.abs(x) < 7.3 && z > -7.2 && z < 6.4;
    if (Math.abs(x) < 9.3 && z > -9.3 && z < 10.7 && !(inArena && Math.random() < 0.05)) continue;
    e.set((Math.random() - 0.5) * 0.5, Math.random() * 3, (Math.random() - 0.5) * 0.5); q.setFromEuler(e);
    const sc = 0.6 + Math.random() * 0.9;
    m4.compose(new THREE.Vector3(x, inArena ? 0.16 : 0, z), q, new THREE.Vector3(sc, sc * (0.7 + Math.random() * 0.8), sc));
    grass.setMatrixAt(n, m4);
    col.setHSL(0.36 + Math.random() * 0.08, 0.35 + Math.random() * 0.15, 0.14 + Math.random() * 0.1).convertSRGBToLinear();
    grass.setColorAt(n, col); n++;
  }
  grass.receiveShadow = true; OUT.add(grass);
  // 꽃
  const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({}), 500); // 밤에 빛나는 작은 버섯·꽃
  const FC = [0x7fe6ff, 0xb48aff, 0x8affc8, 0xdff6ff];
  for (let i = 0; i < 500; i++) {
    let x, z; do { const a = Math.random() * Math.PI * 2, r = 9 + Math.random() * 14; x = Math.cos(a) * r; z = Math.sin(a) * r; } while ((Math.abs(x) < 9.4 && z > -9.4 && z < 10.8) || inRiver(x, z, 0.6));
    m4.makeTranslation(x, 0.22 + Math.random() * 0.15, z); fl.setMatrixAt(i, m4); fl.setColorAt(i, col.setHex(rnd(FC)).convertSRGBToLinear());
  }
  OUT.add(fl);
  // 구름
  const cloudTex = softTex("rgba(255,255,255,.95)", "rgba(255,255,255,0)");
  for (let i = 0; i < 26; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: lin(i % 3 ? 0x4a4278 : 0x2e3a6a), transparent: true, opacity: 0.6, depthWrite: false }));
    const a = Math.random() * Math.PI * 2, r = 34 + Math.random() * 26;
    sp.position.set(Math.cos(a) * r, -10 + Math.random() * 14, Math.sin(a) * r - 6);
    const w = 14 + Math.random() * 18; sp.scale.set(w, w * 0.45, 1); OUT.add(sp);
  }
  // 떠다니는 꽃가루
  const P = HQ ? 260 : 120, pos = new Float32Array(P * 3);
  for (let i = 0; i < P; i++) { pos[i * 3] = (Math.random() - 0.5) * 30; pos[i * 3 + 1] = Math.random() * 6; pos[i * 3 + 2] = (Math.random() - 0.5) * 30; }
  const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  pollen = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.2, map: softTex("rgba(210,255,160,1)", "rgba(210,255,160,0)"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: lin(0xd8ff9a) })); // 반딧불
  scene.add(pollen);
  // 뒤쪽 테두리 빛
  const rimL = new THREE.DirectionalLight(0xa8b8ff, 1.15); rimL.position.set(4, 9, -16); scene.add(rimL);
}
function stepDecor(dt) {
  if (WATER) WATER.offset.y = (WATER.offset.y + dt * 0.14) % 1;
  stepExtras(dt);
  if (!pollen) return;
  const a = pollen.geometry.attributes.position;
  for (let i = 0; i < a.count; i++) {
    let y = a.getY(i) + dt * 0.25; if (y > 6) y = 0;
    a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(clock3d * 0.6 + i) * dt * 0.15);
  }
  a.needsUpdate = true;
}
// ----- 분위기 더하기: 불티 · 꽃잎 · 물빛 · 깃발 · 구름 바다 · 빛줄기 -----
const FXD = { mist: [], moonRef: null, crystals: [], bunting: [], boat: null, sway: [], embers: [], halos: [], flags: [], rays: [], petals: null, sparks: null, foam: null, sea: null, glow: null, t: 0, sparkT: 0 };
function addTorchFx(g, y) {
  if (!FXD.glow) FXD.glow = softTex("rgba(140,220,255,.85)", "rgba(60,140,255,0)");
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: FXD.glow, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.position.y = y; halo.scale.set(3, 3, 1); g.add(halo); FXD.halos.push(halo);
  const n = 12, pos = new Float32Array(n * 3), sp = [];
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 0.4; pos[i * 3 + 1] = y + Math.random() * 2.2; pos[i * 3 + 2] = (Math.random() - 0.5) * 0.4; sp.push(0.6 + Math.random() * 0.9); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.13, map: FXD.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: lin(0x9fe8ff) }));
  pts.frustumCulled = false; g.add(pts); FXD.embers.push({ a: geo.attributes.position, sp, y });
}
function buildExtras() {
  const R = Math.random;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color(), v3 = new THREE.Vector3(), sc = new THREE.Vector3();
  // 구름 바다: 섬 아래로 깔리는 구름
  const seaTex = canvasTex(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 150; i++) {
      const x = R() * w, y = R() * h, r = 30 + R() * 70, a = 0.12 + R() * 0.22;
      for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
        const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        gr.addColorStop(0, `rgba(110,100,170,${a})`); gr.addColorStop(1, "rgba(110,100,170,0)");
        g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
    }
  });
  seaTex.wrapS = seaTex.wrapT = THREE.RepeatWrapping; seaTex.repeat.set(5, 5);
  const sea = new THREE.Mesh(new THREE.CircleGeometry(130, 40), new THREE.MeshBasicMaterial({ map: seaTex, transparent: true, opacity: 0.85, depthWrite: false }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -16; OUT.add(sea); FXD.sea = seaTex;
  // 물가 거품
  const foamTex = canvasTex(32, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = R() * w, y = R() * h, rx = 4 + R() * 8, ry = 3 + R() * 9;
      g.fillStyle = `rgba(255,255,255,${0.45 + R() * 0.45})`;
      for (const dy of [-h, 0, h]) { g.beginPath(); g.ellipse(x, y + dy, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
    }
  });
  foamTex.wrapT = THREE.RepeatWrapping; foamTex.repeat.set(1, 3);
  const foamMat = new THREE.MeshBasicMaterial({ map: foamTex, color: lin(0xa8e8ff), transparent: true, opacity: 0.5, depthWrite: false });
  for (const off of [-(RIVER_HW - 0.12), RIVER_HW - 0.12]) OUT.add(riverRibbon(0.17, 0.075, foamMat, off));
  FXD.foam = foamTex;
  // 물 위 반짝임
  const SN = 60, spos = new Float32Array(SN * 3);
  for (let i = 0; i < SN; i++) { const z = (R() - 0.5) * 38; spos[i * 3] = riverX(z) + (R() - 0.5) * RIVER_HW * 1.6; spos[i * 3 + 1] = 0.11; spos[i * 3 + 2] = z; }
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(spos, 3));
  const sparks = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.24, map: softTex("rgba(255,255,255,1)", "rgba(255,255,255,0)"), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
  sparks.frustumCulled = false; OUT.add(sparks); FXD.sparks = sg.attributes.position;
  // 갈대
  const reedGeo = new THREE.ConeGeometry(0.04, 1, 4); reedGeo.translate(0, 0.5, 0);
  const RN = 140, reeds = new THREE.InstancedMesh(reedGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), RN);
  for (let i = 0; i < RN; i++) {
    const z = (R() - 0.5) * 38, side = R() < 0.5 ? -1 : 1;
    e.set((R() - 0.5) * 0.3, R() * 3, (R() - 0.5) * 0.3); q.setFromEuler(e);
    m4.compose(v3.set(riverX(z) + side * (RIVER_HW + 0.15 + R() * 0.5), 0, z), q, sc.set(1, 0.6 + R() * 0.8, 1));
    reeds.setMatrixAt(i, m4); reeds.setColorAt(i, col.setHSL(0.36 + R() * 0.08, 0.35, 0.16 + R() * 0.1).convertSRGBToLinear());
  }
  OUT.add(reeds);
  // 연잎
  const padGeo = new THREE.CircleGeometry(0.24, 10, 0, Math.PI * 1.8); padGeo.rotateX(-Math.PI / 2);
  const PN = 16, pads2 = new THREE.InstancedMesh(padGeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), PN);
  for (let i = 0; i < PN; i++) {
    const z = (R() - 0.5) * 30, s = 0.7 + R() * 0.7;
    e.set(0, R() * 6, 0); q.setFromEuler(e);
    m4.compose(v3.set(riverX(z) + (R() - 0.5) * RIVER_HW * 1.3, 0.09, z), q, sc.set(s, 1, s));
    pads2.setMatrixAt(i, m4); pads2.setColorAt(i, col.setHSL(0.3 + R() * 0.06, 0.5, 0.3 + R() * 0.1).convertSRGBToLinear());
  }
  pads2.receiveShadow = true; OUT.add(pads2);
  // 돌담 위 이끼
  const MN = 46, moss = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.24, 0), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), MN);
  for (let i = 0; i < MN; i++) {
    const k = i % 3, s = 0.6 + R() * 0.9;
    if (k === 0) v3.set((R() - 0.5) * 17, 0.72, -8 + (R() - 0.5) * 0.9);
    else v3.set((k === 1 ? -1 : 1) * (8.05 + (R() - 0.5) * 0.7), 0.49, -7 + R() * 16);
    e.set(R(), R() * 3, R()); q.setFromEuler(e);
    m4.compose(v3, q, sc.set(s, s * 0.32, s));
    moss.setMatrixAt(i, m4); moss.setColorAt(i, col.setHSL(0.36 + R() * 0.06, 0.45, 0.16 + R() * 0.08).convertSRGBToLinear());
  }
  moss.receiveShadow = true; scene.add(moss);
  // 깃발
  for (const [x, hex] of [[-9.9, 0x24407a], [9.9, 0x5a2a6a]]) {
    const g = new THREE.Group(); g.position.set(x, 0, -8.4); OUT.add(g);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.8, 8), new THREE.MeshStandardMaterial({ color: lin(0x5a4030), roughness: 0.8 }));
    pole.position.y = 2.4; pole.castShadow = true; g.add(pole);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), new THREE.MeshStandardMaterial({ color: lin(0xe8c25a), roughness: 0.3, metalness: 0.8 }));
    tip.position.y = 4.85; g.add(tip);
    const geo = new THREE.PlaneGeometry(1.9, 1.0, 10, 1); geo.translate(0.95, 0, 0);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * (1 - (p.getX(i) / 1.9) * 0.8));
    const flag = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: lin(hex), roughness: 0.75, side: THREE.DoubleSide }));
    flag.position.y = 4.15; if (x < 0) flag.rotation.y = Math.PI; flag.castShadow = true; g.add(flag);
    FXD.flags.push({ p, ph: x });
  }
  // 흩날리는 꽃잎
  const petalTex = canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.save(); g.translate(w / 2, h / 2); g.rotate(0.6);
    const gr = g.createRadialGradient(-6, 0, 0, 0, 0, 24); gr.addColorStop(0, "#fff2f7"); gr.addColorStop(1, "#f29cc4");
    g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, 23, 12, 0, 0, Math.PI * 2); g.fill(); g.restore();
  });
  const TN = 0, tpos = new Float32Array(TN * 3), tsp = [];
  for (let i = 0; i < TN; i++) { tpos[i * 3] = -9 + R() * 29; tpos[i * 3 + 1] = R() * 10; tpos[i * 3 + 2] = -15 + R() * 29; tsp.push(0.45 + R() * 0.5); }
  const tg = new THREE.BufferGeometry(); tg.setAttribute("position", new THREE.BufferAttribute(tpos, 3));
  const petals = new THREE.Points(tg, new THREE.PointsMaterial({ size: 0.3, map: petalTex, transparent: true, alphaTest: 0.15, depthWrite: false }));
  petals.frustumCulled = false; OUT.add(petals); FXD.petals = { a: tg.attributes.position, sp: tsp };
  // 나무 사이로 비치는 빛줄기
  if (HQ) {
    const rayTex = canvasTex(64, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const gx = g.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, "rgba(255,255,255,0)"); gx.addColorStop(0.5, "rgba(255,255,255,1)"); gx.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gx; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = "destination-in";
      const gy = g.createLinearGradient(0, 0, 0, h); gy.addColorStop(0, "rgba(0,0,0,0)"); gy.addColorStop(0.35, "rgba(0,0,0,1)"); gy.addColorStop(0.8, "rgba(0,0,0,.7)"); gy.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gy; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = "source-over";
    });
    const d = new THREE.Vector3(10, 18, -6).normalize(), cam = new THREE.Vector3(0, 0.69, 0.72);
    const zAxis = cam.clone().addScaledVector(d, -cam.dot(d)).normalize(), xAxis = new THREE.Vector3().crossVectors(d, zAxis);
    const rot = new THREE.Matrix4().makeBasis(xAxis, d, zAxis);
    for (const [x, z, wd, op] of [[-4.5, -3.5, 4.5, 0.06], [1.5, 0.5, 3.2, 0.045], [-8, 3, 5.5, 0.05]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(wd, 28), new THREE.MeshBasicMaterial({ map: rayTex, color: lin(0xa8c8ff), transparent: true, opacity: op * 1.3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      m.quaternion.setFromRotationMatrix(rot); m.position.set(x, 0, z).addScaledVector(d, 12); OUT.add(m); FXD.rays.push({ m, op });
    }
  }
}
// ----- 달빛 유적 소품: 빛나는 돌 비석 · 부서진 기둥 · 떠 있는 수정 -----
function buildProps() {
  const R = Math.random;
  const slate = new THREE.MeshStandardMaterial({ color: lin(0x6c6f7c), roughness: 0.9, flatShading: true }), slateDark = new THREE.MeshStandardMaterial({ color: lin(0x464957), roughness: 0.95, flatShading: true });
  const runeMat = new THREE.MeshBasicMaterial({ color: lin(0x7fe6ff), transparent: true, opacity: 0.85 });
  // 뒤쪽 비석: 반 이름이 새겨진 돌판
  const cb = new THREE.Group(); cb.position.set(0, -0.3, -9.1); cb.rotation.x = -0.2; cb.scale.setScalar(0.74); OUT.add(cb);
  addBox(cb, 7.3, 2.9, 0.4, slateDark, 0, 2.25, -0.1);
  chalk = canvasTex(2048, 720, paintChalk);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(6.7, 2.4), new THREE.MeshStandardMaterial({ map: chalk, roughness: 0.95, emissive: lin(0x1a3a4a), emissiveIntensity: 0.5 })); board.position.set(0, 2.25, 0.11); cb.add(board);
  addBox(cb, 7.9, 0.4, 0.7, slate, 0, 0.75, 0); addBox(cb, 7.9, 0.34, 0.6, slate, 0, 3.85, -0.1);
  for (const x of [-3.75, 3.75]) { addBox(cb, 0.5, 3.4, 0.6, slate, x, 2.25, -0.05); const gem = new THREE.Mesh(new THREE.OctahedronGeometry ? new THREE.OctahedronGeometry(0.22) : new THREE.SphereGeometry(0.2, 6, 4), runeMat); gem.position.set(x, 4.25, 0); cb.add(gem); FXD.crystals.push({ m: gem, y: 4.25, ph: x }); }
  // 부서진 기둥 (경기장 바깥을 둘러싸요)
  const colGeo = new THREE.CylinderGeometry(0.42, 0.48, 1, 10), capGeo = new THREE.BoxGeometry(1.25, 0.28, 1.25);
  const column = (x, z, hgt, broken) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = R() * 3; OUT.add(g);
    const base = new THREE.Mesh(capGeo, slateDark); base.position.y = 0.14; base.castShadow = true; base.receiveShadow = true; g.add(base);
    const sh = new THREE.Mesh(colGeo, slate); sh.scale.y = hgt; sh.position.y = 0.28 + hgt / 2; sh.castShadow = true; sh.receiveShadow = true; g.add(sh);
    if (!broken) { const cap = new THREE.Mesh(capGeo, slate); cap.position.y = 0.42 + hgt; cap.castShadow = true; g.add(cap); }
    else { const chunk = new THREE.Mesh(colGeo, slate); chunk.scale.y = 0.9; chunk.position.set(0.9, 0.4, 0.3); chunk.rotation.set(0.2, 0, Math.PI / 2 - 0.15); chunk.castShadow = true; g.add(chunk); }
    // 기둥 둘레 덩굴 띠
    const vine = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.05, 5, 14), new THREE.MeshStandardMaterial({ color: lin(0x2f5a3a), roughness: 1, flatShading: true }));
    vine.rotation.x = Math.PI / 2 + 0.2; vine.position.y = 0.28 + hgt * 0.45; g.add(vine);
  };
  for (const [x, z, h, b] of [[-11.2, -10.6, 3.6, 0], [-4.6, -11.6, 2.2, 1], [4.8, -11.8, 3.9, 0], [11.4, -10.2, 1.6, 1], [12.0, -3.8, 3.2, 0], [12.4, 3.4, 1.4, 1], [11.6, 9.4, 3.0, 0], [-13.8, 9.8, 2.0, 1]]) column(x, z, h, !!b);
  // 떠 있는 수정: 천천히 위아래로 움직이고 빛나요
  const crysGeo = new THREE.OctahedronGeometry ? new THREE.OctahedronGeometry(0.35) : new THREE.SphereGeometry(0.32, 6, 4);
  for (const [x, z, y, c] of [[-10.2, -6.2, 2.4, 0x7fe6ff], [10.6, -6.6, 2.8, 0xb48aff], [10.2, 6.2, 2.2, 0x7fe6ff], [-9.6, 13.8, 2.6, 0xb48aff], [0.8, -13.6, 4.2, 0x7fe6ff]]) {
    const m = new THREE.Mesh(crysGeo, new THREE.MeshStandardMaterial({ color: lin(c), roughness: 0.2, emissive: lin(c), emissiveIntensity: 0.9, flatShading: true }));
    m.position.set(x, y, z); m.scale.set(0.8, 1.6, 0.8); OUT.add(m); FXD.crystals.push({ m, y, ph: x + z });
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(`rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},.7)`, "rgba(0,0,0,0)"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(2.6, 2.6, 1); m.add(halo);
  }
  // 낮게 깔린 밤안개 (천천히 흘러가요)
  const mistTex = softTex("rgba(150,160,220,.5)", "rgba(150,160,220,0)");
  for (let i = 0; i < (HQ ? 22 : 10); i++) {
    const a = R() * Math.PI * 2, r = 11 + R() * 10, sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, opacity: 0.22 + R() * 0.14, depthWrite: false }));
    sp.position.set(Math.cos(a) * r, 0.5 + R() * 0.9, Math.sin(a) * r); const w = 6 + R() * 6; sp.scale.set(w, w * 0.32, 1); OUT.add(sp); FXD.mist.push({ sp, a, r, sp0: 0.015 + R() * 0.02 });
  }
  // 강물에 비친 달
  const moonRef = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 7.5), new THREE.MeshBasicMaterial({ map: softTex("rgba(220,235,255,.85)", "rgba(220,235,255,0)"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
  moonRef.rotation.x = -Math.PI / 2; moonRef.position.set(riverX(-7), 0.09, -7); OUT.add(moonRef); FXD.moonRef = moonRef;
  // 나무·바위 밑 그늘
  const shTex = softTex("rgba(6,8,18,.6)", "rgba(6,8,18,0)");
  const shGeo = new THREE.CircleGeometry(1, 20), shMat = new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false });
  for (const g of FXD.sway) { const m = new THREE.Mesh(shGeo, shMat); m.rotation.x = -Math.PI / 2; m.position.set(g.position.x + 0.5, 0.03, g.position.z + 0.3); m.scale.setScalar(g.scale.x * 1.7); OUT.add(m); }
}
function stepExtras(dt) {
  const t = (FXD.t += dt);
  if (FXD.sea) FXD.sea.offset.x = (FXD.sea.offset.x + dt * 0.003) % 1;
  if (FXD.foam) FXD.foam.offset.y = (FXD.foam.offset.y + dt * 0.42) % 1;
  FXD.sway.forEach((g, i) => { g.rotation.z = Math.sin(t * 0.9 + i * 1.7) * 0.022; g.rotation.x = Math.sin(t * 0.7 + i) * 0.016; });
  FXD.halos.forEach((h, i) => { const s = 3 + Math.sin(t * 11 + i * 2) * 0.25 + Math.sin(t * 23 + i) * 0.15; h.scale.set(s, s, 1); });
  for (const em of FXD.embers) {
    const a = em.a;
    for (let i = 0; i < a.count; i++) {
      let y = a.getY(i) + dt * em.sp[i];
      if (y > em.y + 2.4) { y = em.y; a.setX(i, (Math.random() - 0.5) * 0.4); a.setZ(i, (Math.random() - 0.5) * 0.4); }
      a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(t * 3 + i) * dt * 0.12);
    }
    a.needsUpdate = true;
  }
  for (const f of FXD.flags) {
    const p = f.p;
    for (let i = 0; i < p.count; i++) { const px = p.getX(i); p.setZ(i, Math.sin(px * 3.2 - t * 5 + f.ph) * 0.14 * (px / 1.9)); }
    p.needsUpdate = true;
  }
  if (FXD.petals) {
    const a = FXD.petals.a, sp = FXD.petals.sp;
    for (let i = 0; i < a.count; i++) {
      let y = a.getY(i) - dt * sp[i], x = a.getX(i) - dt * (0.45 + Math.sin(t * 0.8 + i) * 0.35);
      if (y < 0.15 || x < -11) { y = 9 + Math.random() * 2; x = -6 + Math.random() * 26; a.setZ(i, -15 + Math.random() * 29); }
      a.setY(i, y); a.setX(i, x);
    }
    a.needsUpdate = true;
  }
  if (FXD.sparks && (FXD.sparkT -= dt) <= 0) {
    FXD.sparkT = 0.09; const a = FXD.sparks;
    for (let k = 0; k < 6; k++) { const i = Math.floor(Math.random() * a.count), z = (Math.random() - 0.5) * 38; a.setX(i, riverX(z) + (Math.random() - 0.5) * RIVER_HW * 1.6); a.setZ(i, z); }
    a.needsUpdate = true;
  }
  FXD.bunting.forEach((b) => { b.f.rotation.x = Math.sin(t * 2.2 + b.ph) * 0.28; });
  FXD.mist.forEach((m) => { m.a += dt * m.sp0; m.sp.position.x = Math.cos(m.a) * m.r; m.sp.position.z = Math.sin(m.a) * m.r; });
  if (FXD.moonRef) { FXD.moonRef.material.opacity = 0.45 + Math.sin(t * 2.3) * 0.08 + Math.sin(t * 5.1) * 0.05; FXD.moonRef.scale.x = 1 + Math.sin(t * 3.7) * 0.12; }
  FXD.crystals.forEach((c) => { c.m.position.y = c.y + Math.sin(t * 1.2 + c.ph) * 0.18; c.m.rotation.y = t * 0.6 + c.ph; });
  if (FXD.boat) { FXD.boat.position.y = 0.12 + Math.sin(t * 1.3) * 0.025; FXD.boat.rotation.z = Math.sin(t * 0.9) * 0.05; }
  FXD.rays.forEach((r, i) => { r.m.material.opacity = r.op * (0.8 + Math.sin(t * 0.5 + i * 2) * 0.2); });
}
function init3D() {
  renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  if (THREE.RoomEnvironment) {
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
  }
  scene.add(new THREE.HemisphereLight(0x9aa8ff, 0x3a3050, scene.environment ? 0.42 : 0.85));
  const sun = new THREE.DirectionalLight(0xd6e2ff, 1.45); // 달빛
  sun.position.set(10, 18, 6); sun.castShadow = true; sun.shadow.mapSize.set(HQ ? 4096 : 2048, HQ ? 4096 : 2048);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12.5, bottom: -12.5, near: 1, far: 50 });
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffc89a, 0.35); fill.position.set(-10, 8, 16); scene.add(fill); // 화로 쪽 따뜻한 보조광
  buildWorld(); buildArena(); buildDecor();
  try { buildExtras(); } catch (e) { if (window.console) console.warn("extras", e); }
  try { buildProps(); } catch (e) { if (window.console) console.warn("props", e); }
  setupPost();
  PLATFORM = new THREE.Mesh(new THREE.BoxGeometry(18.4, 3, 20.2), new THREE.MeshStandardMaterial({ color: lin(0x4a4c5a), roughness: 0.95, flatShading: true }));
  PLATFORM.position.set(0, -1.52, 0.9); PLATFORM.receiveShadow = true; PLATFORM.visible = false; scene.add(PLATFORM);
  SKY = scene.background;
  loadBackdrop();
  // 캐릭터 부품
  const torsoPts = [[0, 0], [0.25, 0], [0.27, 0.12], [0.27, 0.3], [0.29, 0.42], [0.25, 0.5], [0.12, 0.56], [0, 0.565]].map(([x, y]) => new THREE.Vector2(x, y));
  Object.assign(GEO, {
    teamRing: new THREE.RingGeometry(0.5, 0.6, 40),
    torso: new THREE.LatheGeometry(torsoPts, 22),
    leg: new THREE.CylinderGeometry(0.085, 0.072, 0.52, 12),
    shoe: new THREE.SphereGeometry(0.1, 14, 10),
    sleeve: new THREE.CylinderGeometry(0.075, 0.064, 0.38, 12),
    hand: new THREE.SphereGeometry(0.06, 12, 10),
    neck: new THREE.CylinderGeometry(0.07, 0.075, 0.1, 12),
    head: new THREE.SphereGeometry(0.2, 28, 22),
    ear: new THREE.SphereGeometry(0.045, 10, 8),
    sclera: new THREE.SphereGeometry(0.042, 14, 10),
    iris: new THREE.SphereGeometry(0.026, 12, 10),
    shine: new THREE.SphereGeometry(0.009, 6, 5),
    brow: new THREE.BoxGeometry(0.075, 0.017, 0.02),
    nose: new THREE.SphereGeometry(0.021, 10, 8),
    mouth: new THREE.TorusGeometry(0.03, 0.007, 6, 14, Math.PI),
    hairCap: new THREE.SphereGeometry(0.218, 26, 18, 0, Math.PI * 2, 0, Math.PI * 0.5),
    hairBack: new THREE.SphereGeometry(0.214, 24, 18),
    fringe: new THREE.SphereGeometry(0.1, 14, 10),
    spike: new THREE.ConeGeometry(0.05, 0.14, 7),
    shirtV: new THREE.ConeGeometry(0.09, 0.2, 3),
    tie: new THREE.BoxGeometry(0.05, 0.22, 0.02),
    zip: new THREE.BoxGeometry(0.02, 0.4, 0.02),
    stripe: new THREE.CylinderGeometry(0.077, 0.077, 0.03, 12),
    pin: new THREE.SphereGeometry(0.03, 10, 8),
    lens: new THREE.TorusGeometry(0.046, 0.008, 6, 18),
    bridge: new THREE.BoxGeometry(0.05, 0.009, 0.009),
    shield: new THREE.CylinderGeometry(0.26, 0.26, 0.05, 24),
    boss: new THREE.SphereGeometry(0.07, 12, 8),
    bat: new THREE.CylinderGeometry(0.05, 0.022, 0.62, 12),
    handle: new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8),
    prong: new THREE.CylinderGeometry(0.015, 0.015, 0.12, 6),
    page: new THREE.BoxGeometry(0.18, 0.012, 0.24),
    pom: new THREE.IcosahedronGeometry(0.11, 1),
    band: new THREE.CylinderGeometry(0.082, 0.082, 0.08, 16, 1, true),
    ball: new THREE.SphereGeometry(0.11, 18, 14),
    paper: (() => { const g = new THREE.PlaneGeometry(0.9, 1.15, 8, 8); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, -0.1 * Math.cos(x * 3) + 0.04 * Math.sin(y * 5)); } g.computeVertexNormals(); return g; })(),
    bookBox: new THREE.BoxGeometry(1.0, 1.25, 0.32),
    limb: new THREE.CylinderGeometry(0.035, 0.035, 0.36, 8),
    chalkP: new THREE.CylinderGeometry(0.035, 0.035, 0.24, 8),
    plane: (() => { const g = new THREE.ConeGeometry(0.14, 0.45, 3); g.rotateX(Math.PI / 2); g.scale(1, 0.35, 1); return g; })(),
    spark: new THREE.SphereGeometry(0.045, 6, 5),
    ringFx: new THREE.RingGeometry(0.86, 1, 56),
  });
  raycaster = new THREE.Raycaster();
  pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.55);
}
// ----- 친구 캐릭터 -----
function nameHash(n) { let h = 7; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }

// 옷에 붙는 글자·번호 (한 번 만든 그림은 다시 써요)
const CHEST = {};
function chestTex(text, col = "#ffffff", bg = null) {
  const key = text + col + bg;
  if (CHEST[key]) return CHEST[key];
  const tex = textTex("chest" + key, 128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    if (bg) { g.fillStyle = bg; g.beginPath(); g.arc(w / 2, h / 2, w * 0.46, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = col; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `bold ${text.length > 2 ? 44 : 92}px ${TOK["--display"] || "sans-serif"}`; g.fillText(text, w / 2, h / 2 + 6);
  });
  return (CHEST[key] = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
}
// ----- 생김새(스킨): 머리 모양 · 표정 · 장식 (표는 friends.js 의 LOOKS) -----
const HAIR_STYLES = ["bowl", "spiky", "side", "buzz", "pomp", "curtain", "curly", "mushroom", "messy", "wavy"];
function lookOf(def, h) {
  const CH = champOf(def);
  if (CH) return { hair: CH.hair, hc: CH.hc, tip: CH.tip, skin: SKINS[(CH.skin ?? h) % SKINS.length], tall: CH.tall || 1.03, wide: CH.wide || (CH.kit === "juggernaut" ? 1.16 : CH.kit === "guard" || CH.kit === "warrior" ? 1.08 : 1.0),
    head: 1.0, eye: 1.0, mouth: CH.mouth || "flat", brow: 1.5, acc: (CH.acc || []).filter((x) => !(x[0] === "wings" && typeof HERO !== "undefined" && HERO.DIVINE[def.n])), hero: 1 };
  const L = (typeof LOOKS !== "undefined" && LOOKS[def.n]) || {};
  return { hair: L.hair || HAIR_STYLES[(h >> 7) % HAIR_STYLES.length], hc: L.hc ?? HAIRC[(h >> 3) % HAIRC.length], tip: L.tip, skin: SKINS[(L.skin ?? h) % SKINS.length],
    tall: L.tall || 0.97 + ((h >> 11) % 9) * 0.012, wide: L.wide || 0.95 + ((h >> 15) % 9) * 0.015, head: (L.head || 1.1) * 1.1, eye: (L.eye || 1) * 1.12, mouth: L.mouth || "", brow: L.brow || 1, acc: L.acc || [] };
}
let HAIR_FLAT = null, LOOK_GEO = null;
function applyLook(LK, C) {
  const { put, mk, head, torso, ud, def, mHair } = C;
  const LG = LOOK_GEO || (LOOK_GEO = {
    band: new THREE.TorusGeometry(0.212, 0.02, 6, 28), tail: new THREE.BoxGeometry(0.05, 0.16, 0.012), visor: new THREE.CylinderGeometry(0.15, 0.15, 0.014, 18, 1, false, -Math.PI / 2, Math.PI),
    sq: (() => { const g = new THREE.TorusGeometry(0.056, 0.008, 6, 4); g.rotateZ(Math.PI / 4); return g; })(), lensFill: new THREE.CircleGeometry(0.044, 16), temple: new THREE.BoxGeometry(0.008, 0.008, 0.16),
    pencil: new THREE.CylinderGeometry(0.009, 0.009, 0.17, 6), tip: new THREE.ConeGeometry(0.009, 0.03, 6), strip: new THREE.BoxGeometry(0.07, 0.024, 0.008),
    neckRing: new THREE.TorusGeometry(0.078, 0.03, 8, 18), flap: new THREE.BoxGeometry(0.06, 0.2, 0.018), cuff: new THREE.CylinderGeometry(0.064, 0.064, 0.05, 12),
    pack: new THREE.BoxGeometry(0.25, 0.3, 0.1), packPocket: new THREE.BoxGeometry(0.17, 0.12, 0.03), strap: new THREE.BoxGeometry(0.028, 0.3, 0.012),
    gem: new THREE.SphereGeometry(0.022, 10, 8), bow: new THREE.ConeGeometry(0.03, 0.05, 4), leaf: new THREE.ConeGeometry(0.022, 0.07, 4), feather: new THREE.SphereGeometry(0.1, 10, 8),
    string: new THREE.BoxGeometry(0.006, 0.17, 0.006), whistle: new THREE.CylinderGeometry(0.016, 0.016, 0.04, 8), device: new THREE.BoxGeometry(0.06, 0.035, 0.07),
  });
  const hex = (n) => "#" + n.toString(16).padStart(6, "0");
  for (const a of LK.acc) {
    const [kind, p1, p2, p3] = a;
    switch (kind) {
      case "headband": case "sweatband": {
        const m = mk(p1 ?? 0xffffff, 0.8), b = put(LG.band, m, 0, kind === "sweatband" ? 0.105 : 0.1, -0.005, head);
        b.rotation.x = Math.PI / 2 - 0.1; b.scale.set(0.97, 1.03, kind === "sweatband" ? 2.3 : 1.5);
        if (p2 === "tails") for (const s of [-1, 1]) { const t = put(LG.tail, m, s * 0.035, 0.0, -0.225, head); t.rotation.set(0.35, 0, s * 0.3); }
        break;
      }
      case "cap": {
        const m = mk(p1 ?? 0x2f5fa8, 0.75), back = p2 === "back";
        const cr = put(GEO.hairCap, m, 0, 0.055, -0.004, head); cr.scale.set(1.03, 1.02, 1.07); cr.rotation.x = back ? -0.32 : -0.1;
        const v = put(LG.visor, mk(p3 ?? p1 ?? 0x2f5fa8, 0.7), 0, back ? 0.04 : 0.085, back ? -0.2 : 0.185, head); v.rotation.set(back ? -0.25 : 0.2, back ? Math.PI : 0, 0); v.scale.set(1.05, 1, 1.15);
        put(GEO.pin, m, 0, 0.275, -0.01, head).scale.setScalar(0.5);
        break;
      }
      case "beanie": {
        const m = mk(p1 ?? 0xc8323a, 0.95), cr = put(GEO.hairCap, m, 0, 0.05, -0.004, head); cr.scale.set(1.05, 1.16, 1.09); cr.rotation.x = -0.12;
        const f = put(LG.band, m, 0, 0.075, -0.004, head); f.rotation.x = Math.PI / 2 - 0.12; f.scale.set(1.03, 1.08, 2.6);
        put(GEO.pom, mk(0xf4f4f4, 0.9, { flatShading: true }), 0, 0.31, -0.03, head).scale.setScalar(0.5);
        break;
      }
      case "beret": {
        const m = mk(p1 ?? 0x7a5cd0, 0.9), b = put(GEO.hairBack, m, 0.035, 0.215, -0.01, head); b.scale.set(1.08, 0.3, 1.08); b.rotation.z = -0.3;
        put(GEO.pin, m, 0.06, 0.285, -0.01, head).scale.set(0.3, 0.6, 0.3);
        break;
      }
      case "glasses": {
        const m = mk(p2 ?? 0x222222, 0.3, { metalness: 0.6 }), y = 0.018, z = 0.192;
        if (p1 === "sport") { const sh = put(LG.strip, mk(p2 ?? 0x2f5fa8, 0.2, { transparent: true, opacity: 0.4 }), 0, y, z + 0.004, head); sh.scale.set(3.2, 2.3, 1); const t = put(LG.band, m, 0, y, -0.005, head); t.rotation.x = Math.PI / 2; t.scale.set(0.9, 0.95, 0.5); break; }
        for (const s of [-1, 1]) {
          if (p1 === "square") put(LG.sq, m, s * 0.07, y, z, head).scale.set(1.05, 0.8, 1);
          else if (p1 !== "rimless") put(GEO.lens, m, s * 0.068, y, z, head).scale.set(p1 === "round" ? 1.12 : 1, p1 === "round" ? 1.05 : 0.8, 1);
          if (p1 === "tint" || p1 === "rimless") put(LG.lensFill, mk(p1 === "tint" ? p2 ?? 0x3fd8ff : 0xffffff, 0.1, { transparent: true, opacity: p1 === "tint" ? 0.55 : 0.28, emissive: lin(p1 === "tint" ? p2 ?? 0x3fd8ff : 0x000000), emissiveIntensity: 0.4 }), s * 0.068, y, z - 0.002, head).scale.set(1, 0.82, 1);
          const tp = put(LG.temple, m, s * 0.125, y + 0.004, z - 0.085, head); tp.rotation.y = -s * 0.42;
        }
        put(GEO.bridge, m, 0, y + 0.004, z + 0.003, head);
        break;
      }
      case "pencil": {
        const p = put(LG.pencil, mk(0xf2c230, 0.5), 0.192, 0.045, 0.0, head); p.rotation.x = Math.PI / 2 - 0.35;
        const t = put(LG.tip, mk(0x3a2a1a, 0.5), 0.192, 0.012, 0.09, head); t.rotation.x = Math.PI / 2 - 0.35 + Math.PI * 0; t.rotation.x += 0;
        put(GEO.pin, mk(0xf08aa8, 0.6), 0.192, 0.075, -0.082, head).scale.setScalar(0.35);
        break;
      }
      case "bandage": {
        const m = mk(0xf6e6cc, 0.9);
        if (p1 === "nose") { const b = put(LG.strip, m, 0, -0.008, 0.2, head); b.scale.set(1.0, 0.9, 1); }
        else { const b = put(LG.strip, m, 0.11, -0.04, 0.16, head); b.rotation.set(0, 0.62, 0.35); b.scale.set(0.85, 1, 1); const b2 = put(LG.strip, m, 0.11, -0.04, 0.161, head); b2.rotation.set(0, 0.62, -0.35 + Math.PI / 2 - 1.2); b2.scale.set(0.85, 1, 1); }
        break;
      }
      case "blush": break; // 얼굴 그림에 그려요
      case "scarf": {
        const m = mk(p1 ?? 0xfff0c8, 0.95), r = put(LG.neckRing, m, 0, 0.6, 0.0, torso); r.rotation.x = Math.PI / 2; r.scale.set(1.15, 1.0, 1.2);
        const f = put(LG.flap, m, 0.06, 0.48, 0.105, torso); f.rotation.z = -0.12; put(LG.flap, m, -0.02, 0.5, -0.095, torso).scale.set(1, 0.8, 1);
        break;
      }
      case "towel": {
        const m = mk(p1 ?? 0xf4f4f4, 0.95), r = put(LG.neckRing, m, 0, 0.59, -0.01, torso); r.rotation.x = Math.PI / 2; r.scale.set(1.1, 1.0, 0.6);
        for (const s of [-1, 1]) { const f = put(LG.flap, m, s * 0.072, 0.47, 0.1, torso); f.rotation.z = s * 0.08; }
        break;
      }
      case "whistle": {
        const m = mk(0x222222, 0.6);
        for (const s of [-1, 1]) { const st = put(LG.string, m, s * 0.035, 0.49, 0.105, torso); st.rotation.set(-0.12, 0, s * 0.42); }
        const w = put(LG.whistle, mk(0xffcf4a, 0.3, { metalness: 0.7 }), 0, 0.4, 0.122, torso); w.rotation.z = Math.PI / 2;
        break;
      }
      case "armband": { const b = put(LG.cuff, mk(p1 ?? 0xffd24a, 0.7), 0, -0.13, 0, ud.arms[0]); b.scale.set(1.36, 1.0, 1.36); break; }
      case "wristband": for (const el of ud.elbows) put(LG.cuff, mk(p1 ?? 0xffffff, 0.9), 0, -0.225, 0, el).scale.set(1.02, 0.9, 1.02); break;
      case "sleeve": { const m = mk(p1 ?? 0x1a1a1e, 0.6); put(GEO.human.upper, m, 0, -0.17, 0, ud.arms[1]).scale.set(0.96, 0.9, 0.96); put(GEO.human.fore, m, 0, -0.12, 0, ud.elbows[1]).scale.set(0.95, 0.95, 0.95); break; }
      case "backpack": {
        const m = mk(p1 ?? 0x2a3550, 0.85), m2 = mk(0xf2f0ea, 0.8);
        put(LG.pack, m, 0, 0.36, -0.158, torso); put(LG.packPocket, mk(p1 ?? 0x2a3550, 0.7, { emissive: lin(0x111111) }), 0, 0.29, -0.215, torso);
        put(GEO.pin, mk(COST_HEX[def.c] || 0xffffff, 0.4), 0.07, 0.44, -0.212, torso).scale.setScalar(0.55);
        for (const s of [-1, 1]) { const st = put(LG.strap, m2, s * 0.1, 0.42, 0.108, torso); st.rotation.x = -0.1; }
        break;
      }
      case "pendant": {
        for (const s of [-1, 1]) { const st = put(LG.string, mk(0x333333, 0.6), s * 0.03, 0.5, 0.108, torso); st.rotation.set(-0.12, 0, s * 0.36); st.scale.y = 0.75; }
        put(LG.gem, mk(p1 ?? 0x7ff0e0, 0.2, { emissive: lin(p1 ?? 0x7ff0e0), emissiveIntensity: 1.2 }), 0, 0.435, 0.125, torso);
        break;
      }
      case "bowtie": { const m = mk(p1 ?? 0xffcf4a, 0.6); for (const s of [-1, 1]) { const b = put(LG.bow, m, s * 0.028, 0.545, 0.118, torso); b.rotation.z = s * Math.PI / 2; b.scale.set(1, 1, 0.5); } put(GEO.pin, m, 0, 0.545, 0.122, torso).scale.setScalar(0.4); break; }
      case "badge": put(GEO.human.patch, chestTex(String(p1), p2 || "#ffffff", p3 || "#333333"), 0.08, 0.4, 0.119, torso).scale.setScalar(0.75); break;
      case "backprint": { const bp = put(GEO.human.patch, chestTex(String(p1), hex(p2 ?? 0xffffff)), 0, 0.37, -0.112, torso); bp.rotation.y = Math.PI; bp.scale.setScalar(String(p1).length > 1 ? 1.9 : 1.6); break; }
      case "laurel": {
        const m = mk(0xffd86b, 0.3, { metalness: 0.6, emissive: lin(0xa87810), emissiveIntensity: 0.5 });
        const r = put(LG.band, m, 0, 0.1, -0.005, head); r.rotation.x = Math.PI / 2 - 0.12; r.scale.set(0.98, 1.04, 0.8);
        for (let i = 0; i < 12; i++) { const s = i < 6 ? -1 : 1, t = (i % 6) / 5, a = 0.5 + t * 2.0; const lf = put(LG.leaf, m, s * Math.sin(a) * 0.215, 0.125 + t * 0.015, Math.cos(a) * 0.215 - 0.005, head); lf.rotation.set(0.4 * Math.cos(a), 0, -s * (0.5 + 0.3 * Math.sin(a))); }
        break;
      }
      case "wings": {
        const m = mk(0xffffff, 0.6, { emissive: lin(0x8a7a50), emissiveIntensity: 0.5 });
        // 어깨뼈에서 부채꼴로 펼친 깃털: 위쪽은 길게 위·바깥으로, 아래쪽은 짧게 아래·바깥으로
        for (const s of [-1, 1]) for (let i = 0; i < 6; i++) {
          const a = 0.45 + i * 0.4, len = 0.5 - i * 0.055, ax = s * 0.07, ay = 0.44;
          const f = put(LG.feather, m, ax + s * Math.sin(a) * len * 0.5, ay + Math.cos(a) * len * 0.5, -0.135 - i * 0.008, torso);
          f.scale.set(0.42, len * 5.2, 0.14); f.rotation.z = -s * a;
        }
        break;
      }
    }
  }
  // 합체로봇 대원: 손목에 빛나는 합체 장치
  if (def.t.includes("합체로봇")) {
    const col = (OUTFITS[def.n] && (OUTFITS[def.n].accent ?? OUTFITS[def.n].top)) || 0x7ff0ff, glow = col === 0xf4f4f4 || col === 0x111111 ? 0x7ff0ff : col;
    const el = ud.elbows[0];
    put(LG.device, mk(0x2a2e36, 0.35, { metalness: 0.7 }), 0, -0.2, 0.0, el).scale.set(1.1, 1.3, 1.1);
    put(LG.gem, mk(glow, 0.2, { emissive: lin(glow), emissiveIntensity: 1.4 }), -0.036, -0.2, 0.0, el).scale.setScalar(0.9);
    put(LG.gem, mk(glow, 0.2, { emissive: lin(glow), emissiveIntensity: 1.4 }), 0.036, -0.2, 0.0, el).scale.setScalar(0.9);
  }
}
// ----- 영웅 갑옷 (판타지 스킨): 역할마다 다른 장비 세트를 옷 위에 덧입혀요 -----
// 수호자=판금 갑옷+망토, 돌격대=한쪽 큰 어깨갑옷+팔 보호대, 저격수=가죽 망토+화살통, 천재=마법사 망토+떠 있는 구슬,
// 응원단=깃발+어깨띠, 신=금빛 갑옷+망토. 색은 친구 옷 색(OUTFITS)에서 가져와요.
let ARMOR_GEO = null;
function armorGeo() {
  if (ARMOR_GEO) return ARMOR_GEO;
  const plate = (r, ph0, phl, th0, thl) => new THREE.SphereGeometry(r, 18, 10, ph0, phl, th0, thl);
  const cape = (() => { const g = new THREE.PlaneGeometry(0.44, 0.92, 6, 10); g.translate(0, -0.46, 0); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, -0.06 * Math.cos((x / 0.22) * Math.PI * 0.5) * (0.4 - y * 0.6) + Math.sin(x * 22) * 0.012 * -y); p.setX(i, x * (1 - y * 0.35)); } g.computeVertexNormals(); return g; })();
  return (ARMOR_GEO = {
    pauldron: plate(0.12, 0, Math.PI * 2, 0, Math.PI * 0.5), pauldronRim: new THREE.TorusGeometry(0.118, 0.016, 6, 20),
    chest: plate(0.205, Math.PI / 2 - 0.95, 1.9, Math.PI * 0.3, Math.PI * 0.42), gorget: new THREE.TorusGeometry(0.085, 0.028, 8, 20),
    bracer: new THREE.CylinderGeometry(0.072, 0.062, 0.15, 14), ring: new THREE.TorusGeometry(0.072, 0.012, 5, 18),
    greave: new THREE.CylinderGeometry(0.08, 0.07, 0.22, 14), knee: new THREE.SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    cape, spike: new THREE.ConeGeometry(0.03, 0.12, 6), gem: new THREE.OctahedronGeometry ? new THREE.OctahedronGeometry(0.03) : new THREE.SphereGeometry(0.03, 6, 4),
    buckle: new THREE.CylinderGeometry(0.045, 0.045, 0.02, 6), quiver: new THREE.CylinderGeometry(0.055, 0.045, 0.42, 10), shaft: new THREE.CylinderGeometry(0.006, 0.006, 0.16, 5), fletch: new THREE.ConeGeometry(0.022, 0.06, 3),
    mantle: new THREE.CylinderGeometry(0.15, 0.3, 0.2, 18, 1, true), orb: new THREE.SphereGeometry(0.075, 14, 10), orbRing: new THREE.TorusGeometry(0.12, 0.008, 5, 28),
    pole: new THREE.CylinderGeometry(0.012, 0.012, 0.95, 6), banner: (() => { const g = new THREE.PlaneGeometry(0.26, 0.36, 4, 4); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < -0.1) p.setX(i, p.getX(i) * (1 - (-0.1 - y) * 2.2)); } return g; })(),
    sash: new THREE.BoxGeometry(0.06, 0.6, 0.02), wrap: new THREE.TorusGeometry(0.062, 0.01, 4, 14), paint: new THREE.BoxGeometry(0.05, 0.009, 0.006),
    tabard: new THREE.BoxGeometry(0.2, 0.5, 0.02), hoodDown: new THREE.TorusGeometry(0.12, 0.05, 8, 18, Math.PI * 1.3),
  });
}
const ROLE_KIT = { "수호자": "guard", "돌격대": "warrior", "저격수": "ranger", "천재": "mage", "응원단": "bard", "신": "god" };
// ----- 판타지 영웅: 투구·두건 등 머리 장비와 무기 (표는 friends.js 의 CHAMPS) -----
const champOf = (def) => (!def.plain && typeof CHAMPS !== "undefined" && CHAMPS[def.n]) || null;
let CHG = null;
function champGeo() {
  if (CHG) return CHG;
  return (CHG = {
    hood: new THREE.SphereGeometry(0.265, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), mask: new THREE.SphereGeometry(0.212, 18, 10, Math.PI / 2 - 1.05, 2.1, Math.PI * 0.53, Math.PI * 0.3),
    rim: new THREE.TorusGeometry(0.228, 0.022, 6, 26), band: new THREE.TorusGeometry(0.212, 0.016, 6, 26), visor: new THREE.TorusGeometry(0.205, 0.028, 6, 20, Math.PI),
    noseGuard: new THREE.BoxGeometry(0.035, 0.13, 0.03), cheek: new THREE.BoxGeometry(0.05, 0.12, 0.09), horn: new THREE.ConeGeometry(0.055, 0.26, 10), spike: new THREE.ConeGeometry(0.03, 0.13, 6),
    gem: new THREE.OctahedronGeometry ? new THREE.OctahedronGeometry(0.03) : new THREE.SphereGeometry(0.03, 6, 4), scar: new THREE.BoxGeometry(0.008, 0.07, 0.006), paint: new THREE.BoxGeometry(0.012, 0.075, 0.006),
    grip: new THREE.CylinderGeometry(0.02, 0.02, 0.16, 8), guard: new THREE.BoxGeometry(0.18, 0.03, 0.04), blade: new THREE.BoxGeometry(0.055, 0.6, 0.014), tip: new THREE.ConeGeometry(0.039, 0.1, 4),
    pommel: new THREE.SphereGeometry(0.03, 8, 6), haft: new THREE.CylinderGeometry(0.022, 0.022, 1, 8), axe: new THREE.CylinderGeometry(0.22, 0.22, 0.024, 18, 1, false, 0, Math.PI),
    hammer: new THREE.BoxGeometry(0.17, 0.17, 0.32), bow: new THREE.TorusGeometry(0.42, 0.018, 6, 26, Math.PI * 0.9), string: new THREE.BoxGeometry(0.004, 0.8, 0.004),
    stock: new THREE.BoxGeometry(0.06, 0.38, 0.07), barrel: new THREE.CylinderGeometry(0.025, 0.03, 0.75, 10), scope: new THREE.CylinderGeometry(0.025, 0.025, 0.2, 10),
    book: new THREE.BoxGeometry(0.24, 0.3, 0.06), page: new THREE.BoxGeometry(0.22, 0.28, 0.05), tower: new THREE.BoxGeometry(0.38, 0.56, 0.045), emblem: new THREE.CylinderGeometry(0.09, 0.09, 0.02, 6),
    vane: new THREE.SphereGeometry(0.1, 12, 8), fist: new THREE.SphereGeometry(0.1, 14, 10), hornCone: new THREE.ConeGeometry(0.075, 0.38, 14, 1, true), ringA: new THREE.TorusGeometry(0.13, 0.01, 6, 28),
    orb: new THREE.SphereGeometry(0.075, 16, 12), spearHead: new THREE.OctahedronGeometry ? new THREE.OctahedronGeometry(0.075) : new THREE.SphereGeometry(0.07, 6, 4), ray: new THREE.ConeGeometry(0.022, 0.12, 5),
    crownBand: new THREE.TorusGeometry(0.215, 0.028, 6, 26), tabardLong: new THREE.BoxGeometry(0.17, 0.62, 0.02),
  });
}
function champMetal(mk, kind) {
  return kind === "gold" ? mk(0xd8b45a, 0.28, { metalness: 0.9 }) : kind === "dark" ? mk(0x3a3e48, 0.35, { metalness: 0.85 }) : kind === "bronze" ? mk(0xa8723a, 0.32, { metalness: 0.85 }) : mk(0x9aa4b4, 0.3, { metalness: 0.88 });
}
function buildChampHead(CH, C) {
  const { put, mk, head, mHair } = C, G = champGeo(), metal = champMetal(mk, CH.metal), trim = mk(0xd8b45a, 0.28, { metalness: 0.9 });
  const cloth = mk(CH.top, 0.9, { side: THREE.DoubleSide }), glowM = (hex) => mk(hex, 0.2, { emissive: lin(hex), emissiveIntensity: 1.4 });
  if (typeof HERO !== "undefined" && HERO.headGear(CH, { put, mk, head, mP: mk(0xffffff, 0.6) })) { /* 조각한 투구 (hero.js) */ } else
  switch (CH.head) {
    case "helm": case "horned": {
      const cap = put(GEO.hairCap, metal, 0, 0.045, -0.004, head); cap.scale.set(1.1, 1.12, 1.12); cap.rotation.x = -0.12;
      const rim = put(G.rim, trim, 0, 0.06, 0.0, head); rim.rotation.x = Math.PI / 2 - 0.12; rim.scale.set(1.0, 1.04, 1.4);
      put(G.noseGuard, metal, 0, 0.0, 0.215, head);
      for (const s of [-1, 1]) { const ck = put(G.cheek, metal, s * 0.17, -0.04, 0.09, head); ck.rotation.y = s * 0.55; }
      if (CH.head === "horned") for (const s of [-1, 1]) { const h1 = put(G.horn, mk(0xe8e0c8, 0.6), s * 0.2, 0.2, 0.0, head); h1.rotation.z = -s * 0.9; const h2 = put(G.horn, mk(0xe8e0c8, 0.6), s * 0.31, 0.33, 0.0, head); h2.scale.set(0.6, 0.8, 0.6); h2.rotation.z = -s * 0.25; }
      else put(G.spike, trim, 0, 0.29, -0.02, head).scale.set(1.2, 1.4, 1.2);
      break;
    }
    case "hood": {
      const hd = put(G.hood, cloth, 0, 0.03, -0.025, head); hd.rotation.x = -0.32; hd.scale.set(1.0, 1.08, 1.06);
      const inner = put(G.band, mk(0x0e0e14, 0.9), 0, 0.02, 0.12, head); inner.rotation.x = -0.32 + Math.PI / 2 - 0.7; inner.scale.set(1.0, 1.0, 2.2);
      break;
    }
    case "mask": {
      put(G.mask, mk(0x14141a, 0.85, { side: THREE.DoubleSide }), 0, 0.0, 0.004, head).scale.set(1.04, 1.04, 1.06);
      const b = put(G.band, mk(CH.accent, 0.8), 0, 0.1, -0.005, head); b.rotation.x = Math.PI / 2 - 0.1; b.scale.set(0.98, 1.04, 1.6);
      break;
    }
    case "visor": { const v = put(G.visor, glowM(CH.accent), 0, 0.022, 0.0, head); v.rotation.x = Math.PI / 2; v.scale.set(1.0, 1.0, 1.4); put(G.band, metal, 0, 0.022, -0.01, head).rotation.x = Math.PI / 2; break; }
    case "circlet": { const c = put(G.band, trim, 0, 0.075, -0.005, head); c.rotation.x = Math.PI / 2 - 0.16; put(G.gem, glowM(CH.accent), 0, 0.105, 0.205, head).scale.set(1.1, 1.5, 0.8); break; }
    case "crown": {
      const c = put(G.crownBand, trim, 0, 0.13, -0.01, head); c.rotation.x = Math.PI / 2 - 0.1;
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + Math.PI / 2; const sp = put(G.spike, trim, Math.cos(a) * 0.21, 0.2, Math.sin(a) * 0.21 - 0.01, head); sp.scale.set(1, i === 0 ? 1.6 : 1.1, 1); }
      put(G.gem, glowM(CH.accent), 0, 0.15, 0.23, head).scale.setScalar(1.4);
      break;
    }
    case "band": { const b = put(G.band, mk(CH.accent === 0x111111 ? 0xf0ece0 : CH.accent, 0.85), 0, 0.1, -0.005, head); b.rotation.x = Math.PI / 2 - 0.1; b.scale.set(1.0, 1.04, 2.2); for (const s of [-1, 1]) { const t = put(G.paint, b.material, s * 0.03, 0.0, -0.23, head); t.scale.set(3, 2.2, 1); t.rotation.set(0.4, 0, s * 0.3); } break; }
  }
  if (CH.scar) { const sc = put(G.scar, mk(0x8a4a44, 0.8), 0.1, -0.02, 0.165, head); sc.rotation.set(0, 0.55, 0.35); }
  if (CH.paint != null) for (const s of [-1, 1]) for (let i = 0; i < 2; i++) { const p = put(G.paint, mk(CH.paint, 0.8), s * (0.1 + i * 0.022), -0.035, 0.16 - i * 0.012, head); p.rotation.set(0, s * 0.5, s * 0.15); }
}
function buildChampWeapon(CH, C) {
  const { L, R, mk } = C, G = champGeo(), metal = champMetal(mk, CH.metal), trim = mk(0xd8b45a, 0.28, { metalness: 0.9 });
  const wood = mk(0x4a3222, 0.7), leatherW = mk(0x3a2a20, 0.8), glowM = (hex, k = 1.5) => mk(hex, 0.2, { emissive: lin(hex), emissiveIntensity: k });
  const holder = (hand, rx = Math.PI / 2 - 0.4, idle = null, atk = null) => {
    const w = new THREE.Group(); w.position.set(0, -0.4, 0.04); w.rotation.x = rx; hand.add(w);
    if (idle || atk) (C.ud.aimW || (C.ud.aimW = [])).push({ w, side: hand === L ? 0 : 1, rest: rx, idle, atk });
    return w;
  };
  if (typeof HERO !== "undefined" && HERO.weapon(CH, { holder, L, R, mk, ud: C.ud, mP: mk(0xffffff, 0.6) })) return; // 조각한 무기 (hero.js)
  const add = (w, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; w.add(m); return m; };
  const sword = (w, s = 1, bladeM = metal) => {
    add(w, G.grip, leatherW, 0, 0, 0).scale.setScalar(s); add(w, G.pommel, trim, 0, -0.09 * s, 0).scale.setScalar(s);
    add(w, G.guard, trim, 0, 0.085 * s, 0).scale.setScalar(s); const b = add(w, G.blade, bladeM, 0, 0.4 * s, 0); b.scale.setScalar(s);
    add(w, G.tip, bladeM, 0, 0.75 * s, 0).scale.set(s, s, s * 0.36);
  };
  const staff = (w, len = 1.25) => { const h = add(w, G.haft, wood, 0, len * 0.25, 0); h.scale.y = len; return len * 0.75; };
  switch (CH.weapon) {
    case "sword": sword(holder(R)); break;
    case "blades": sword(holder(R), 0.75, mk(0xd8dee8, 0.2, { metalness: 0.9 })); sword(holder(L), 0.75, mk(0xd8dee8, 0.2, { metalness: 0.9 })); break;
    case "greataxe": { const w = holder(R, Math.PI / 2 - 0.6); add(w, G.haft, wood, 0, 0.3, 0).scale.y = 1.05; for (const s of [-1, 1]) { const a = add(w, G.axe, metal, s * 0.0, 0.72, 0); a.rotation.set(Math.PI / 2, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2); a.scale.set(1, 1, 1.1); } add(w, G.spike, trim, 0, 0.92, 0); break; }
    case "hammer": { const w = holder(R, Math.PI / 2 - 0.6); add(w, G.haft, wood, 0, 0.3, 0).scale.y = 0.95; add(w, G.hammer, metal, 0, 0.78, 0); for (const s of [-1, 1]) add(w, G.emblem, glowM(CH.accent, 1.2), 0, 0.78, s * 0.165).rotation.x = Math.PI / 2; break; }
    case "bow": { // 활: 손잡이를 쥐고 위아래로 세운 활, 앞으로 휜 활대와 몸 쪽 시위
      const w = holder(L, 0.15, "up", "up"), bw = new THREE.Group(); bw.position.z = -0.4; w.add(bw);
      const b = add(bw, G.bow, wood, 0, 0, 0); b.rotation.set(0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 0.05);
      add(bw, G.string, mk(0xe8e8e8, 0.6), 0, 0, 0.066).scale.y = 1.04;
      for (const s of [-1, 1]) add(bw, G.gem, trim, 0, s * 0.4, 0.07);
      add(w, G.grip, leatherW, 0, 0, 0.0).scale.set(1.3, 0.8, 1.3);
      break;
    }
    case "crossbow": { const w = holder(R, Math.PI / 2 - 0.2, null, "fwd"); add(w, G.stock, wood, 0, 0.12, 0); const b = add(w, G.bow, metal, 0, 0.3, 0); b.rotation.set(Math.PI / 2, 0, Math.PI * 0.05); b.scale.set(0.55, 0.55, 0.55); add(w, G.gem, glowM(CH.accent), 0, 0.33, 0.04); break; }
    case "rifle": { const w = holder(R, Math.PI / 2 - 0.15, null, "fwd"); add(w, G.stock, mk(0x22242c, 0.5), 0, -0.05, 0); add(w, G.barrel, metal, 0, 0.45, 0.02); const sc = add(w, G.scope, metal, 0, 0.25, 0.08); add(w, G.orb, glowM(CH.accent), 0, 0.35, 0.08).scale.setScalar(0.35); add(w, G.gem, glowM(CH.accent), 0, 0.84, 0.02); break; }
    case "tome": { const w = holder(L, 0.2); const bk = add(w, G.book, mk(CH.top, 0.6), 0, 0.02, 0.06); bk.rotation.x = -0.3; add(w, G.page, mk(0xf2ead8, 0.8), 0.006, 0.02, 0.07).rotation.x = -0.3; add(w, G.emblem, glowM(CH.accent), 0, 0.03, 0.1).rotation.x = Math.PI / 2 - 0.3; break; }
    case "shield": {
      sword(holder(R), 0.85);
      const w = holder(L, 0.05); const sh = add(w, G.tower, mk(CH.top, 0.6), -0.08, 0.05, 0.08); sh.rotation.y = Math.PI / 2 - 0.2;
      const tr = add(w, G.tower, metal, -0.09, 0.05, 0.08); tr.rotation.y = Math.PI / 2 - 0.2; tr.scale.set(1.08, 1.06, 0.6);
      const em = add(w, G.emblem, trim, -0.115, 0.08, 0.075); em.rotation.set(0, 0, Math.PI / 2); add(w, G.gem, glowM(CH.accent), -0.13, 0.08, 0.072).scale.setScalar(1.3);
      break;
    }
    case "mawshield": { const w = holder(L, 0.05); add(w, GEO.shield, mk(CH.top, 0.5), -0.1, 0.05, 0.08).rotation.z = Math.PI / 2; break; }
    case "pizzabox": { const w = holder(L, 0.2); add(w, new THREE.BoxGeometry(0.34, 0.34, 0.07), mk(0xd9a86a, 0.8), 0, 0.02, 0.06).rotation.x = -0.3; break; }
    case "bo": { const w = holder(R, Math.PI / 2 - 0.9); const h = add(w, G.haft, mk(0x6a4a2a, 0.6), 0, 0.15, 0); h.scale.y = 1.5; for (const y of [-0.55, 0.85]) add(w, G.emblem, metal, 0, y, 0).scale.set(0.3, 3, 0.3); break; }
    case "quill": { const w = holder(R); add(w, G.haft, mk(0xf2ead8, 0.6), 0, 0.3, 0).scale.set(0.7, 0.9, 0.7); const v = add(w, G.vane, mk(CH.accent, 0.7), 0.03, 0.62, 0); v.scale.set(0.9, 3.2, 0.25); add(w, G.tip, glowM(0xe8d0ff), 0, -0.18, 0).rotation.x = Math.PI; break; }
    case "gauntlets": for (const hand of [L, R]) { const w = holder(hand, 0); add(w, G.fist, metal, 0, 0.02, 0).scale.set(1.1, 1.0, 1.2); for (let i = 0; i < 3; i++) { const sp = add(w, G.spike, trim, (i - 1) * 0.06, 0.02, 0.1); sp.rotation.x = Math.PI / 2; } add(w, G.gem, glowM(CH.accent), 0, 0.09, 0.0); } break;
    case "horn": { const w = holder(L, 0.6); const hc = add(w, G.hornCone, mk(0xe8dcc0, 0.6, { side: THREE.DoubleSide }), 0, 0.12, 0.05); hc.rotation.z = Math.PI; for (const y of [0.0, 0.2]) add(w, G.ringA, trim, 0, y, 0.05).scale.setScalar(0.45 + y); sword(holder(R), 0.7); break; }
    case "astrolabe": { const w = holder(R, Math.PI / 2 - 0.85, "up", "up"); const top = staff(w, 1.3); const r1 = add(w, G.ringA, trim, 0, top + 0.05, 0); const r2 = add(w, G.ringA, trim, 0, top + 0.05, 0); r2.rotation.y = Math.PI / 2; r1.scale.setScalar(1.0); add(w, G.orb, glowM(CH.accent), 0, top + 0.05, 0).scale.setScalar(0.8); r1.userData.keep = r2.userData.keep = true; C.ud.spin = [r1, r2]; break; }
    case "abyssorb": { const w = holder(R, 0); const o = add(w, G.orb, mk(0x1a0a2a, 0.2, { emissive: lin(0x4a1a8a), emissiveIntensity: 1.2 }), 0, 0.1, 0.12); o.scale.setScalar(1.4); const r = add(w, G.ringA, glowM(CH.accent), 0, 0.1, 0.12); r.rotation.x = 1.2; r.userData.keep = true; C.ud.spin = [r]; break; }
    case "spear": { const w = holder(R, Math.PI / 2 - 0.85, "up", "fwd"); const top = staff(w, 1.45); add(w, G.spearHead, CH.metal === "gold" ? trim : metal, 0, top + 0.1, 0).scale.set(0.7, 2.2, 0.35); add(w, G.gem, glowM(CH.accent), 0, top - 0.05, 0).scale.setScalar(1.4); break; }
    case "crystalstaff": { const w = holder(R, Math.PI / 2 - 0.85, "up", "up"); const top = staff(w, 1.3); for (let i = 0; i < 3; i++) { const t = add(w, G.spike, trim, Math.cos(i * 2.1) * 0.05, top - 0.02, Math.sin(i * 2.1) * 0.05); t.rotation.set(Math.sin(i * 2.1) * 0.5, 0, -Math.cos(i * 2.1) * 0.5); } add(w, G.spearHead, glowM(CH.accent, 1.3), 0, top + 0.12, 0).scale.set(0.9, 1.6, 0.9); break; }
    case "net": { // 투망: 긴 막대 끝의 둥근 테에 그물주머니
      const w = holder(R, Math.PI / 2 - 0.6), top = staff(w, 1.1);
      add(w, G.netHoop || (G.netHoop = new THREE.TorusGeometry(0.21, 0.017, 6, 26)), trim, 0, top + 0.21, 0);
      const bag = add(w, G.netBag || (G.netBag = new THREE.SphereGeometry(0.21, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), new THREE.MeshBasicMaterial({ color: lin(CH.accent), wireframe: true }), 0, top + 0.21, 0);
      bag.rotation.x = Math.PI / 2; bag.castShadow = false;
      break;
    }
    case "ribbon": { // 댄스 리본: 짧은 막대 끝에서 길게 늘어진 리본
      const w = holder(R, Math.PI / 2 - 0.7), top = staff(w, 0.5);
      add(w, G.gem, glowM(CH.accent, 1.2), 0, top + 0.03, 0).scale.setScalar(1.4);
      const rb = add(w, G.ribbon || (G.ribbon = new THREE.PlaneGeometry(0.09, 0.75, 1, 6)), mk(CH.top, 0.6, { side: THREE.DoubleSide }), 0, top - 0.3, -0.08);
      rb.rotation.x = 0.25; rb.castShadow = false;
      break;
    }
    case "sunstaff": { const w = holder(R, Math.PI / 2 - 0.85, "up", "up"); const top = staff(w, 1.25); const disc = add(w, G.ringA, trim, 0, top + 0.08, 0); disc.scale.setScalar(0.9); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const r = add(w, G.ray, trim, Math.cos(a) * 0.15, top + 0.08 + Math.sin(a) * 0.15, 0); r.rotation.z = a - Math.PI / 2; } add(w, G.orb, glowM(0xffe08a), 0, top + 0.08, 0); break; }
  }
}
// 영웅 모습에도 등번호를 달 수 있어요 (CHAMPS 의 num: 가슴 · 등)
function champNum(CH, C) {
  if (!CH.num) return;
  const col = "#" + (CH.numCol ?? 0xffffff).toString(16).padStart(6, "0");
  C.put(GEO.human.patch, chestTex(CH.num, col), 0, 0.38, 0.215, C.torso).scale.setScalar(2.4);
  const bk = C.put(GEO.human.patch, chestTex(CH.num, col), 0, 0.3, -0.29, C.torso); bk.rotation.set(-0.15, Math.PI, 0); bk.scale.setScalar(3.4); // 망토 위에
}
function applyArmor(def, C) {
  { const CHh = champOf(def); if (CHh && typeof HERO !== "undefined" && HERO.armor(def, CHh, { ...C, mP: C.mk(0xffffff, 0.6) })) { champNum(CHh, C); return; } } // 조각한 영웅 갑옷 (hero.js)
  const { put, mk, head, torso, ud, OF } = C, A = armorGeo(), kit = (champOf(def) && champOf(def).kit) || ROLE_KIT[def.k] || "warrior";
  const main = OF.top ?? 0x445566, acc = OF.accent ?? 0xffffff;
  const dark = (hex, k = 0.55) => { const r = ((hex >> 16) & 255) * k, g = ((hex >> 8) & 255) * k, b = (hex & 255) * k; return (r << 16) | (g << 8) | b; };
  const CHm = champOf(def), steel = CHm && CHm.kit === "guard" ? champMetal(mk, CHm.metal) : mk(0x8f99a8, 0.3, { metalness: 0.85 }), darkSteel = mk(0x3e434e, 0.38, { metalness: 0.8 }), gold = mk(0xd8b45a, 0.28, { metalness: 0.9 });
  const leather = mk(0x5e4030, 0.75), leatherDark = mk(0x3a2a20, 0.8);
  const cloth = mk(dark(main, 0.8), 0.9), clothSide = { side: THREE.DoubleSide };
  const glow = (hex) => mk(hex, 0.2, { emissive: lin(hex), emissiveIntensity: 1.3 });
  const gemCol = COST_HEX[def.c] || 0x7fe6ff;
  const [shL, shR] = ud.arms, [elL, elR] = ud.elbows, [knL, knR] = ud.knees || [];
  // 어깨갑옷: 어깨 위에 얹고 바깥쪽으로 기울여요 (겹친 판 2장 + 테두리 + 가시)
  const pauldron = (sh, mat, trim, s = 1, spikes = 0) => {
    const side = sh.position.x < 0 ? -1 : 1, g2 = new THREE.Group(); g2.position.set(side * 0.02, 0.0, 0); g2.rotation.z = -side * 0.5; sh.add(g2);
    const p = put(A.pauldron, mat, 0, 0, 0, g2); p.scale.set(1.0 * s, 0.75 * s, 1.0 * s);
    const r = put(A.pauldronRim, trim, 0, 0.002, 0, g2); r.rotation.x = Math.PI / 2; r.scale.set(1.0 * s, 0.98 * s, 1);
    const p2 = put(A.pauldron, mat, side * 0.012, -0.05, 0, g2); p2.scale.set(0.95 * s, 0.6 * s, 0.95 * s);
    const r2 = put(A.pauldronRim, trim, side * 0.012, -0.048, 0, g2); r2.rotation.x = Math.PI / 2; r2.scale.set(0.95 * s, 0.93 * s, 0.7);
    for (let i = 0; i < spikes; i++) { const k = put(A.spike, trim, (i - (spikes - 1) / 2) * 0.045 * s, 0.085 * s, 0, g2); k.scale.setScalar(s * 0.9); k.rotation.z = (i - (spikes - 1) / 2) * -0.35; }
  };
  const bracers = (mat, trim) => { for (const el of [elL, elR]) { put(A.bracer, mat, 0, -0.16, 0, el); const r = put(A.ring, trim, 0, -0.1, 0, el); r.rotation.x = Math.PI / 2; } };
  const greaves = (mat, trim) => { if (!knL) return; for (const kn of [knL, knR]) { put(A.greave, mat, 0, -0.16, 0.004, kn); put(A.knee, trim, 0, 0.0, 0.02, kn).rotation.x = Math.PI / 2 - 0.3; } };
  const chestPlate = (mat, trim) => { const c = put(A.chest, mat, 0, 0.31, 0.005, torso); c.scale.set(0.96, 1.12, 0.7); const g2 = put(A.gorget, trim, 0, 0.57, 0, torso); g2.rotation.x = Math.PI / 2; g2.scale.set(1.15, 1.0, 1.4); put(A.gem, glow(gemCol), 0, 0.42, 0.15, torso).scale.set(1.2, 1.5, 0.8); };
  const capeOn = (mat) => { const c = new THREE.Mesh(A.cape, mat); c.position.set(0, 0.56, -0.13); c.rotation.x = 0.12; c.castShadow = true; torso.add(c); ud.cape = c; };
  const beltBuckle = (mat) => { const b = put(A.buckle, mat, 0, 0.13, 0.115, torso); b.rotation.x = Math.PI / 2; put(A.gem, glow(gemCol), 0, 0.13, 0.13, torso); };
  // 허리 아래로 늘어지는 천: 판타지 영웅 실루엣 (신은 따로)
  if (kit !== "god") {
    const flapM = kit === "guard" ? steel : mk(dark(main, 0.62), 0.85), trimM = kit === "guard" ? gold : mk(dark(acc === 0xffffff ? main : acc, 1), 0.6);
    for (const z of [0.105, -0.105]) { const f = put(A.tabard, flapM, 0, -0.07, z, torso); f.scale.set(kit === "guard" ? 0.9 : 0.75, 0.62, 1); f.rotation.x = z > 0 ? 0.08 : -0.08; const tr = put(A.tabard, trimM, 0, -0.225, z * 1.03, torso); tr.scale.set(kit === "guard" ? 0.92 : 0.77, 0.05, 1.2); }
    if (kit === "guard") for (const s of [-1, 1]) { const t = put(A.pauldron, steel, s * 0.14, 0.04, 0, torso); t.scale.set(0.95, 0.7, 1.0); t.rotation.z = s * 2.4; }
  }
  if (kit === "warrior" || kit === "ranger" || kit === "bard") { const pouch = put(A.buckle, leather, 0.14, 0.1, 0.07, torso); pouch.scale.set(1.0, 2.2, 1.0); pouch.rotation.set(Math.PI / 2, 0, 0.3); }
  if (kit === "guard" || kit === "god" || kit === "warrior") for (const el of [elL, elR]) { const gl2 = put(A.knee, kit === "god" ? gold : kit === "guard" ? steel : darkSteel, 0, -0.3, 0.0, el); gl2.scale.set(1.0, 1.05, 0.9); gl2.rotation.x = Math.PI; }
  switch (kit) {
    case "guard": {
      pauldron(shL, steel, gold, 1.15); pauldron(shR, steel, gold, 1.15);
      chestPlate(steel, gold); bracers(steel, gold); greaves(steel, gold); beltBuckle(gold);
      capeOn(mk(dark(main, 0.75), 0.85, clothSide));
      break;
    }
    case "warrior": {
      pauldron(shR, darkSteel, mk(dark(acc === 0xffffff ? main : acc, 0.9), 0.4, { metalness: 0.6 }), 1.25, 3);
      const strap = put(A.sash, leatherDark, 0, 0.36, 0.0, torso); strap.rotation.z = -0.7; strap.scale.set(1, 1, 9.5);
      put(A.bracer, leather, 0, -0.16, 0, elL); put(A.bracer, darkSteel, 0, -0.16, 0, elR);
      for (const el of [elL, elR]) for (let i = 0; i < 3; i++) { const w = put(A.wrap, mk(0xe8dcc0, 0.9), 0, -0.24 + i * 0.022, 0, el); w.rotation.x = Math.PI / 2; }
      beltBuckle(darkSteel);
      for (const s of [-1, 1]) for (let i = 0; i < 2; i++) { const p = put(A.paint, mk(0xa8242a, 0.8), s * 0.105, -0.03 - i * 0.025, 0.155, head); p.rotation.z = s * 0.25; }
      if (knL) for (const kn of [knL, knR]) put(A.knee, darkSteel, 0, 0, 0.02, kn).rotation.x = Math.PI / 2 - 0.3;
      break;
    }
    case "ranger": {
      const hood = put(A.hoodDown, cloth, 0, 0.58, -0.05, torso); hood.rotation.set(Math.PI / 2 + 0.5, 0, -Math.PI * 0.15); hood.scale.set(1.1, 1.0, 1.0);
      for (const sh of [shL, shR]) { const p = put(A.pauldron, leather, 0, 0.03, 0, sh); p.scale.set(1.15, 0.7, 1.05); }
      capeOn(mk(dark(main, 0.7), 0.9, clothSide)); ud.cape.scale.set(1.05, 0.62, 1);
      bracers(leather, leatherDark);
      const q = new THREE.Group(); q.position.set(0.08, 0.36, -0.17); q.rotation.set(0.15, 0, -0.45); torso.add(q);
      const qm = new THREE.Mesh(A.quiver, leatherDark); qm.castShadow = true; q.add(qm);
      for (let i = 0; i < 4; i++) { const sx = (i - 1.5) * 0.022; const sft = new THREE.Mesh(A.shaft, mk(0xc8a878, 0.7)); sft.position.set(sx, 0.26, (i % 2) * 0.015); q.add(sft); const f = new THREE.Mesh(A.fletch, mk(acc, 0.8)); f.position.set(sx, 0.34, (i % 2) * 0.015); q.add(f); }
      const strap = put(A.sash, leatherDark, 0, 0.36, 0.0, torso); strap.rotation.z = 0.65; strap.scale.set(0.6, 1, 9.5);
      break;
    }
    case "mage": {
      const m = put(A.mantle, mk(dark(main, 0.9), 0.85, clothSide), 0, 0.5, 0, torso); m.scale.set(1.12, 1, 0.78);
      // (망토 아랫단 금테는 빼요: 멀리서 보면 원반처럼 떠 보여서)
      const col = put(GEO.human.tallCollar, mk(dark(main, 0.7), 0.85, clothSide), 0, 0.6, -0.02, torso); col.scale.set(1.25, 1.6, 1.1);
      for (const s of [-1, 1]) put(A.gem, glow(acc === 0xf2f0ea || acc === 0xffffff ? 0xb48aff : acc), s * 0.085, 0.53, 0.1, torso);
      capeOn(mk(dark(main, 0.6), 0.85, clothSide)); ud.cape.scale.set(1.0, 0.95, 1);
      // 어깨 뒤에 떠 있는 마법 구슬
      const oc = acc === 0xf2f0ea || acc === 0xffffff ? 0xb48aff : acc, o = new THREE.Group(); o.position.set(0.3, 0.82, -0.2); o.scale.setScalar(0.8); torso.add(o);
      const orb = new THREE.Mesh(A.orb, glow(oc)); o.add(orb);
      const r = new THREE.Mesh(A.orbRing, gold); r.rotation.x = 1.2; o.add(r); ud.orb = o;
      bracers(mk(dark(main, 0.8), 0.7), gold);
      break;
    }
    case "bard": {
      const sash = put(A.sash, mk(acc, 0.8), 0, 0.34, 0.0, torso); sash.rotation.z = 0.7; sash.scale.set(1.1, 1, 9.5);
      const p = new THREE.Group(); p.position.set(-0.08, 0.5, -0.16); p.rotation.z = 0.12; torso.add(p);
      const pole = new THREE.Mesh(A.pole, gold); p.add(pole);
      const top = new THREE.Mesh(A.gem, glow(gemCol)); top.position.y = 0.5; top.scale.setScalar(1.4); p.add(top);
      const fl = new THREE.Mesh(A.banner, mk(main, 0.8, clothSide)); fl.position.set(0.14, 0.28, 0); p.add(fl); ud.banner = fl;
      for (const sh of [shL, shR]) { const pp = put(A.pauldron, mk(dark(main, 0.8), 0.7), 0, 0.03, 0, sh); pp.scale.set(1.15, 0.65, 1.05); const rr = put(A.pauldronRim, gold, 0, 0.03, 0, sh); rr.rotation.x = Math.PI / 2; rr.scale.set(1.15, 1.05, 1); }
      bracers(leather, gold);
      break;
    }
    case "monk": {
      const sash = put(A.sash, mk(acc === 0x111111 ? 0x1a1a1e : acc, 0.85), 0, 0.36, 0.0, torso); sash.rotation.z = 0.7; sash.scale.set(1.2, 1, 9.5);
      const beads = mk(0x6a3a22, 0.5); for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; const b = put(A.gem, beads, Math.sin(a) * 0.1, 0.5 - (1 - Math.cos(a)) * 0.07, 0.1 + Math.cos(a) * 0.02, torso); b.scale.setScalar(0.8); }
      for (const el of [elL, elR]) for (let i = 0; i < 5; i++) { const w = put(A.wrap, mk(0xe8dcc0, 0.9), 0, -0.26 + i * 0.024, 0, el); w.rotation.x = Math.PI / 2; }
      for (const sh of [shL, shR]) { const p = put(A.pauldron, mk(0xa8723a, 0.35, { metalness: 0.8 }), 0, 0.03, 0, sh); p.scale.set(0.95, 0.5, 0.95); }
      break;
    }
    case "assassin": {
      for (const sh of [shL, shR]) { const p = put(A.pauldron, leatherDark, 0, 0.03, 0, sh); p.scale.set(1.05, 0.6, 1.0); }
      bracers(leatherDark, mk(acc, 0.4, { emissive: lin(acc), emissiveIntensity: 0.6 }));
      for (let i = 0; i < 4; i++) { const k = put(A.spike, mk(0xc8ccd4, 0.2, { metalness: 0.9 }), -0.14 + i * 0.035, 0.08, 0.1, torso); k.rotation.x = Math.PI; k.scale.set(0.6, 0.9, 0.6); }
      const strap = put(A.sash, leatherDark, 0, 0.36, 0.0, torso); strap.rotation.z = -0.65; strap.scale.set(0.6, 1, 9.5);
      capeOn(mk(dark(main, 0.8), 0.9, clothSide)); ud.cape.scale.set(0.9, 0.85, 1);
      break;
    }
    case "juggernaut": {
      const hm = champMetal(mk, (champOf(def) || {}).metal);
      pauldron(shL, hm, mk(acc, 0.4, { metalness: 0.5 }), 1.45, 3); pauldron(shR, hm, mk(acc, 0.4, { metalness: 0.5 }), 1.45, 3);
      chestPlate(hm, mk(acc, 0.4, { metalness: 0.5 })); bracers(hm, mk(acc, 0.4)); greaves(hm, mk(acc, 0.4, { metalness: 0.5 }));
      for (let i = 0; i < 3; i++) { const k = put(A.spike, mk(acc, 0.4, { metalness: 0.5 }), (i - 1) * 0.06, 0.48, 0.15, torso); k.rotation.x = 0.5; }
      beltBuckle(hm);
      break;
    }
    case "god": {
      pauldron(shL, gold, mk(0xfff4d0, 0.3, { metalness: 0.6 }), 1.25, 0); pauldron(shR, gold, mk(0xfff4d0, 0.3, { metalness: 0.6 }), 1.25, 0);
      chestPlate(gold, mk(0xfff4d0, 0.3, { metalness: 0.6 })); bracers(gold, mk(0xfff4d0, 0.3)); greaves(gold, mk(0xfff4d0, 0.3, { metalness: 0.6 }));
      const t1 = put(A.tabard, mk(0xf6f2e6, 0.85), 0, -0.12, 0.11, torso); t1.rotation.x = 0.06;
      const t2 = put(A.tabard, mk(0xf6f2e6, 0.85), 0, -0.12, -0.11, torso); t2.rotation.x = -0.06;
      put(A.gem, glow(0xffe08a), 0, 0.13, 0.13, torso).scale.setScalar(1.6);
      capeOn(mk(0xf4ecd8, 0.8, clothSide));
      break;
    }
  }
}
function buildStudent(def, enemy) {
  const g = new THREE.Group(); g.rotation.order = "YXZ";
  const ud = g.userData; ud.mats = []; ud.walk = Math.random() * 6; ud.move = 0;
  const mk = (hex, rough = 0.75, extra) => { const m = toonMat(hex, extra); ud.mats.push(m); return m; }; // 만화 음영 재질 (figure.js)
  const put = (geo, mat, x = 0, y = 0, z = 0, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const h = nameHash(def.n);
  const sporty = def.t.includes("운동광"), nerd = def.t.includes("공부는 잘함"), soccer = def.t.includes("축구부");
  const kind = def.t.includes("다 퍼줌"), fierce = def.t.includes("지는 거 못 참음");
  const LK = lookOf(def, h);
  const skin = LK.skin, hairCol = LK.hc;
  // ----- 사람 비율(약 7등신) 캐릭터 -----
  // 발바닥 y=0.2, 엉덩이 관절 y=1.0, 어깨 y≈1.52, 머리 꼭대기 y≈1.86
  // 옷: friends.js 의 OUTFITS 표 (없으면 운동광은 체육복, 나머지는 교복)
  const CH = champOf(def), HB = CH ? 1.14 : 1, HA = CH ? 1.2 : 1; // 영웅은 어깨·팔·다리를 더 굵게
  const OF = (CH && { type: "tunic", top: CH.top, bottom: CH.bottom, accent: CH.accent }) || OUTFITS[def.n] || (sporty ? { type: "track", top: TRACK[(h >> 5) % TRACK.length], accent: 0xffffff } : { type: "uniform", top: 0x1f2a44, bottom: 0x343a44 });
  const T = OF.type, formal = ["uniform", "cardigan", "vest"].includes(T);
  const sleeve = OF.sleeve || ({ jersey: "short", tshirt: "short", tank: "none" }[T] || "long");
  const hero = !def.plain, shorts = !hero && ["jersey", "tank"].includes(T), barefoot = T === "dobok";
  const fab = (hex, r = 0.92) => mk(hex, r);
  const mSkin = mk(skin, 0.62);
  const mJacket = fab(OF.top, T === "padding" ? 0.55 : T === "track" ? 0.7 : 0.9), mPants = fab(OF.bottom ?? OF.top);
  const mAcc = fab(OF.accent ?? 0xffffff, 0.8);
  const mShirt = fab(0xf2f0ea, 0.8), mHair = mk(hairCol, 0.55);
  const mSleeve = T === "vest" ? mShirt : T === "varsity" ? mAcc : mJacket;
  const mShoe = barefoot ? mSkin : T === "robe" ? mk(0xd8a83a, 0.35, { metalness: 0.5 }) : formal ? mk(0x1d1814, 0.35) : hero ? mk(0x4a3224, 0.6) : mk(0xf2f2f2, 0.6);
  const mSole = mk(formal || hero ? 0x1a1410 : COST_HEX[def.c] || 0xcccccc, 0.8), mSock = fab(OF.socks ?? (formal ? 0x22252b : 0xf4f4f4));
  const mDark = mk(0x1c1410, 0.3), mWhite = mk(0xffffff, 0.3);
  const mLip = mk(0xb5675e, 0.55), mBrow = mk(hairCol, 0.8), mIris = mk([0x3a2414, 0x2a1a10, 0x4a3020][h % 3], 0.2);
  const mStripe = fab(0xf4f4f4, 0.7), mCost = fab(COST_HEX[def.c] || 0xc9d1cc, 0.6);
  // 팀 표시 고리
  const rm = new THREE.MeshBasicMaterial({ color: lin(enemy ? 0xff5a4a : 0x5ae0a0), transparent: true, opacity: 0.9 });
  ud.mats.push(rm);
  const ring = new THREE.Mesh(GEO.teamRing, rm); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.21; g.add(ring);
  const HG = GEO.human || (GEO.human = {
    thigh: new THREE.CylinderGeometry(0.09, 0.072, 0.36, 14), shin: new THREE.CylinderGeometry(0.07, 0.056, 0.36, 14),
    knee: new THREE.SphereGeometry(0.07, 12, 8), sock: new THREE.CylinderGeometry(0.054, 0.054, 0.06, 10),
    shoe: new THREE.SphereGeometry(0.06, 14, 10), sole: new THREE.BoxGeometry(0.11, 0.025, 0.27),
    pelvis: new THREE.CylinderGeometry(0.15, 0.14, 0.17, 16), belt: new THREE.CylinderGeometry(0.152, 0.152, 0.035, 16), buckle: new THREE.BoxGeometry(0.05, 0.035, 0.012),
    chest: new THREE.LatheGeometry([[0, 0], [0.142, 0], [0.148, 0.08], [0.158, 0.2], [0.178, 0.31], [0.19, 0.38], [0.172, 0.43], [0.1, 0.46], [0, 0.465]].map(([x, y]) => new THREE.Vector2(x, y)), 20),
    lapel: new THREE.BoxGeometry(0.05, 0.2, 0.012), button: new THREE.SphereGeometry(0.011, 8, 6), collar: new THREE.TorusGeometry(0.058, 0.016, 6, 16),
    neck: new THREE.CylinderGeometry(0.056, 0.062, 0.11, 12), delt: new THREE.SphereGeometry(0.084, 14, 10),
    upper: new THREE.CylinderGeometry(0.07, 0.06, 0.3, 14), fore: new THREE.CylinderGeometry(0.061, 0.05, 0.26, 14), cuff: new THREE.CylinderGeometry(0.055, 0.055, 0.035, 12),
    palm: new THREE.SphereGeometry(0.054, 12, 10), thumb: new THREE.CylinderGeometry(0.016, 0.014, 0.06, 6),
    skull: (() => { // 아래로 갈수록 좁아지는 얼굴 (턱·광대)
      const g2 = new THREE.SphereGeometry(0.2, 28, 20), p2 = g2.attributes.position;
      for (let i = 0; i < p2.count; i++) {
        const x = p2.getX(i), y = p2.getY(i), z = p2.getZ(i), lo = Math.max(0, -y / 0.2), front = Math.max(0, z / 0.2);
        p2.setX(i, x * (1 - 0.3 * lo * lo) * (1 - 0.06 * front));
        p2.setY(i, y * (y < 0 ? 1.12 : 1));
        p2.setZ(i, z * (1 - 0.12 * lo) + 0.018 * lo * front);
      }
      g2.computeVertexNormals(); return g2;
    })(),
    noseTip: new THREE.SphereGeometry(0.024, 12, 10), nose: new THREE.ConeGeometry(0.022, 0.075, 10),
    lip: new THREE.SphereGeometry(0.03, 14, 10), lash: new THREE.TorusGeometry(0.036, 0.006, 4, 12, Math.PI),
    stripe: new THREE.BoxGeometry(0.012, 1, 0.012),
    shortLeg: new THREE.CylinderGeometry(0.1, 0.094, 0.2, 12), longSock: new THREE.CylinderGeometry(0.064, 0.057, 0.22, 12),
    shortSleeve: new THREE.CylinderGeometry(0.08, 0.075, 0.15, 12), hood: new THREE.SphereGeometry(0.13, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    pocket: new THREE.BoxGeometry(0.17, 0.08, 0.018), string: new THREE.CylinderGeometry(0.005, 0.005, 0.11, 6),
    tallCollar: new THREE.CylinderGeometry(0.078, 0.085, 0.09, 14, 1, true), quilt: new THREE.TorusGeometry(0.163, 0.007, 4, 24),
    patch: new THREE.PlaneGeometry(0.1, 0.1), beltTail: new THREE.BoxGeometry(0.028, 0.12, 0.01),
    skirt: new THREE.CylinderGeometry(0.15, 0.27, 0.62, 18, 1, true), sash: new THREE.BoxGeometry(0.06, 0.48, 0.25),
  });
  // 다리: 엉덩이 → 허벅지 → 무릎 → 정강이 → 양말 → 신발
  ud.legs = []; ud.knees = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * (CH ? 0.088 : 0.078), 1.0, 0); g.add(hip);
    if (shorts) { put(HG.thigh, mSkin, 0, -0.19, 0, hip).scale.set(0.92, 1, 0.92); put(HG.shortLeg, mPants, 0, -0.1, 0, hip); }
    else put(HG.thigh, mPants, 0, -0.17, 0, hip).scale.set(HB, 1, HB);
    const knee = new THREE.Group(); knee.position.y = -0.35; hip.add(knee);
    put(HG.knee, shorts ? mSkin : mPants, 0, 0, 0.004, knee).scale.set(shorts ? 0.88 : 1, 0.8, shorts ? 0.88 : 1);
    put(HG.shin, shorts ? mSkin : mPants, 0, -0.18, 0, knee).scale.set(shorts ? 0.88 : HB, 1, shorts ? 0.88 : HB);
    if (T === "track") { const st = put(HG.stripe, mAcc, s * 0.06, -0.18, 0, knee); st.scale.y = 0.34; const st2 = put(HG.stripe, mAcc, s * 0.07, 0.18, 0, knee); st2.scale.y = 0.34; }
    if (T === "dobok") put(HG.shin, mPants, 0, -0.2, 0, knee).scale.set(1.25, 0.95, 1.25); // 넓은 도복 바지
    if (OF.socks) put(HG.longSock, mSock, 0, -0.27, 0, knee); // 축구 양말
    else if (!barefoot) put(HG.sock, mSock, 0, -0.37, 0, knee);
    put(HG.shoe, mShoe, 0, -0.415, 0.045, knee).scale.set(hero && !barefoot ? 1.2 : 0.95, barefoot ? 0.45 : hero ? 0.75 : 0.62, barefoot ? 1.8 : 2.1);
    if (hero && !barefoot && !(CH && typeof HERO !== "undefined")) { // 정강이까지 오는 부츠 + 접힌 윗단 (조각 영웅은 hero.js 가 따로)
      const bootM = T === "robe" ? mShoe : mk(0x5a3c28, 0.65);
      put(HG.shin, bootM, 0, -0.28, 0, knee).scale.set(1.12, 0.48, 1.12);
      const top = put(HG.cuff, mk(0x7a5434, 0.7), 0, -0.19, 0, knee); top.scale.set(1.55, 1.6, 1.55);
    }
    if (!barefoot) put(HG.sole, T === "robe" ? mShoe : mSole, 0, -0.448, 0.045, knee);
    ud.legs.push(hip); ud.knees.push(knee);
  }
  // 몸통 (엉덩이 높이에서 시작)
  const torso = new THREE.Group(); torso.position.y = 1.0; g.add(torso); ud.torso = torso;
  put(HG.pelvis, mPants, 0, 0.03, 0, torso).scale.z = 0.72;
  const chest = put(HG.chest, mJacket, 0, 0.12, 0, torso); chest.scale.set(CH ? 1.32 : 1.16, CH ? 1.04 : 1.02, CH ? 0.8 : 0.7);
  if (T === "padding") chest.scale.set(1.12, 1.02, 0.74);
  if (T === "tank") chest.scale.set(0.95, 1, 0.62);
  if (formal) {
    put(HG.belt, mk(0x1a1410, 0.4), 0, 0.12, 0, torso).scale.z = 0.73;
    put(HG.buckle, mk(0xb8b8b8, 0.3, { metalness: 0.8 }), 0, 0.12, 0.112, torso);
    // 셔츠 V, 넥타이(코스트 색)
    const v = put(GEO.shirtV, mShirt, 0, 0.47, 0.105, torso); v.rotation.x = Math.PI; v.scale.set(0.85, 1.05, 0.3);
    const tie = put(GEO.tie, mCost, 0, 0.42, 0.122, torso); tie.scale.set(0.75, 0.95, 0.6); tie.rotation.x = -0.12;
    put(HG.collar, mShirt, 0, 0.585, 0.004, torso).rotation.x = Math.PI / 2;
    if (T === "uniform") { // 재킷 깃과 단추
      for (const s of [-1, 1]) { const l = put(HG.lapel, mJacket, s * 0.05, 0.47, 0.112, torso); l.rotation.set(-0.12, 0, s * 0.42); }
      for (const y of [0.24, 0.32]) put(HG.button, mk(0x0e1220, 0.4), 0.018, y, 0.118, torso);
    } else { // 카디건·조끼: 가운데 단추 줄, 아랫단
      for (const y of [0.18, 0.25, 0.32]) put(HG.button, mk(0xe8e0c8, 0.4), 0.012, y, 0.116, torso);
      put(HG.belt, mJacket, 0, 0.14, 0, torso).scale.set(1.04, 1.4, 0.72);
    }
  } else if (T === "track") { // 체육복: 지퍼, 깃
    const z = put(GEO.zip, mWhite, 0, 0.36, 0.123, torso); z.scale.set(0.6, 1.05, 0.6);
    put(HG.collar, mJacket, 0, 0.585, 0.004, torso).rotation.x = Math.PI / 2;
  } else if (T === "hoodie") { // 후드티: 모자, 앞주머니, 끈
    const hood = put(HG.hood, mJacket, 0, 0.56, -0.07, torso); hood.scale.set(1.15, 0.85, 0.9); hood.rotation.x = -0.5;
    put(HG.pocket, mJacket, 0, 0.24, 0.118, torso);
    for (const s of [-1, 1]) put(HG.string, mAcc, s * 0.035, 0.5, 0.118, torso);
    put(HG.belt, mJacket, 0, 0.13, 0, torso).scale.set(1.02, 1.6, 0.7);
  } else if (T === "padding") { // 패딩: 높은 깃, 누빔 줄, 지퍼
    const col = put(HG.tallCollar, mJacket, 0, 0.585, 0, torso); col.scale.z = 0.9;
    for (const y of [0.22, 0.32, 0.42]) { const r = put(HG.quilt, mk(0x0c0e12, 0.6), 0, y, 0, torso); r.rotation.x = Math.PI / 2; r.scale.set(1.1 - (y - 0.22) * 0.1, 0.78, 1); }
    put(GEO.zip, mAcc, 0, 0.36, 0.142, torso).scale.set(0.6, 1.05, 0.6);
  } else if (T === "varsity") { // 야구 점퍼: 줄무늬 깃·밑단, 가슴 글자
    put(HG.collar, mAcc, 0, 0.585, 0.004, torso).rotation.x = Math.PI / 2;
    put(HG.belt, mAcc, 0, 0.135, 0, torso).scale.set(1.04, 1.3, 0.72);
    for (const y of [0.22, 0.29, 0.36]) put(HG.button, mAcc, 0.012, y, 0.116, torso);
    put(HG.patch, chestTex(def.n[def.n.length - 1], "#f2e6c8", "#b8323a"), -0.075, 0.38, 0.113, torso);
  } else if (T === "jersey" || T === "tank") { // 운동 유니폼: 목둘레 선, 번호
    const nk = put(HG.collar, mAcc, 0, 0.575, 0.01, torso); nk.rotation.x = Math.PI / 2; nk.scale.set(1.1, 1.1, 0.6);
    if (OF.num) { put(HG.patch, chestTex(OF.num, OF.accent ? "#" + OF.accent.toString(16).padStart(6, "0") : "#ffffff"), 0, 0.33, 0.116, torso).scale.setScalar(1.15); const bk = put(HG.patch, chestTex(OF.num, OF.accent ? "#" + OF.accent.toString(16).padStart(6, "0") : "#ffffff"), 0, 0.35, -0.106, torso); bk.rotation.y = Math.PI; bk.scale.setScalar(1.6); }
    if (OF.print) put(HG.patch, chestTex(OF.print, "#" + (OF.accent ?? 0xffffff).toString(16).padStart(6, "0")), 0, 0.33, 0.116, torso).scale.setScalar(1.1);
    const hem = put(HG.belt, mAcc, 0, 0.175, 0, torso); hem.scale.set(1.06, 0.6, 0.72); // 반바지 허리띠
  } else if (T === "tshirt") { // 티셔츠: 목둘레, 가슴 그림
    const nk = put(HG.collar, mJacket, 0, 0.58, 0.004, torso); nk.rotation.x = Math.PI / 2;
    if (OF.print) put(HG.patch, chestTex(OF.print, "#" + (OF.accent ?? 0x333333).toString(16).padStart(6, "0")), 0, 0.33, 0.116, torso).scale.setScalar(1.3);
    put(HG.belt, mk(0x2a2016, 0.5), 0, 0.12, 0, torso).scale.z = 0.73;
  } else if (T === "dobok") { // 도복: 여밈 깃, 검은 띠와 매듭
    for (const s of [-1, 1]) { const l = put(HG.lapel, mAcc, s * 0.04, 0.46, 0.112, torso); l.rotation.set(-0.12, 0, s * 0.6); l.scale.set(0.7, 1.25, 1); }
    put(HG.belt, mAcc, 0, 0.16, 0, torso).scale.set(1.04, 1.4, 0.73);
    for (const s of [-1, 1]) { const tl = put(HG.beltTail, mAcc, s * 0.03, 0.08, 0.112, torso); tl.rotation.z = s * 0.25; }
    put(HG.collar, mJacket, 0, 0.585, 0.004, torso).rotation.x = Math.PI / 2;
  } else if (T === "tunic" && CH && typeof HERO !== "undefined") { // 조각 영웅: 깃·허리띠·자락은 hero.js 가 만들어요
    const nk = put(HG.collar, mJacket, 0, 0.585, 0.004, torso); nk.rotation.x = Math.PI / 2; nk.scale.set(1.25, 1.25, 1.4);
  } else if (T === "tunic") { // 영웅 튜닉: 겹친 깃, 가죽 허리띠, 금 버클 (긴 코트면 뒤로 갈라진 자락)
    const mLap = mk(((OF.top >> 16 & 255) * 0.6) << 16 | ((OF.top >> 8 & 255) * 0.6) << 8 | (OF.top & 255) * 0.6, 0.85);
    for (const s of [-1, 1]) { const l = put(HG.lapel, mLap, s * 0.042, 0.47, 0.113, torso); l.rotation.set(-0.12, 0, s * 0.5); l.scale.set(0.9, 1.0, 1); }
    put(HG.belt, mk(0x3a2a20, 0.6), 0, 0.12, 0, torso).scale.set(1.06, 1.6, 0.76);
    put(HG.buckle, mk(0xd8b45a, 0.28, { metalness: 0.9 }), 0, 0.12, 0.118, torso).scale.set(1.2, 1.4, 1);
    const nk = put(HG.collar, mJacket, 0, 0.585, 0.004, torso); nk.rotation.x = Math.PI / 2; nk.scale.set(1.1, 1.1, 1.4);
    if (CH && CH.coat) for (const s of [-1, 1]) { const c = put(champGeo().tabardLong, mJacket, s * 0.075, -0.17, -0.05, torso); c.rotation.set(-0.08, s * 0.3, s * 0.06); c.scale.set(1, 1, 1); const c2 = put(champGeo().tabardLong, mJacket, s * 0.13, -0.15, 0.06, torso); c2.rotation.set(0.05, s * 1.0, s * 0.05); c2.scale.set(0.8, 0.95, 1); }
  } else if (T === "robe") { // 신의 로브: 긴 치마, 금빛 띠와 테두리
    const sash = put(HG.sash, mAcc, 0, 0.32, 0, torso); sash.rotation.z = 0.75; sash.scale.z = 0.68;
    put(HG.belt, mAcc, 0, 0.13, 0, torso).scale.set(1.05, 1.2, 0.74);
    const tr = put(HG.collar, mAcc, 0, 0.585, 0.004, torso); tr.rotation.x = Math.PI / 2; tr.scale.set(1.15, 1.15, 0.8);
  }
  if (kind && !CH) put(GEO.pin, mk(0xff7aa8, 0.4), 0.085, 0.45, 0.108, torso).scale.setScalar(0.7);
  put(HG.neck, mSkin, 0, 0.615, 0, torso);
  // 머리 (머리 모양 데이터는 반지름 0.2 기준이라 0.6배로 줄여 써요)
  const head = new THREE.Group(); head.position.y = 0.735; head.scale.setScalar(0.6 * LK.head * (CH ? 0.9 : 1)); torso.add(head); ud.head = head;
  put(HG.skull, mSkin, 0, 0.0, -0.005, head).scale.set(SKULL_SX, SKULL_SY, SKULL_SZ);
  for (const s of [-1, 1]) put(GEO.ear, mSkin, s * 0.178, -0.005, -0.01, head).scale.set(0.45, 0.85, 0.75);
  // 얼굴: 눈·눈썹·코·입은 그림으로 그려 씌워요 (figure.js). 눈 깜빡임은 그림 두 장을 바꿔 끼워요
  if (SHOW_FACE) { // figure.js 의 SHOW_FACE 를 false 로 두면 얼굴 없이 나와요
    const irisHex = [0x3a2414, 0x2a1a10, 0x4a3020][h % 3];
    ud.faceTex = faceTexFor(def, LK, LK.hero ? true : fierce, LK.hero ? false : kind, hairCol, irisHex, skin);
    ud.face = faceMesh(ud.faceTex); head.add(ud.face); ud.mats.push(ud.face.material);
  }
  // 머리카락 (friends.js 의 LOOKS.hair 모양대로, figure.js)
  buildHair2(LK.hair, { put, head, mHair, mTip: LK.tip != null ? mk(LK.tip, 0.5) : mHair });
  if (def.t.includes("프로게이머")) {
    const hs = mk(0x26282c, 0.4, { metalness: 0.3 }), led = mk(0x7ff0ff, 0.3, { emissive: lin(0x3fd8ff) });
    put(new THREE.TorusGeometry(0.255, 0.022, 8, 24, Math.PI), hs, 0, 0.02, 0, head);
    for (const s2 of [-1, 1]) { const cup = put(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 16), hs, s2 * 0.24, 0, 0, head); cup.rotation.z = Math.PI / 2; put(GEO.pin, led, s2 * 0.275, 0, 0, head).scale.setScalar(0.6); }
  }
  if (def.t.includes("전교 1등")) {
    put(new THREE.BoxGeometry(0.04, 0.1, 0.008), mk(0xc8323a, 0.6), -0.07, 0.45, 0.11, torso);
    const md = put(new THREE.CylinderGeometry(0.036, 0.036, 0.012, 20), mk(0xffd24a, 0.25, { metalness: 0.85 }), -0.07, 0.385, 0.115, torso); md.rotation.x = Math.PI / 2;
  }
  if (nerd && !(typeof LOOKS !== "undefined" && LOOKS[def.n]) && !LK.acc.some((a) => a[0] === "glasses")) LK.acc = [...LK.acc, ["glasses", "plain", 0x222222]];
  // 팔: 어깨 → 위팔 → 팔꿈치(살짝 굽힘) → 아래팔 → 소매 끝 → 손
  ud.arms = []; ud.elbows = []; const grip = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * (CH ? 0.252 : 0.215), 0.5, 0); torso.add(sh);
    const armSkin = sleeve !== "long";
    put(HG.delt, sleeve === "none" ? mSkin : mSleeve, 0, -0.01, 0, sh).scale.set(HA, 0.95 * HA, 0.9 * HA);
    put(HG.upper, armSkin ? mSkin : mSleeve, 0, -0.15, 0, sh).scale.set((armSkin ? 0.9 : 1) * HA, 1, (armSkin ? 0.9 : 1) * HA);
    if (sleeve === "short") put(HG.shortSleeve, mSleeve, 0, -0.07, 0, sh); // 반팔 소매
    if (T === "track") { const st = put(HG.stripe, mAcc, s * 0.055, -0.15, 0, sh); st.scale.y = 0.28; }
    const el = new THREE.Group(); el.position.y = -0.3; el.rotation.x = -0.22; sh.add(el);
    put(HG.fore, armSkin ? mSkin : mSleeve, 0, -0.13, 0, el).scale.set((armSkin ? 0.88 : T === "padding" ? 1.15 : 1) * HA, 1, (armSkin ? 0.88 : T === "padding" ? 1.15 : 1) * HA);
    if (T === "track") { const st = put(HG.stripe, mAcc, s * 0.047, -0.12, 0, el); st.scale.y = 0.22; }
    if (!armSkin) put(HG.cuff, formal ? mShirt : T === "varsity" ? mJacket : T === "robe" ? mAcc : mSleeve, 0, -0.265, 0, el);
    put(HG.palm, mSkin, 0, -0.3, 0.004, el).scale.set(0.82 * HA, 1.15 * HA, 0.55 * HA);
    const th = put(HG.thumb, mSkin, -s * 0.025, -0.29, 0.025, el); th.rotation.set(0.5, 0, s * 0.4);
    // 무기는 예전 손 높이(-0.39)·예전 몸 크기 기준이라, 80%로 줄이고 그 높이가 새 손(-0.3)에 오도록 맞춘 자리
    const gp = new THREE.Group(); gp.scale.setScalar(0.8); gp.position.y = -0.3 + 0.39 * 0.8; el.add(gp); grip.push(gp);
    ud.arms.push(sh); ud.elbows.push(el);
  }
  applyLook(LK, { put, mk, head, torso, ud, def, mHair });
  if (CH) buildChampHead(CH, { put, mk, head, mHair });
  if (!def.plain) applyArmor(def, { put, mk, head, torso, ud, OF });
  ud.restZ = [-0.07, 0.07];
  const [L, R] = grip;
  const WP = WEAPONS[def.n];
  if (CH && CH.weapon) buildChampWeapon(CH, { L, R, mk, ud });
  else if (WP) WP.build({ put, mk, L, R, torso, ud, g, def });
  if (((!WP && !(CH && CH.weapon)) || def.k === "신") && !ud.divine) switch (def.k) {
    case "수호자": {
      const sd = put(GEO.shield, mk(0xb8c4bc, 0.35, { metalness: 0.7 }), -0.1, -0.3, 0.06, L); sd.rotation.z = Math.PI / 2;
      put(GEO.boss, mk(COST_HEX[def.c], 0.4, { metalness: 0.5 }), -0.14, -0.3, 0.06, L);
      break;
    }
    case "돌격대": { const b = put(GEO.bat, mk(0xc89a5c, 0.5), 0, -0.45, 0.24, R); b.rotation.x = Math.PI / 2.4; break; }
    case "저격수": {
      const mw = mk(0x7a5232, 0.6);
      const hd = put(GEO.handle, mw, 0, -0.45, 0.08, R); hd.rotation.x = 0.4;
      for (const s of [-1, 1]) { const p = put(GEO.prong, mw, s * 0.04, -0.37, 0.14, R); p.rotation.set(0.4, 0, -s * 0.35); }
      break;
    }
    case "천재": {
      const pg = mk(0xf6f2e6, 0.8), cvr = mk(0x8a5cd0, 0.6);
      for (const s of [-1, 1]) { const p = put(GEO.page, pg, s * 0.09, -0.44, 0.12, L); p.rotation.z = s * 0.25; }
      put(GEO.page, cvr, 0, -0.455, 0.12, L).scale.set(2.05, 0.6, 1.05);
      break;
    }
    case "응원단": {
      const pm = mk(COST_HEX[def.c] || 0xffcc4d, 0.6, { flatShading: true });
      put(GEO.pom, pm, 0, -0.45, 0.02, L); put(GEO.pom, pm, 0, -0.45, 0.02, R);
      break;
    }
    case "신": { // 머리 위 금빛 후광 + 금 목걸이
      const gm = mk(0xffd86b, 0.25, { metalness: 0.6, emissive: lin(0xffb020), emissiveIntensity: 0.9 });
      const halo = put(new THREE.TorusGeometry(0.17, 0.022, 8, 32), gm, 0, 0.36, -0.03, ud.head); halo.rotation.x = Math.PI / 2 - 0.2;
      put(GEO.pin, gm, 0, 0.47, 0.11, torso).scale.setScalar(1.2);
      break;
    }
  }
  bakeFigure(g, ud); // 작은 부품을 마디마다 한 덩어리로 합치고 외곽선을 붙여요 (figure.js)
  // 키·체격: 발밑 고리만 빼고 몸 전체를 한 묶음으로 늘리거나 줄여요
  const BK = ud.bodyK || 1, body = new THREE.Group(); body.scale.set(LK.wide * BK, LK.tall * BK, LK.wide * BK); // 신(5코스트)은 한층 크게
  for (const ch of g.children.slice()) if (ch !== ring) body.add(ch);
  body.position.y = 0.2 * (1 - LK.tall * BK); g.add(body);
  return g;
}
function buildMonster(mon, enemy) {
  const g = new THREE.Group(); g.rotation.order = "YXZ";
  const ud = g.userData; ud.mats = []; ud.walk = Math.random() * 6; ud.move = 0;
  const mk = (hex, rough = 0.7) => { const m = M(hex, rough); ud.mats.push(m); return m; };
  const put = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  const rm = new THREE.MeshBasicMaterial({ color: lin(enemy ? 0xff5a4a : 0x5ae0a0), transparent: true, opacity: 0.9 }); ud.mats.push(rm);
  const ring = new THREE.Mesh(GEO.teamRing, rm); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.21; g.add(ring);
  const tex = paperTex(mon.mn);
  if (mon.boss) {
    const side = mk(0xf2eee2, 0.9), front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), cover = mk(mon.col, 0.6);
    ud.mats.push(front);
    put(GEO.bookBox, [side, side, cover, cover, front, cover], 0, 1.05, 0);
  } else {
    const pm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide }); ud.mats.push(pm);
    put(GEO.paper, pm, 0, 1.0, 0);
  }
  const mDark = mk(0x1c1410, 0.3), mWhite = mk(0xffffff, 0.3), limb = mk(0x24302a, 0.6);
  const fz = mon.boss ? 0.17 : 0.06;
  for (const s of [-1, 1]) {
    put(GEO.sclera, mWhite, s * 0.16, 1.28, fz).scale.set(1.3, 1.3, 0.5);
    put(GEO.iris, mDark, s * 0.15, 1.27, fz + 0.025);
    const b = put(GEO.brow, mDark, s * 0.16, 1.37, fz + 0.01); b.rotation.z = s * 0.4; b.scale.x = 1.4;
    const l = put(GEO.limb, limb, s * 0.22, 0.38, 0); ud[s < 0 ? "lLeg" : "rLeg"] = l;
    const a = put(GEO.limb, limb, s * (mon.boss ? 0.6 : 0.5), 1.0, 0); a.rotation.z = s * 0.9;
  }
  return g;
}
// 발밑에 부드러운 그림자 얼룩: 캐릭터가 바닥에 딱 붙어 보여요
let CONTACT = null;
// ----- 이다연 (김예균의 소환수): 말랑말랑 빛나는 젤리 -----
// 반투명 청록 젤리 몸 + 안에서 빛나는 핵 + 아래로 처진 방울 + 동그란 눈. 거대 이다연은 수정 왕관을 써요.
let JELLY_GEO = null;
function buildJelly(giant, enemy) {
  const J = JELLY_GEO || (JELLY_GEO = {
    body: (() => { const g = new THREE.SphereGeometry(0.42, 32, 22), p = g.attributes.position; // 아래가 퍼지고 위가 살짝 뾰족한 물방울 모양
      for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = y < 0 ? 1 + (-y / 0.42) * 0.18 : 1 - (y / 0.42) * 0.12; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); if (y < -0.25) p.setY(i, -0.25 - (-0.25 - y) * 0.35); }
      g.computeVertexNormals(); return g; })(),
    drop: new THREE.SphereGeometry(0.11, 14, 10), core: new THREE.OctahedronGeometry ? new THREE.OctahedronGeometry(0.12) : new THREE.SphereGeometry(0.11, 6, 4),
    tip: new THREE.ConeGeometry(0.07, 0.2, 12), eye: new THREE.SphereGeometry(0.075, 16, 12), pupil: new THREE.SphereGeometry(0.042, 12, 10), shine: new THREE.SphereGeometry(0.016, 8, 6),
    mouth: new THREE.TorusGeometry(0.04, 0.011, 6, 14, Math.PI), crown: new THREE.TorusGeometry(0.2, 0.025, 8, 24), gem: new THREE.OctahedronGeometry ? new THREE.OctahedronGeometry(0.06) : new THREE.SphereGeometry(0.06, 6, 4),
    gloss: new THREE.SphereGeometry(0.1, 12, 8),
  });
  const g = new THREE.Group(); g.rotation.order = "YXZ";
  const ud = g.userData; ud.mats = []; ud.jellyMats = []; ud.walk = Math.random() * 6; ud.move = 0;
  const mk = (hex, rough, extra) => { const m = M(hex, rough, extra); ud.mats.push(m); return m; };
  const jm = (hex, op, extra) => { const m = new THREE.MeshStandardMaterial({ color: lin(hex), roughness: 0.12, metalness: 0.05, transparent: true, opacity: op, ...extra }); m.userData.op = op; ud.jellyMats.push(m); return m; };
  const rm = new THREE.MeshBasicMaterial({ color: lin(enemy ? 0xff5a4a : 0x5ae0a0), transparent: true, opacity: 0.9 }); ud.mats.push(rm);
  const ring = new THREE.Mesh(GEO.teamRing, rm); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.21; g.add(ring);
  const jelly = new THREE.Group(); jelly.position.y = 0.2; g.add(jelly); ud.jelly = jelly;
  const put = (geo, mat, x, y, z, parent = jelly) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const skin = jm(giant ? 0x4fe0cc : 0x86f6e4, 0.72, { emissive: lin(giant ? 0x14807a : 0x1aa090), emissiveIntensity: 0.6 });
  const body = put(J.body, skin, 0, 0.36, 0); body.castShadow = true;
  // 몸 안에서 빛나는 핵 (천천히 돌아요)
  const core = put(J.core, mk(0xc8fff4, 0.2, { emissive: lin(0x7ff0e0), emissiveIntensity: 1.6 }), 0, 0.2, -0.12); core.scale.set(0.75, 1.0, 0.75); ud.core = core;
  // 바닥에 처진 젤리 방울
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + 0.3; const d = put(J.drop, skin, Math.cos(a) * 0.32, 0.07, Math.sin(a) * 0.3); d.scale.set(1.35, 0.6, 1.35); }
  // 머리 위 말랑한 꼭지
  const tip = put(J.tip, skin, 0.03, 0.74, -0.02); tip.rotation.z = -0.35;
  // 반짝이는 하이라이트
  put(J.gloss, mk(0xffffff, 0.1, { emissive: lin(0xffffff), emissiveIntensity: 0.6, transparent: true, opacity: 0.75 }), -0.17, 0.56, 0.24).scale.set(1.0, 0.55, 0.35);
  // 얼굴
  const mWhite = mk(0xffffff, 0.25), mDark = mk(0x0e2a2a, 0.3);
  ud.eyes = [];
  for (const s of [-1, 1]) {
    const e = put(J.eye, mWhite, s * 0.13, 0.42, 0.385); e.scale.set(1, 1.15, 0.5);
    const p = put(J.pupil, mDark, s * 0.13, 0.41, 0.415); p.scale.set(1, 1.2, 0.45);
    const sh = put(J.shine, mWhite, s * 0.13 + 0.018, 0.44, 0.432);
    for (const o of [e, p, sh]) { o.userData.sy = o.scale.y; ud.eyes.push(o); }
  }
  const mo = put(J.mouth, mDark, 0, 0.29, 0.415); mo.rotation.z = Math.PI; mo.scale.set(1, 0.8, 1);
  if (giant) { // 거대 이다연: 수정 왕관
    const gold = mk(0xe8c25a, 0.25, { metalness: 0.85 }), crys = mk(0x9ffff0, 0.15, { emissive: lin(0x5fe8d8), emissiveIntensity: 1.3 });
    const cr = put(J.crown, gold, 0, 0.68, 0); cr.rotation.x = Math.PI / 2;
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + Math.PI / 2; const gm = put(J.gem, crys, Math.cos(a) * 0.2, 0.76, Math.sin(a) * 0.2); gm.scale.set(0.8, i === 0 ? 2.2 : 1.6, 0.8); }
    tip.visible = false;
  }
  return g;
}
function buildUnit(sp, enemy) {
  const g = buildUnit0(sp, enemy);
  if (!CONTACT) CONTACT = { geo: new THREE.CircleGeometry(0.62, 24), mat: new THREE.MeshBasicMaterial({ map: softTex("rgba(4,6,14,.7)", "rgba(4,6,14,0)"), transparent: true, depthWrite: false }) };
  const sh = new THREE.Mesh(CONTACT.geo, CONTACT.mat); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.205; sh.scale.setScalar(sp.mon && sp.mon.boss ? 1.6 : sp.robot ? 1.5 : 1); g.add(sh);
  return g;
}
function buildUnit0(sp, enemy) {
  if (sp.robot) return buildRobot(enemy, !!sp.mega);
  if (sp.mon && sp.mon.summon) {
    const g = buildJelly(!!sp.mon.giant, enemy);
    const aura = new THREE.Mesh(GEO.ringFx, additive("#7ff0e0")); aura.rotation.x = -Math.PI / 2; aura.position.y = 0.24; aura.scale.setScalar(0.7); g.add(aura);
    return g;
  }
  return sp.mon ? buildMonster(sp.mon, enemy) : buildStudent(DEFS[sp.d], enemy);
}
// 키(유닛·투사체 등)마다 3D 물체를 하나씩 두고, 이번 프레임에 안 쓰인 것은 지워요
const pool = new Map(); let frameId = 0, clock3d = 0;
function useMesh(key, make) {
  let e = pool.get(key);
  if (!e) { e = { o: make() }; scene.add(e.o); pool.set(key, e); }
  e.f = frameId; return e.o;
}
function sweep() {
  for (const [k, e] of pool) if (e.f !== frameId) {
    scene.remove(e.o);
    e.o.traverse((m) => { if (m.material) [].concat(m.material).forEach((x) => x.dispose()); if (m.geometry && m.geometry.userData.own) m.geometry.dispose(); });
    pool.delete(k);
  }
}
function fitCamera() {
  const elev = THREE.MathUtils.degToRad(W / H3 > 1.15 ? 44 : 55);
  const dir = new THREE.Vector3(0, Math.sin(elev), Math.cos(elev));
  const pts = [[-7.2, 0, -6.4], [7.2, 0, -6.4], [-7.2, 0, 8.6], [7.2, 0, 8.6], [-6.5, 1.9, -6.3], [6.5, 1.9, -6.3]].map((p) => new THREE.Vector3(...p));
  const target = new THREE.Vector3(0, 0, 1);
  const place = (d) => { camera.position.copy(target).addScaledVector(dir, d); camera.lookAt(target); camera.updateMatrixWorld(); };
  const bounds = () => {
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of pts) { const v = p.clone().project(camera); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    return { x0, x1, y0, y1 };
  };
  for (let it = 0; it < 5; it++) {
    let lo = 4, hi = 150;
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2; place(mid); const b = bounds();
      const xl = W / H > 1.2 ? 0.62 : 0.95; if (b.x0 >= -xl && b.x1 <= xl && b.y0 >= -0.58 && b.y1 <= 0.86) hi = mid; else lo = mid;
    }
    place(hi); const b = bounds();
    target.z -= ((b.y0 + b.y1) / 2 - 0.14) * 3;
  }
  camBase = { pos: camera.position.clone() };
}
// 작은 화면(폰)에서는 친구들을 조금 크게 그려요
let UNIT_K = 1;
function resize() {
  UNIT_K = Math.min(window.innerWidth, window.innerHeight) < 520 ? 1.25 : 1;
  W = window.innerWidth; H = window.innerHeight; H3 = H;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const s = Math.max(30, Math.min(W, H) * 0.062);
  IT.s = s; IT.x0 = 12; IT.cols = H < 600 ? 5 : 3; IT.y0 = H < 600 ? H * 0.4 : H * 0.5;
  if (HAS3D && renderer) {
    const pr = HQ ? Math.min(2, window.devicePixelRatio || 1) : Math.min(1.25, window.devicePixelRatio || 1);
    renderer.setPixelRatio(pr);
    renderer.setSize(W, H, false); gl.style.width = W + "px"; gl.style.height = H + "px";
    if (composer) { composer.setPixelRatio(pr); composer.setSize(W, H); }
    camera.aspect = W / H; camera.updateProjectionMatrix(); fitCamera();
    if (BACKDROP) applyBackdrop(BACKDROP);
  }
}
const IT = { x0: 12, y0: 300, s: 40, cols: 3 };
const itemRect = (i) => [IT.x0 + (i % IT.cols) * (IT.s + 6), IT.y0 + Math.floor(i / IT.cols) * (IT.s + 6)];
let drag = null, lastT = performance.now();
function comboOf(m) { const B = S.battle; if (!B) return null; const r = B.f.find((u) => u.combo && u.combo.members.some((q) => q.m === m)); return r && r.combo.t < r.combo.dur ? r.combo : null; }
function collect(dt) {
  const out = [], P = human(), dragging = drag && drag.moved && drag.loc.w !== "i" ? drag.obj : null;
  const push = (key, sp, x, z, o = {}) => out.push({ key, sp, x, z, ...o });
  if (S.phase === "carousel" && S.car) {
    const C = S.car;
    C.opts.forEach((o, i) => {
      if (o.taken) return;
      const a = C.ang + (i * 2 * Math.PI) / C.opts.length;
      push(o, { d: o.d, star: 1, items: o.item ? [o.item] : [] }, Math.cos(a) * 3.6, Math.sin(a) * 3.2, { face: Math.atan2(Math.cos(a), Math.sin(a)) + Math.PI / 2, lift: 0.14, walking: 1 });
    });
  } else if (S.battle && (S.phase === "combat" || S.phase === "result")) {
    for (const u of S.battle.f) {
      if (u.merged) {
        const k = comboOf(u);
        if (!k || k.t >= COMBO_TF) continue; // 그다음부터는 탈것으로 변신해서 따로 그려요
        const mm = k.members.find((q) => q.m === u), p = Math.min(1, k.t / 1.2), ang = mm.a0 + p * 7, rad = mm.r0 * (1 - p * p);
        push(u, u, k.cx + Math.cos(ang) * rad, k.cz + Math.sin(ang) * rad, { f: null, face: ang + Math.PI, lift: p * 1.6 + Math.sin(p * Math.PI) * 0.3, alpha: 1, walking: 1 });
        continue;
      }
      if (u.combo && u.combo.t < u.combo.dur) {
        const t = u.combo.t; if (t < COMBO_ASM) continue;
        const land = t > COMBO_DONE ? Math.abs(Math.sin((t - COMBO_DONE) * 9)) * 0.2 * Math.max(0, 1 - (t - COMBO_DONE) / 0.4) : 0; // 조립은 robotAssemble 이 해요
        const drop = u.mega && t <= COMBO_DONE ? 14 * Math.pow(1 - (t - COMBO_ASM) / (COMBO_DONE - COMBO_ASM), 2) : land; // 초합체: 다 만들어진 채로 하늘에서 쿵!
        push(u, u, worldX(u.X), worldZ(u.Y), { f: u, enemy: isFoe(u), face: isFoe(u) ? 0 : Math.PI, lift: drop, alpha: 1 });
        continue;
      }
      if (!u.alive) { if (u.deadT <= 0) continue; u.deadT -= dt; }
      let x = worldX(u.X), z = worldZ(u.Y);
      if (u.lunge > 0) { const k = Math.sin((u.lunge / 0.18) * Math.PI) * 0.3; x += u.lx * SQ3 * k; z += u.ly * 1.5 * k; }
      let face = isFoe(u) ? 0 : Math.PI;
      if (u.alive && u.tgt) face = Math.atan2(worldX(u.tgt.X) - worldX(u.X), worldZ(u.tgt.Y) - worldZ(u.Y));
      push(u, u, x, z, { hit: u.alive ? { g: "board", r: u.r, c: u.c } : null, enemy: isFoe(u), f: u, flash: u.flash > 0, alpha: u.alive ? 1 : Math.max(0, Math.min(1, u.deadT / 0.6)), face,
        jump: u.castT > 0 ? Math.sin((u.castT / 0.35) * Math.PI) * 0.45 : 0, dead: !u.alive,
        lift: u.dropT > 0 ? u.dropT * u.dropT * 9 : 0 }); // 소환수가 하늘에서 떨어지는 중
    }
  } else {
    if (S.scout != null) {
      const Q = S.players[S.scout];
      for (let r = 0; r < 4; r++) for (let c = 0; c < COLS; c++) {
        const u = Q.board[r][c]; if (!u) continue;
        push(u, u, worldX(gridX(3 - r, COLS - 1 - c)), worldZ(3 - r), { enemy: true, face: 0 });
      }
    }
    for (let r = 0; r < 4; r++) for (let c = 0; c < COLS; c++) {
      const u = P.board[r][c]; if (!u || u === dragging) continue;
      push(u, u, worldX(gridX(4 + r, c)), worldZ(4 + r), { face: 0, hit: { g: "board", r: 4 + r, c } });
    }
  }
  P.bench.forEach((u, i) => { if (u && u !== dragging) push(u, u, benchX(i), BENCH_Z, { face: 0, bench: 1, lift: 0.0, hit: { g: "bench", i } }); });
  if (dragging && drag.wp) push(dragging, dragging, drag.wp.x, drag.wp.z, { lift: 0.5, alpha: 0.85, face: 0, held: 1 });
  return out;
}
function placeUnit(it, dt) {
  const g = useMesh(it.sp.robot ? "robot:" + (it.enemy ? 1 : 0) + (it.sp.mega ? "m" : "") + ":" + (S.battle ? S.battle.t0 || (S.battle.t0 = Math.random()) : 0) : it.key, () => buildUnit(it.sp, it.enemy)), ud = g.userData;
  const sc = UNIT_K * (it.sp.mon ? (it.sp.mon.boss ? 1.45 : it.sp.mon.summon ? (it.sp.mon.giant ? 1.75 : 0.85) : 1.1) : [1, 1.18, 1.32, 1.48][it.sp.star] * (it.sp.robot ? (it.sp.mega ? 1.95 : 1.6) : 1.12)) * (it.bench ? 0.8 : 1); // 친구들은 12% 크게: 갑옷이 잘 보여요
  g.scale.setScalar(sc);
  // 움직임 감지 → 걷기
  const pv = ud.prev || { x: it.x, z: it.z };
  const speed = Math.hypot(it.x - pv.x, it.z - pv.z) / Math.max(dt, 1e-3);
  ud.prev = { x: it.x, z: it.z };
  const moving = it.walking ? 0.6 : it.held ? 0 : Math.min(1, speed / 2.2);
  ud.move = ud.move * 0.85 + moving * 0.15;
  ud.walk += dt * 10;
  const sw = Math.sin(ud.walk) * 0.65 * ud.move;
  const bounce = Math.abs(Math.sin(ud.walk)) * 0.05 * ud.move;
  const ff = it.f, hitK = ff && ff.alive && ff.flash > 0 ? ff.flash / 0.12 : 0;
  // 이긴 쪽은 전투가 끝나면 만세를 불러요
  const win = !!(ff && ff.alive && S.phase === "result" && S.battle && S.battle.win === ff.team);
  const cheer = win ? Math.abs(Math.sin(clock3d * 7 + it.x * 1.3)) * 0.38 : 0;
  // 맞으면 살짝 찌그러졌다가 돌아와요
  g.scale.set(sc * (1 + hitK * 0.1), sc * (1 - hitK * 0.12), sc * (1 + hitK * 0.1));
  g.position.set(it.x, (it.lift || 0) + (it.jump || 0) + bounce + cheer - (it.dead ? (1 - it.alpha) * 0.4 : 0), it.z);
  const cur = g.rotation.y, d = ((((it.face ?? 0) - cur) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  g.rotation.y = cur + d * Math.min(1, dt * 10);
  g.rotation.x = it.dead ? -(1 - it.alpha) * 1.4 : it.held ? 0.25 : -hitK * 0.2;
  g.rotation.z = it.dead ? (1 - it.alpha) * 0.9 : 0;
  if (ud.legs) {
    ud.legs[0].rotation.x = sw; ud.legs[1].rotation.x = -sw;
    let la = -sw * 0.8, ra = sw * 0.8, lz = ud.restZ[0], rz = ud.restZ[1], lean = ud.move * 0.14, twist = 0;
    const f = it.f;
    let kick = 0, spin = null, headX = 0, elbL = 0, elbR = 0;
    if (f && f.atkT > 0 && f.atkT > (ud.lastAtk ?? 0) + 1e-4 && f.rg > 1) { // 새 공격이 시작됐어요
      const pk = projKind(champOfUnit(f));
      if (pk) WFX.push({ kind: "impact", X: f.X + (ud.dirX || 0) * 0.35, Y: f.Y + (ud.dirY || 0) * 0.35, y: 1.15, col: (champOfUnit(f) || {}).accent ? "#" + champOfUnit(f).accent.toString(16).padStart(6, "0") : "#ffffff", t: 0.18, t0: 0.18, small: 1 });
    }
    if (f) ud.lastAtk = f.atkT;
    if (f && f.atkT > 0) { // 무기마다 다른 공격 동작 (weapons.js 의 ATK_ANIM)
      const p = Math.min(1, 1 - f.atkT / ATK_T), k = Math.sin(p * Math.PI);
      const wp = !f.robot && f.d >= 0 && WEAPONS[DEFS[f.d].n], CHa = champOfUnit(f);
      const akey = CHa && (DIV_ANIM[DEFS[f.d].n] || CH_ANIM[CHa.weapon]);
      const A = (akey && CANIM[akey]) ? CANIM[akey](p) : ((wp && ATK_ANIM[wp.anim]) || ATK_ANIM[f.rg > 1 ? "cast" : "swing"])(p, k);
      elbL = A.le || 0; elbR = A.re || 0;
      if (A.la != null) la = A.la; if (A.ra != null) ra = A.ra;
      if (A.lz != null) lz += A.lz; if (A.rz != null) rz += A.rz;
      lean += A.lean || 0; twist = A.twist || 0; kick = A.kick || 0; headX = A.head || 0;
      if (A.spin != null) spin = A.spin;
      g.position.y += A.hop || 0;
    }
    ud.legs[1].rotation.x += kick;
    if (ud.knees) { // 걸을 때 뒤로 가는 다리의 무릎을 굽혀요, 차는 다리는 펴요
      ud.knees[0].rotation.x = Math.max(0, Math.sin(ud.walk + 1.2)) * 0.95 * ud.move;
      ud.knees[1].rotation.x = Math.max(0, -Math.sin(ud.walk + 1.2)) * 0.95 * ud.move + Math.max(0, kick) * 0.6;
    }
    if (it.jump > 0) { lz = -0.4 - it.jump * 3; rz = 0.4 + it.jump * 3; lean = -0.15; }
    if (win) { la = ra = -2.7 + Math.sin(clock3d * 14 + it.x) * 0.25; lz = -0.45; rz = 0.45; lean = -0.1; }
    if (f && !win && S.battle && f.grooveUntil > S.battle.t && !(f.atkT > 0)) { // 춤추기 무대 위: 은혜린은 신나게 춤추고, 아군은 박자를 타요
      const me = f.d >= 0 && DEFS[f.d].n === "은혜린", ph = clock3d * (me ? 9 : 6) + it.x;
      if (me) { la = -2.4 + Math.sin(ph) * 0.5; ra = -2.4 - Math.sin(ph) * 0.5; lz = -0.5 + Math.sin(ph * 0.5) * 0.25; rz = 0.5 + Math.sin(ph * 0.5) * 0.25; twist = Math.sin(ph * 0.5) * 0.5; lean = Math.sin(ph) * 0.12; g.position.y += Math.abs(Math.sin(ph)) * 0.22; }
      else g.position.y += Math.abs(Math.sin(ph)) * 0.1;
    }
    if (it.held) { la = -0.3; ra = -0.3; lz = -0.6; rz = 0.6; }
    ud.arms[0].rotation.set(la, 0, lz); ud.arms[1].rotation.set(ra, 0, rz);
    if (ud.elbows) { // 팔꿈치: 공격할 때 굽혔다 펴요 (평소엔 살짝 굽힌 자세)
      const tl = -0.22 + elbL, tr = -0.22 + elbR, kk = Math.min(1, dt * 30);
      ud.elbows[0].rotation.x += (tl - ud.elbows[0].rotation.x) * kk; ud.elbows[1].rotation.x += (tr - ud.elbows[1].rotation.x) * kk;
    }
    if (ud.aimW) { // 무기 방향 맞추기: 'up' = 똑바로 세우기, 'fwd' = 앞을 겨누기 (팔·몸 숙임을 빼서 계산)
      const atk = !!(f && f.atkT > 0);
      for (const a of ud.aimW) {
        const mode = atk ? a.atk : a.idle, th = ud.arms[a.side].rotation.x + ud.elbows[a.side].rotation.x + ud.torso.rotation.x;
        const target = mode === "up" ? -th : mode === "fwd" ? Math.PI / 2 - th : a.rest;
        a.w.rotation.x += (target - a.w.rotation.x) * Math.min(1, dt * (atk ? 25 : 10));
      }
    }
    ud.torso.scale.y = 1 + Math.sin(clock3d * 2.2 + it.x) * 0.018;
    if (ud.flames) { // 합체로봇: 추진기 불꽃이 일렁이고, 합체해서 내려올 때·걸을 때 더 크게 뿜어요
      const cb = it.f && it.f.combo && it.f.combo.t < it.f.combo.dur ? it.f.combo.t : -1;
      const asm = cb >= 0 && !it.f.mega ? Math.max(0, Math.min(1, (cb - COMBO_ASM) / (COMBO_DONE - COMBO_ASM))) : 1; // 부품 조립 진행도 (초합체로봇은 완성된 채로 내려와요)
      if (asm !== ud.lastAsm) { robotAssemble(ud, asm); ud.lastAsm = asm; }
      ud.eye.emissiveIntensity = !ud.eyeOn ? 0.05 : 2.2 + (cb >= COMBO_DONE ? 7 * Math.max(0, 1 - (cb - COMBO_DONE) / 0.5) : 0); // 다 조립되면 눈이 번쩍
      const k = cb >= 0 ? (cb < 2.0 ? 2.8 : 1.6) : ud.move > 0.1 ? 1.5 : 1;
      ud.flames.forEach((m, i) => { const s = k * (0.85 + 0.25 * Math.sin(clock3d * 40 + i * 2.1)); m.scale.set(1 + (k - 1) * 0.25, s, 1 + (k - 1) * 0.25); m.position.y = 0.11 - 0.15 * s; });
      ud.ball.rotation.y += dt * 2.5; ud.core.rotation.z = Math.sin(clock3d * 1.5) * 0.15;
      const mz = ud.sword && S.battle && S.battle.zones.find((z) => z.kind === "megasword" && z.owner === it.f);
      if (mz) { // 초합체 대검: 칼을 높이 들어 올렸다가(빛이 모임) 한 번에 휘둘러요
        const k = mz.t - MEGA_SLASH_AT, up = k < 0 ? Math.min(1, mz.t / 0.3) : Math.max(0, 1 - k / 0.12), down = k < 0 ? 0 : Math.min(1, k / 0.12) * Math.max(0, 1 - (k - 0.5) / 0.4);
        ud.arms[1].rotation.set(-3.0 * up + 0.4 * down, 0, 0.25 * up - 0.9 * down); ud.torso.rotation.y = -0.6 * down;
        ud.blade.material.emissiveIntensity = 1.4 + 4 * (k < 0 ? Math.min(1, mz.t / MEGA_SLASH_AT) : Math.max(0, 1 - k / 0.5));
      }
    }
    ud.torso.rotation.x += (lean - ud.torso.rotation.x) * Math.min(1, dt * 18);
    if (ud.cape) ud.cape.rotation.x = 0.12 + ud.move * 0.55 + Math.sin(clock3d * 2.1 + it.x) * 0.04;
    if (ud.spin) ud.spin.forEach((r, i) => (r.rotation.y += dt * (1.2 + i)));
    if (ud.dspin) for (const [o, sp] of ud.dspin) o.rotation.y += dt * sp; // 신: 광륜 · 파편 · 문양이 천천히 돌아요
    if (ud.wings) ud.wings.forEach((w, i) => (w.rotation.y = w.userData.base + Math.sin(clock3d * 1.7) * 0.14 * (i ? -1 : 1)));
    if (ud.float) for (const [o, y0] of ud.float) o.position.y = y0 + Math.sin(clock3d * 2.2 + it.x) * 0.025;
    if (ud.bob) ud.bob.position.y = 1.45 + Math.sin(clock3d * 2.6) * 0.03;
    if (ud.orb) { ud.orb.position.y = 0.78 + Math.sin(clock3d * 2.4 + it.z) * 0.04; ud.orb.rotation.y += dt * 1.5; }
    if (ud.banner) ud.banner.rotation.y = Math.sin(clock3d * 3 + it.x) * 0.35;
    if (spin != null) ud.torso.rotation.y = spin; else { if (ud.torso.rotation.y > Math.PI) ud.torso.rotation.y -= Math.PI * 2; ud.torso.rotation.y += (twist - ud.torso.rotation.y) * Math.min(1, dt * 18); }
    ud.head.rotation.y = Math.sin(clock3d * 0.7 + it.z * 2) * 0.18 * (1 - ud.move);
    ud.head.rotation.z = Math.sin(clock3d * 1.1 + it.x * 3) * 0.05 + (win ? Math.sin(clock3d * 7) * 0.12 : 0);
    ud.head.rotation.x = hitK * -0.3 + (it.dead ? -0.4 : 0) + headX;
    if (ud.scarf) ud.scarf.rotation.x = 0.25 + ud.move * 0.9 + Math.sin(clock3d * 3 + it.x) * 0.12;
    if (ud.face) { // 눈 깜빡임 (기절하거나 쓰러지면 감아요): 얼굴 그림을 바꿔 끼워요
      if ((ud.blinkT = (ud.blinkT ?? 1 + Math.random() * 3) - dt) < 0) ud.blinkT = 2 + Math.random() * 3.5;
      const shut = ud.blinkT < 0.11 || it.dead || (f && f.stunT > 0) ? 1 : 0;
      if (ud.faceShut !== shut) { ud.faceShut = shut; ud.face.material.map = ud.faceTex[shut]; }
    }
    if (ud.ball) ud.ball.rotation.x += dt * 6 * ud.move;
  } else {
    if (ud.lLeg) { ud.lLeg.rotation.x = sw; ud.rLeg.rotation.x = -sw; }
    if (ud.jelly) { // 젤리: 말랑말랑 출렁이고, 움직일 땐 통통 튀어요
      const b = Math.sin(clock3d * 5 + it.x * 3), hop = Math.abs(Math.sin(ud.walk * 0.8)) * ud.move;
      ud.jelly.scale.set(1 + 0.06 * b + hop * 0.08, 1 - 0.08 * b - hop * 0.12 + Math.max(0, Math.sin(ud.walk * 0.8 * 2)) * 0.1 * ud.move, 1 + 0.06 * b + hop * 0.08);
      ud.jelly.position.y = 0.2 + hop * 0.22;
      if (ud.core) ud.core.rotation.y += dt * 1.8;
    } else g.position.y += Math.sin(clock3d * 2 + it.x) * 0.04;
  }
  if (ud.eyes && !ud.face) { // 얼굴 그림이 없는 유닛(소환수 등): 눈 모양을 납작하게 해서 깜빡여요
    if ((ud.blinkT = (ud.blinkT ?? 1 + Math.random() * 3) - dt) < 0) ud.blinkT = 2 + Math.random() * 3.5;
    const shut = ud.blinkT < 0.11 || it.dead || (it.f && it.f.stunT > 0), wide = hitK > 0 ? 1.25 : 1;
    for (const e of ud.eyes) e.scale.y = e.userData.sy * (shut ? 0.12 : wide);
  }
  const a = it.alpha ?? 1;
  for (const m of ud.mats) {
    // 처음 만들 때의 투명 여부·투명도를 기억해 두고, 죽을 때 사라지는 정도(a)만 곱해요 (렌즈 같은 반투명 부품이 불투명해지지 않게)
    if (m.userData.op0 === undefined) { m.userData.op0 = m.opacity; m.userData.t0 = m.transparent; }
    m.transparent = a < 1 || m.userData.keepT || m.userData.t0; m.opacity = a * m.userData.op0;
    if (m.emissive && m.userData.e0 === undefined) m.userData.e0 = m.emissive.getHex();
    if (m.emissive) m.emissive.setHex(it.flash ? 0x3a3a3a : m.userData.e0);
  }
  if (ud.jellyMats) for (const m of ud.jellyMats) { m.transparent = true; m.opacity = a * m.userData.op; if (m.userData.e0 === undefined) m.userData.e0 = m.emissive.getHex(); m.emissive.setHex(it.flash ? 0x3a3a3a : m.userData.e0); }
  if (it.f) unitStatus(g, ud, it.f, dt);
  if (!it.sp.mon && it.sp.star >= 2) starFlair(g, ud, it.sp.star, dt);
  it.g = g;
}
// 보호막 방울 · 기절 별 · 공격 속도 버프 고리
let SGEO = null;
const sgeo = () => SGEO || (SGEO = { star: new THREE.OctahedronGeometry(0.09, 0), bub: new THREE.SphereGeometry(0.9, 20, 14) });
function unitStatus(g, ud, f, dt) {
  sgeo();
  const on = f.alive;
  if (on && f.shield > 0) {
    if (!ud.bub) { ud.bub = new THREE.Mesh(SGEO.bub, additive("#8fd0ff")); ud.bub.position.y = 0.95; g.add(ud.bub); }
    ud.bub.visible = true; ud.bub.material.opacity = 0.055 + Math.sin(clock3d * 4) * 0.02; ud.bub.scale.setScalar(0.8 + Math.sin(clock3d * 3) * 0.02);
  } else if (ud.bub) ud.bub.visible = false;
  if (on && f.stunT > 0) {
    if (!ud.stun) { ud.stun = new THREE.Group(); ud.stun.position.y = 2.0; const m = additive("#ffe66b"); for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(SGEO.star, m); const a = (i / 3) * Math.PI * 2; s.position.set(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3); ud.stun.add(s); } g.add(ud.stun); }
    ud.stun.visible = true; ud.stun.rotation.y += dt * 7; ud.stun.children.forEach((s) => (s.rotation.y -= dt * 9));
  } else if (ud.stun) ud.stun.visible = false;
  if (on && f.asBuffT > 0) {
    if (!ud.buff) { ud.buff = new THREE.Mesh(GEO.ringFx, additive("#ffb43a")); ud.buff.rotation.x = -Math.PI / 2; ud.buff.position.y = 0.23; g.add(ud.buff); }
    ud.buff.visible = true; ud.buff.scale.setScalar(0.72 + Math.sin(clock3d * 9) * 0.06); ud.buff.rotation.z += dt * 5; ud.buff.material.opacity = 0.75;
  } else if (ud.buff) ud.buff.visible = false;
}
// ★2는 은빛, ★3은 금빛 고리와 반짝이가 따라다녀요
function starFlair(g, ud, star, dt) {
  sgeo();
  if (!ud.flair) {
    const grp = (ud.flair = new THREE.Group()), col = star >= 3 ? "#ffd75a" : "#dfeaf2";
    const ring = new THREE.Mesh(GEO.ringFx, additive(col)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.225; ring.scale.setScalar(0.7); ring.material.opacity = star >= 3 ? 0.6 : 0.28; grp.add(ring);
    const m = additive(col), n = star >= 3 ? 5 : 2;
    for (let i = 0; i < n; i++) { const s = new THREE.Mesh(SGEO.star, m); s.scale.setScalar(star >= 3 ? 0.7 : 0.5); grp.add(s); }
    g.add(grp);
  }
  const ch = ud.flair.children, n = ch.length - 1;
  for (let i = 1; i <= n; i++) { const a = clock3d * 1.6 + (i / n) * Math.PI * 2; ch[i].position.set(Math.cos(a) * 0.62, 0.7 + Math.sin(clock3d * 2.3 + i * 2) * 0.45, Math.sin(a) * 0.62); ch[i].rotation.y += dt * 5; }
}
const additive = (col) => new THREE.MeshBasicMaterial({ color: new THREE.Color(col), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
// ----- 영웅 공격 동작: 준비(뒤로 젖힘) → 빠른 타격 → 천천히 원위치 -----
// 어깨(la/ra·lz/rz)뿐 아니라 팔꿈치(le/re)도 굽혔다 펴서 자연스럽게 보여요.
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// 0에서 시작해 p=W에 w(준비 자세), p=S에 s(타격 자세) 도착, 그 뒤 천천히 0으로 돌아와요
const ph3 = (p, w, s, W = 0.2, Sx = 0.36) => (p < W ? w * sstep(0, W, p) : p < Sx ? w + (s - w) * sstep(W, Sx, p) : s * (1 - sstep(Sx, 1, p)));
const hold = (p, v, a = 0.12, b = 0.8) => v * sstep(0, a, p) * (1 - sstep(b, 1, p));
const CANIM = {
  slash: (p) => ({ ra: ph3(p, -2.5, -0.35), rz: ph3(p, 0.55, -0.55), re: ph3(p, -1.4, -0.05), la: ph3(p, 0.25, -0.35), le: hold(p, -0.6), twist: ph3(p, 0.55, -0.65), lean: ph3(p, -0.08, 0.32) }),
  twin: (p) => {
    const a = Math.min(1, p / 0.62), b = Math.max(0, (p - 0.3) / 0.7);
    return { ra: ph3(a, -2.4, -0.4), rz: ph3(a, 0.5, -0.5), re: ph3(a, -1.3, -0.05), la: ph3(b, -2.4, -0.4), lz: ph3(b, -0.5, 0.5), le: ph3(b, -1.3, -0.05), twist: ph3(a, 0.5, -0.5) + ph3(b, -0.5, 0.5), lean: hold(p, 0.25) };
  },
  cleave: (p) => ({ ra: ph3(p, -2.9, -0.7, 0.26, 0.42), la: ph3(p, -2.9, -0.7, 0.26, 0.42), rz: hold(p, -0.22), lz: hold(p, 0.22), re: ph3(p, -1.2, -0.1, 0.26, 0.42), le: ph3(p, -1.2, -0.1, 0.26, 0.42), lean: ph3(p, -0.1, 0.4, 0.26, 0.42), hop: ph3(p, 0.1, 0, 0.26, 0.42), head: ph3(p, -0.15, 0.1, 0.26, 0.42) }),
  bow: (p) => ({ la: hold(p, -1.55, 0.1, 0.75), lz: hold(p, -0.12), le: hold(p, -0.05), ra: hold(p, -1.4, 0.1, 0.75), rz: hold(p, -0.25), re: ph3(p, -2.3, -0.4, 0.3, 0.38), twist: hold(p, 0.65, 0.1, 0.8), head: hold(p, -0.05) }),
  aim: (p) => { const kick = sstep(0.3, 0.36, p) * (1 - sstep(0.36, 0.6, p)); return { la: hold(p, -1.4, 0.12, 0.78), le: hold(p, -0.55), ra: hold(p, -1.3, 0.12, 0.78) + kick * 0.45, re: hold(p, -0.95), twist: hold(p, 0.4), lean: hold(p, 0.08) - kick * 0.22, head: -kick * 0.18 }; },
  cast: (p) => ({ ra: ph3(p, -2.6, -1.5, 0.24, 0.4), re: ph3(p, -1.0, -0.05, 0.24, 0.4), rz: ph3(p, 0.2, -0.15, 0.24, 0.4), la: ph3(p, 0.35, -0.4, 0.24, 0.4), lean: ph3(p, -0.12, 0.28, 0.24, 0.4), head: ph3(p, -0.15, 0.05, 0.24, 0.4) }),
  tome: (p) => ({ la: hold(p, -1.15), le: hold(p, -1.0), lz: hold(p, -0.1), ra: ph3(p, -1.9, -1.35), re: ph3(p, -0.9, 0), rz: ph3(p, 0.4, -0.35), twist: ph3(p, 0.3, -0.35), lean: ph3(p, -0.05, 0.2) }),
  orb: (p) => ({ ra: ph3(p, -0.7, -1.6), re: ph3(p, -1.7, -0.05), rz: ph3(p, 0.25, -0.1), la: ph3(p, 0.2, -0.5), twist: ph3(p, 0.6, -0.4), lean: ph3(p, -0.1, 0.3) }),
  thrust: (p) => ({ ra: ph3(p, -0.85, -1.62), re: ph3(p, -1.7, -0.02), rz: hold(p, -0.12), la: ph3(p, -0.6, -1.2), le: ph3(p, -1.2, -0.3), twist: ph3(p, 0.6, -0.45), lean: ph3(p, -0.12, 0.34) }),
  bo: (p) => ({ ra: ph3(p, -1.0, -1.8), la: ph3(p, -1.0, -1.6), re: hold(p, -0.8), le: hold(p, -0.8), rz: hold(p, -0.4), lz: hold(p, 0.4), spin: p < 0.15 ? null : Math.PI * 2 * sstep(0.15, 0.75, p), lean: hold(p, 0.2), hop: hold(p, 0.08, 0.2, 0.6) }),
  punch: (p) => { const a = Math.min(1, p / 0.55), b = Math.max(0, (p - 0.38) / 0.62); return { la: ph3(a, -0.9, -1.65, 0.25, 0.42), le: ph3(a, -1.9, -0.05, 0.25, 0.42), ra: ph3(b, -0.9, -1.65, 0.25, 0.42), re: ph3(b, -1.9, -0.05, 0.25, 0.42), lz: 0.1, rz: -0.1, twist: ph3(a, 0.4, -0.35) + ph3(b, -0.4, 0.35), lean: hold(p, 0.28) }; },
  bash: (p) => ({ la: ph3(p, -0.7, -1.55), le: ph3(p, -1.5, -0.4), lz: ph3(p, -0.2, 0.25), ra: ph3(p, -2.2, -0.6, 0.3, 0.46), re: ph3(p, -1.2, -0.1, 0.3, 0.46), twist: ph3(p, 0.5, -0.4), lean: ph3(p, -0.08, 0.28), hop: ph3(p, 0.04, 0.08) }),
  quill: (p) => ({ ra: hold(p, -1.55) + Math.sin(p * 40) * 0.12 * hold(p, 1, 0.2, 0.7), re: hold(p, -0.5) + Math.cos(p * 40) * 0.15 * hold(p, 1, 0.2, 0.7), rz: Math.sin(p * 20) * 0.2 * hold(p, 1), lean: hold(p, 0.15), la: hold(p, 0.3) }),
  horn: (p) => ({ la: hold(p, -2.1, 0.15, 0.7), lz: hold(p, -0.55), le: hold(p, -1.7), head: hold(p, -0.28), lean: hold(p, -0.22), ra: hold(p, 0.45), rz: hold(p, 0.35) }),
  smite: (p) => ({ ra: ph3(p, -3.1, -1.35, 0.3, 0.44), re: ph3(p, -0.6, -0.05, 0.3, 0.44), la: hold(p, 0.4), lz: hold(p, -0.6), hop: ph3(p, 0.18, 0.02, 0.3, 0.44), lean: ph3(p, -0.2, 0.3, 0.3, 0.44), head: ph3(p, -0.3, 0.1, 0.3, 0.44) }),
};
const DIV_ANIM = { "김예균": "slash" }; // 김예균은 홀의 낫날로 크게 베어요
const CH_ANIM = { sword: "slash", blades: "twin", greataxe: "cleave", hammer: "cleave", bow: "bow", crossbow: "aim", rifle: "aim", tome: "tome", shield: "bash", bo: "bo", quill: "quill", gauntlets: "punch", horn: "horn", pizzabox: "tome", mawshield: "bash", astrolabe: "cast", abyssorb: "orb", spear: "thrust", crystalstaff: "cast", sunstaff: "cast", net: "cleave", ribbon: "cast" };
// 무기 종류별 공격 효과 색·모양
const champOfUnit = (f) => (f && !f.robot && !f.mon && f.d >= 0 && typeof CHAMPS !== "undefined" && CHAMPS[DEFS[f.d].n]) || null;
function projKind(CH) {
  if (!CH) return null;
  const w = CH.weapon;
  return w === "bow" ? "arrow" : w === "crossbow" ? "bolt" : w === "rifle" ? "bullet" : w === "spear" ? (CH.kit === "god" ? "lightning" : "javelin") : w === "horn" ? "wave" : w === "pizzabox" ? null : "magic"; // 피자 상자는 weapons.js 의 피자 조각을 던져요
}
// ----- 영웅 원거리 공격 모양: 화살 · 석궁 볼트 · 총알 · 마법탄 · 투창 · 번개 · 음파 -----
function champProj(kind, col) {
  const T = fxTex(), g = new THREE.Group(), c = new THREE.Color(col);
  const glow = spriteFx(T.star, col); glow.scale.setScalar(kind === "magic" ? 0.9 : 0.6); g.add(glow); g.userData.glow = glow;
  const tail = new THREE.Mesh(GEO.fxStreak || (GEO.fxStreak = new THREE.PlaneGeometry(1, 0.12)), addTex(T.streak, col)); // 꼬리: 진행 반대쪽으로 늘어진 빛
  tail.rotation.set(0, Math.PI / 2, 0); g.add(tail); g.userData.tail = tail;
  const solid = (geo, hex, x, y, z) => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: lin(hex), roughness: 0.5 })); m.position.set(x, y, z); g.add(m); return m; };
  if (kind === "arrow" || kind === "bolt" || kind === "javelin") {
    const len = kind === "javelin" ? 0.9 : kind === "bolt" ? 0.38 : 0.6;
    const sh = solid(GEO.fxShaft || (GEO.fxShaft = new THREE.CylinderGeometry(0.012, 0.012, 1, 6)), kind === "javelin" ? 0x6a4a2a : 0xd8c8a8, 0, 0, -len / 2); sh.scale.y = len; sh.rotation.x = Math.PI / 2;
    const hd = new THREE.Mesh(GEO.fxHead || (GEO.fxHead = new THREE.ConeGeometry(0.035, 0.12, 6)), new THREE.MeshStandardMaterial({ color: lin(0xd8dee8), roughness: 0.25, metalness: 0.8, emissive: c.clone().convertSRGBToLinear(), emissiveIntensity: 0.6 })); hd.rotation.x = Math.PI / 2; hd.position.z = 0.04; g.add(hd);
    if (kind !== "javelin") for (const s of [-1, 1]) { const f = solid(GEO.fxFletch || (GEO.fxFletch = new THREE.BoxGeometry(0.004, 0.05, 0.09)), 0xf2f2f2, 0, s * 0.02, -len + 0.05); f.rotation.z = s * 0.4; }
    tail.scale.set(kind === "javelin" ? 1.6 : 1.1, 1, 1); tail.position.z = -len - 0.35;
  } else if (kind === "bullet") {
    const b = new THREE.Mesh(GEO.ball, addTex(null, "#ffffff")); b.scale.set(0.35, 0.35, 1.2); g.add(b);
    tail.scale.set(2.2, 0.6, 1); tail.position.z = -1.1;
  } else if (kind === "lightning") {
    const mat = additive("#ffffff"), mat2 = additive(col);
    for (let i = 0; i < 5; i++) { const seg = new THREE.Mesh(GEO.fxShaft || (GEO.fxShaft = new THREE.CylinderGeometry(0.012, 0.012, 1, 6)), i % 2 ? mat : mat2); seg.scale.set(2.2, 0.22, 2.2); seg.position.set((i % 2 ? 1 : -1) * 0.05, 0, -i * 0.17); seg.rotation.set(Math.PI / 2, 0, (i % 2 ? 0.6 : -0.6)); g.add(seg); }
    tail.scale.set(1.4, 1, 1); tail.position.z = -0.8;
  } else if (kind === "rend") { // 김예균 참격: 앞으로 휜 핏빛 초승달 두 겹 (기울기는 날릴 때마다 달라요)
    const tg = new THREE.Group(); g.add(tg); g.userData.tg = tg;
    const geo = GEO.fxQuad || (GEO.fxQuad = new THREE.PlaneGeometry(1, 1));
    for (const [sz, cc, op] of [[1.5, col, 1], [1.15, "#ffffff", 0.9], [1.9, "#5a0010", 0.7]]) { const m = new THREE.Mesh(geo, addTex(T.crescent, cc, op)); m.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); m.scale.setScalar(sz); m.position.z = -0.35; tg.add(m); }
    glow.scale.setScalar(0.4); tail.scale.set(1.6, 2.2, 1); tail.position.z = -0.9;
  } else if (kind === "wave") {
    for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(GEO.ringFx, additive(col)); r.scale.setScalar(0.22 + i * 0.1); r.position.z = -i * 0.16; g.add(r); }
    tail.visible = false;
  } else { // 마법탄: 빛나는 핵 + 감도는 고리
    const core = new THREE.Mesh(GEO.ball, additive("#ffffff")); core.scale.setScalar(0.9); g.add(core);
    const shell = new THREE.Mesh(GEO.ball, additive(col)); shell.scale.setScalar(1.6); g.add(shell);
    const ring = new THREE.Mesh(GEO.ringFx, additive(col)); ring.scale.setScalar(0.24); g.add(ring); g.userData.ring = ring;
    tail.scale.set(1.0, 1.4, 1); tail.position.z = -0.5;
  }
  return g;
}
// ----- 효과 그림: 별빛 섬광 · 초승달 베기 · 꼬리 -----
let FXT = null;
function fxTex() {
  if (FXT) return FXT;
  const star = canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.18, "rgba(255,255,255,.75)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "lighter";
    for (const [a, l] of [[0, 1], [Math.PI / 2, 1], [Math.PI / 4, 0.55], [-Math.PI / 4, 0.55]]) {
      g.save(); g.translate(w / 2, h / 2); g.rotate(a);
      const lg = g.createLinearGradient(-w / 2, 0, w / 2, 0); lg.addColorStop(0, "rgba(255,255,255,0)"); lg.addColorStop(0.5, `rgba(255,255,255,${0.9 * l})`); lg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = lg; g.fillRect(-w / 2 * l, -2.5, w * l, 5); g.restore();
    }
  });
  const crescent = canvasTex(256, 256, (g, w, h) => { // 링 위치(반지름)는 가장자리가 가장 밝고, 각도는 앞쪽이 진하고 꼬리로 갈수록 옅어져요
    g.clearRect(0, 0, w, h);
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x - w / 2) / (w / 2), dy = (y - h / 2) / (h / 2), r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const radial = Math.max(0, 1 - Math.abs(r - 0.9) / 0.32) ** 1.6, ang = Math.max(0, Math.min(1, (a + 1.1) / 2.2)), tail = ang ** 1.5;
      const v = radial * tail, i = (y * w + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.min(255, v * 300);
    }
    g.putImageData(img, 0, 0);
  });
  const streak = canvasTex(64, 16, (g, w, h) => { g.clearRect(0, 0, w, h); const lg = g.createLinearGradient(0, 0, w, 0); lg.addColorStop(0, "rgba(255,255,255,0)"); lg.addColorStop(0.75, "rgba(255,255,255,.9)"); lg.addColorStop(1, "rgba(255,255,255,1)"); g.fillStyle = lg; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2, h / 2.4, 0, 0, Math.PI * 2); g.fill(); });
  const sharp = canvasTex(256, 256, (g, w, h) => { // 날카로운 참격: 아주 얇은 호, 양 끝이 바늘처럼 뾰족, 가운데 하얀 심
    g.clearRect(0, 0, w, h);
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x - w / 2) / (w / 2), dy = (y - h / 2) / (h / 2), r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const s2 = Math.max(0, Math.min(1, (a + 1.3) / 2.6)), thick = 0.075 * Math.pow(Math.sin(Math.PI * s2), 1.4) + 0.002, d = Math.abs(r - 0.88);
      const core = d < thick ? 1 - d / thick : 0, glow = Math.max(0, 1 - d / (thick * 2.6)) * 0.35;
      const v = Math.min(1, core * 1.4 + glow), i = (y * w + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = v * 255;
    }
    g.putImageData(img, 0, 0);
  });
  const needle = canvasTex(128, 16, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = "#fff"; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w / 2, h / 2 - 3); g.lineTo(w, h / 2); g.lineTo(w / 2, h / 2 + 3); g.closePath(); g.fill(); }); // 양 끝이 뾰족한 가는 선
  return (FXT = { star, crescent, streak, sharp, needle });
}
const addTex = (tex, col, op = 1) => new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(col), transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const spriteFx = (tex, col) => new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(col), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
// 타격 지점의 폭발: 섬광 + 사방으로 튀는 빛줄기 + 바닥 고리
function drawImpact(g, x, z, k, dt) {
  const grp = useMesh(g, () => {
    const T = fxTex(), gg = new THREE.Group(), ud = gg.userData;
    ud.flash = spriteFx(T.star, g.col); gg.add(ud.flash);
    ud.core = spriteFx(T.star, "#ffffff"); gg.add(ud.core);
    ud.streaks = []; const n = g.heavy ? 12 : 8, sm = addTex(T.streak, g.col);
    for (let i = 0; i < n; i++) { const s = new THREE.Mesh(GEO.fxStreak || (GEO.fxStreak = new THREE.PlaneGeometry(1, 0.12)), sm); const a = (i / n) * Math.PI * 2 + Math.random() * 0.5, up = (Math.random() - 0.3) * 1.2; s.userData.d = new THREE.Vector3(Math.cos(a), up, Math.sin(a)).normalize(); s.userData.sp = 0.8 + Math.random() * 0.8; gg.add(s); ud.streaks.push(s); }
    ud.ring = new THREE.Mesh(GEO.ringFx, additive(g.col)); ud.ring.rotation.x = -Math.PI / 2; gg.add(ud.ring);
    return gg;
  });
  const ud = grp.userData, big = g.heavy ? 1.5 : 1, y = g.y ?? 1.0;
  grp.position.set(x, 0, z);
  const fl = (1 - k) * (1 - k);
  ud.flash.position.y = y; ud.flash.scale.setScalar((0.9 + k * 1.6) * big); ud.flash.material.opacity = fl;
  ud.core.position.y = y; ud.core.scale.setScalar((0.5 + k * 0.4) * big); ud.core.material.opacity = Math.max(0, 1 - k * 2.2);
  ud.streaks.forEach((s) => { const d = s.userData.d, r = (0.15 + k * 0.9 * s.userData.sp) * big; s.position.set(d.x * r, y + d.y * r, d.z * r); s.lookAt(grp.position.x + d.x * 9, y + d.y * 9, grp.position.z + d.z * 9); s.rotateY(Math.PI / 2); s.scale.set((0.5 - k * 0.3) * big, 1, 1); });
  ud.streaks[0].material.opacity = Math.max(0, 1 - k * 1.3);
  ud.ring.position.y = 0.25; ud.ring.scale.setScalar((0.3 + k * 1.1) * big); ud.ring.material.opacity = 0.8 * (1 - k);
}

let WFX = [], PREV_PROJ = [];
function drawFx(list, dt) {
  for (const g of list) {
    g.t -= dt;
    const k = 1 - g.t / g.t0, x = g.w ? g.X : worldX(g.X), z = g.w ? g.Y : worldZ(g.Y);
    if (g.kind === "impact") { drawImpact(g, x, z, k, dt); if (g.small) { const o = pool.get(g); if (o) o.o.scale.setScalar(0.55); } }
    else if (g.kind === "slash") { // 근접 공격: 빛나는 초승달 베기 두 겹 + 맞은 자리 폭발
      const CHs = g.who && typeof CHAMPS !== "undefined" && CHAMPS[g.who], col = CHs ? "#" + CHs.accent.toString(16).padStart(6, "0") : g.col;
      const heavy = CHs && (CHs.weapon === "greataxe" || CHs.weapon === "hammer" || CHs.weapon === "gauntlets");
      const demon = g.who && typeof HERO !== "undefined" && HERO.DIVINE[g.who] && HERO.DIVINE[g.who].theme === "demon"; // 김예균: 크고 붉은 X자 참격
      if (!g.boom) { g.boom = 1; list.push({ kind: "impact", X: g.X, Y: g.Y, col, heavy: heavy || demon, t: heavy || demon ? 0.42 : 0.3, t0: heavy || demon ? 0.42 : 0.3 }); if (heavy || demon) S.shake = Math.max(S.shake || 0, demon ? 0.09 : 0.06); }
      const grp = useMesh(g, () => {
        const T = fxTex(), gg = new THREE.Group(), geo = GEO.slash2 || (GEO.slash2 = new THREE.RingGeometry(0.0, 0.85, 40, 1));
        const a = new THREE.Mesh(geo, addTex(T.crescent, col)), b = new THREE.Mesh(geo, addTex(T.crescent, "#ffffff")); b.scale.setScalar(0.94);
        gg.add(a, b); gg.userData.l = [a, b];
        if (demon) { // 엇갈린 두 번째 참격 + 검붉은 바깥 테
          const c2 = new THREE.Mesh(geo, addTex(T.crescent, "#5a0010")); c2.scale.setScalar(1.25); gg.add(c2);
          const x1 = new THREE.Mesh(geo, addTex(T.crescent, col)), x2 = new THREE.Mesh(geo, addTex(T.crescent, "#ffffff")); x2.scale.setScalar(0.94);
          const xg = new THREE.Group(); xg.rotation.z = Math.PI * 0.55; xg.add(x1, x2); gg.add(xg); gg.userData.l.push(c2, x1, x2);
        }
        return gg;
      });
      const ang = Math.atan2(z - worldZ(g.ay), x - worldX(g.ax)), sw = demon ? 2.1 : heavy ? 1.35 : 1.0;
      grp.position.set(x - Math.cos(ang) * 0.3, heavy ? 0.7 : 1.0, z - Math.sin(ang) * 0.3);
      grp.rotation.set(0, 0, 0); grp.rotateY(-ang); grp.rotateX(heavy ? -Math.PI / 2 + 1.25 : (g.flip ? 1 : -1) * 0.55 - Math.PI / 2); grp.rotateZ((g.flip ? -1 : 1) * (k * 2.0 - 1.0) * (heavy ? 0.6 : 1));
      grp.scale.setScalar((1.0 + k * 0.7) * sw);
      const op = Math.max(0, 1 - k * k); grp.userData.l.forEach((m, i) => (m.material.opacity = op * (i % 3 === 1 ? 0.85 : 1)));
    } else if (g.kind === "puff") { // 쓰러질 때 연기
      const grp = useMesh(g, () => {
        const gg = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: 0xf2f2f2, transparent: true, depthWrite: false });
        for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(GEO.pom, mat); s.userData.a = (i / 6) * Math.PI * 2 + Math.random(); s.userData.s = 1.2 + Math.random() * 1.2; gg.add(s); }
        return gg;
      });
      grp.position.set(x, 0.5, z);
      grp.children.forEach((s) => { const a = s.userData.a; s.position.set(Math.cos(a) * k * 0.9, k * 0.9, Math.sin(a) * k * 0.9); s.scale.setScalar(s.userData.s * (0.6 + k)); });
      grp.children[0].material.opacity = Math.max(0, 0.75 * (1 - k));
    } else if (g.kind === "spark") {
      const grp = useMesh(g, () => {
        const gg = new THREE.Group(), mat = additive(g.col);
        gg.userData.dirs = [];
        for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(GEO.spark, mat); gg.add(s); gg.userData.dirs.push(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize()); }
        return gg;
      });
      grp.position.set(x, 0.9, z);
      grp.children.forEach((s, i) => { s.position.copy(grp.userData.dirs[i]).multiplyScalar(k * 0.7); s.scale.setScalar(1 - k * 0.7); });
      grp.children[0].material.opacity = Math.max(0, 1 - k);
    } else if (g.kind === "pillar") { // 합성: 바닥에서 하늘로 솟는 빛 기둥
      const grp = useMesh(g, () => {
        const gg = new THREE.Group(), geo = GEO.pillar || (GEO.pillar = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true));
        gg.add(new THREE.Mesh(geo, additive(g.col)), new THREE.Mesh(geo, additive("#ffffff")));
        return gg;
      });
      const up = Math.min(1, k / 0.25), fade = k < 0.55 ? 1 : Math.max(0, 1 - (k - 0.55) / 0.45), h = (g.big ? 9 : 6) * up, w = g.big ? 0.75 : 0.55;
      grp.position.set(x, h / 2, z);
      grp.children[0].scale.set(w * (1 - k * 0.4), Math.max(0.01, h), w * (1 - k * 0.4)); grp.children[0].material.opacity = 0.55 * fade;
      grp.children[1].scale.set(w * 0.35, Math.max(0.01, h), w * 0.35); grp.children[1].material.opacity = 0.8 * fade;
      grp.rotation.y += dt * 3;
    } else if (g.kind === "stars") { // 합성: 별 폭죽이 솟았다가 떨어져요
      sgeo();
      const grp = useMesh(g, () => {
        const gg = new THREE.Group(), mat = additive(g.col);
        gg.userData.v = [];
        for (let i = 0; i < g.n; i++) {
          const s = new THREE.Mesh(SGEO.star, mat), a = (i / g.n) * Math.PI * 2 + Math.random() * 0.4, sp = 1.4 + Math.random() * 1.6;
          gg.add(s); gg.userData.v.push([Math.cos(a) * sp, 3.5 + Math.random() * 3, Math.sin(a) * sp, Math.random() * 10]);
        }
        return gg;
      });
      const tt = g.t0 - g.t;
      grp.position.set(x, 0.6, z);
      grp.children.forEach((s, i) => {
        const v = grp.userData.v[i]; s.position.set(v[0] * tt, v[1] * tt - 4.5 * tt * tt, v[2] * tt);
        s.rotation.set(v[3] + tt * 8, v[3] + tt * 11, 0); s.scale.setScalar(2.2 * (1 - k * 0.6));
      });
      grp.children[0].material.opacity = Math.max(0, 1 - k * k);
    } else {
      const m = useMesh(g, () => { const mm = new THREE.Mesh(GEO.ringFx, additive(g.col)); mm.rotation.x = -Math.PI / 2; return mm; });
      m.position.set(x, 0.24, z); m.scale.setScalar(Math.max(0.05, g.r * (0.3 + 0.9 * k)));
      m.material.opacity = Math.max(0, g.t / g.t0);
    }
  }
  return list.filter((g) => g.t > 0);
}
// 정주환 "천벌" 3D 연출: 몸 주위 전기 · 하늘의 번개 소용돌이 · 적마다 내리꽂는 지그재그 번개
let BGEO = null;
const _up = HAS3D ? new THREE.Vector3(0, 1, 0) : null;
function makeBolt(h, jag, w, cols, branches) {
  if (!BGEO) BGEO = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  const grp = new THREE.Group(), mats = cols.map((c) => additive(c));
  const line = (pts, wk) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], d = b.clone().sub(a), len = d.length();
      mats.forEach((mt, j) => {
        const m = new THREE.Mesh(BGEO, mt); m.position.copy(a).addScaledVector(d, 0.5);
        m.quaternion.setFromUnitVectors(_up, d.normalize()); m.scale.set(w * wk * (1 + j * 2.2), len, w * wk * (1 + j * 2.2)); grp.add(m);
      });
    }
  };
  const n = 9, pts = [];
  for (let i = 0; i <= n; i++) { const k = i / n, j = i === 0 || i === n ? 0 : jag; pts.push(new THREE.Vector3((Math.random() - 0.5) * j * 2, h * (1 - k), (Math.random() - 0.5) * j * 2)); }
  line(pts, 1);
  for (let bI = 0; bI < branches; bI++) {
    const s0 = pts[2 + Math.floor(Math.random() * (n - 4))], bp = [s0.clone()];
    for (let i = 1; i <= 3; i++) bp.push(bp[i - 1].clone().add(new THREE.Vector3((Math.random() - 0.5) * jag * 3, -h * 0.07, (Math.random() - 0.5) * jag * 3)));
    line(bp, 0.5);
  }
  grp.userData.mats = mats; return grp;
}
function drawSmite(z, dt) {
  const t = z.t, x = worldX(z.X), y = worldZ(z.Y), end = Math.max(0, Math.min(1, (z.dur - t) / 0.5));
  const g = useMesh(z, () => {
    const grp = new THREE.Group(), ud = grp.userData;
    ud.aura = new THREE.Group(); grp.add(ud.aura);
    ud.rings = ["#9fdcff", "#ffffff", "#ffe66b"].map((c, i) => { const m = new THREE.Mesh(GEO.ringFx, additive(c)); m.rotation.x = -Math.PI / 2 + (i - 1) * 0.5; m.position.y = 1.1; grp.add(m); return m; });
    ud.sky = new THREE.Group(); ud.sky.position.y = 7.5; grp.add(ud.sky);
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(GEO.ringFx, additive(i === 1 ? "#ffffff" : "#6fb8ff")); m.rotation.x = -Math.PI / 2; m.scale.setScalar(1.5 + i * 1.3); ud.sky.add(m); }
    return grp;
  });
  const ud = g.userData; g.position.set(x, 0, y);
  // 몸 주위 지지직: 짧은 번개를 계속 새로 그려요
  if (!ud.aT || (ud.aT -= dt) <= 0) {
    ud.aT = 0.06;
    while (ud.aura.children.length) { const c = ud.aura.children.pop(); c.userData.mats.forEach((m) => m.dispose()); }
    if (t < SMITE_CHARGE + 0.3) for (let i = 0; i < 3; i++) { const b = makeBolt(0.9, 0.12, 0.012, ["#ffffff", "#7fc8ff"], 0); const a = Math.random() * 6.3; b.position.set(Math.cos(a) * 0.4, 1.7, Math.sin(a) * 0.4); b.rotation.set(Math.random() - 0.5, 0, Math.random() - 0.5); ud.aura.add(b); }
  }
  const ck = Math.min(1, t / SMITE_CHARGE);
  ud.rings.forEach((r, i) => { r.rotation.z += dt * (5 + i * 3) * (i % 2 ? -1 : 1); r.scale.setScalar(0.4 + (1 - ck) * 1.2 + Math.sin(t * 30 + i) * 0.05); r.material.opacity = (t < SMITE_CHARGE + 0.2 ? 0.8 : 0) * ck; });
  ud.sky.rotation.y += dt * 2.5; ud.sky.scale.setScalar(0.3 + 0.7 * ck);
  ud.sky.children.forEach((m) => (m.material.opacity = 0.35 * ck * end));
  for (const s of (z.strikes || []).concat(z.big ? [z.big] : [])) {
    const k = t - s.at, life = s.mega ? 1.0 : s.big ? 0.6 : 0.5, pre = s.mega ? 0.7 : 0.25; if (k < -pre || k > life) continue;
    const m = useMesh(s, () => {
      const grp = new THREE.Group();
      grp.userData.ring = new THREE.Mesh(GEO.ringFx, additive("#bfe8ff")); grp.userData.ring.rotation.x = -Math.PI / 2; grp.userData.ring.position.y = 0.26; grp.add(grp.userData.ring);
      return grp;
    });
    const ud2 = m.userData, sx = s.hit ? s.X : s.o.X, sy = s.hit ? s.Y : s.o.Y;
    m.position.set(worldX(sx), 0, worldZ(sy));
    if (k < 0) { // 떨어지기 전: 바닥에 모이는 고리 (큰 번개는 넓은 경고 원)
      const q = 1 + k / pre; ud2.ring.scale.setScalar(s.mega ? 9 - q * 5 + Math.sin(t * 30) * 0.15 : (s.big ? 2.6 : 1.4) - q); ud2.ring.material.opacity = s.mega ? 0.4 + q * 0.6 : q;
      if (ud2.bolt) ud2.bolt.visible = false; continue;
    }
    // 번개는 0.05초마다 모양이 바뀌며 번쩍여요
    if (!ud2.bT || (ud2.bT -= dt) <= 0) {
      ud2.bT = 0.05;
      if (ud2.bolt) { m.remove(ud2.bolt); ud2.bolt.userData.mats.forEach((mt) => mt.dispose()); }
      ud2.bolt = s.mega ? makeBolt(22, 1.6, 0.7, ["#ffffff", "#9fdcff", "#ffe66b"], 9) : s.big ? makeBolt(14, 0.55, 0.16, ["#ffffff", "#9fdcff", "#ffe66b"], 4) : makeBolt(14, 0.45, 0.17, ["#ffffff", "#7fc8ff", "#ffe66b"], 3);
      if (s.mega) for (let i = 0; i < 6; i++) { const sb = makeBolt(16, 0.9, 0.18, ["#ffffff", "#9fdcff"], 2), a = (i / 6) * Math.PI * 2 + Math.random(); sb.position.set(Math.cos(a) * 3.2, 0, Math.sin(a) * 3.2); sb.userData.mats.forEach((mt) => ud2.bolt.userData.mats.push(mt)); ud2.bolt.add(sb); }
      m.add(ud2.bolt);
    }
    const q = Math.max(0, 1 - k / life), fl = 0.6 + Math.random() * 0.4;
    ud2.bolt.userData.mats.forEach((mt, j) => (mt.opacity = q * fl * (j ? 0.45 : 1)));
    ud2.bolt.visible = true;
    ud2.ring.scale.setScalar(s.mega ? 2 + k * 18 : (s.big ? 1 : 0.5) + k * (s.big ? 8 : 5)); ud2.ring.material.opacity = q;
  }
}
// 정주환 평타 번개: 떨어지기 전엔 대상 발밑에 작은 고리가 모이고, 맞는 순간 하늘에서 번개가 번쩍여요
function drawZap(z, dt) {
  const g = useMesh(z, () => {
    const grp = new THREE.Group();
    grp.userData.ring = new THREE.Mesh(GEO.ringFx, additive("#bfe8ff")); grp.userData.ring.rotation.x = -Math.PI / 2; grp.userData.ring.position.y = 0.26; grp.add(grp.userData.ring);
    return grp;
  });
  const ud = g.userData, k = z.t - z.hitAt;
  g.position.set(worldX(z.X), 0, worldZ(z.Y));
  if (k < 0) { const q = 1 + k / z.hitAt; ud.ring.scale.setScalar(1.1 - q * 0.7); ud.ring.material.opacity = 0.3 + q * 0.5; if (ud.bolt) ud.bolt.visible = false; return; }
  if (!ud.bT || (ud.bT -= dt) <= 0) {
    ud.bT = 0.05;
    if (ud.bolt) { g.remove(ud.bolt); ud.bolt.userData.mats.forEach((mt) => mt.dispose()); }
    ud.bolt = makeBolt(9, 0.3, 0.09, ["#ffffff", "#9fdcff", "#ffe66b"], 1); g.add(ud.bolt);
  }
  const q = Math.max(0, 1 - k / (z.dur - z.hitAt)), fl = 0.6 + Math.random() * 0.4;
  ud.bolt.userData.mats.forEach((mt, j) => (mt.opacity = q * fl * (j ? 0.45 : 1)));
  ud.bolt.visible = true;
  ud.ring.scale.setScalar(0.4 + k * 5); ud.ring.material.opacity = q;
}
// ----- 4코스트 스킬 3D 연출 -----
let ZGEO = null;
const zgeo = () => ZGEO || (ZGEO = { bar: new THREE.BoxGeometry(1, 0.03, 1), cube: new THREE.BoxGeometry(1, 1, 1), tri: new THREE.RingGeometry(0.9, 1, 3, 1), tube: new THREE.CylinderGeometry(1, 1, 1, 12, 1, true), cone: new THREE.CylinderGeometry(0.25, 1.6, 8, 20, 1, true) });
// 박희찬: 발밑에 모이는 고리 + 대상까지 이어지는 조준선
function drawFreekick(z, dt) {
  const k = Math.min(1, z.t / z.dur), x = worldX(z.X), y = worldZ(z.Y), tx = worldX(z.tgt.X), ty = worldZ(z.tgt.Y);
  const g = useMesh(z, () => {
    const grp = new THREE.Group(), ud = grp.userData;
    ud.rings = [z.kind === "snipe" ? "#ff5a4a" : "#ffb43a", "#ffffff"].map((c) => { const m = new THREE.Mesh(GEO.ringFx, additive(c)); m.rotation.x = -Math.PI / 2; grp.add(m); return m; });
    ud.line = new THREE.Mesh(zgeo().bar, additive(z.kind === "snipe" ? "#ff3a2a" : "#ffd36b")); grp.add(ud.line);
    ud.cross = new THREE.Group(); grp.add(ud.cross);
    if (z.kind === "snipe") for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(zgeo().bar, additive("#ff5a4a")); b.scale.set(1.5, 1, 0.06); b.rotation.y = i * Math.PI / 2; ud.cross.add(b); }
    ud.mark = new THREE.Mesh(GEO.ringFx, additive("#ff5a2a")); ud.mark.rotation.x = -Math.PI / 2; grp.add(ud.mark);
    return grp;
  });
  const ud = g.userData; g.position.set(0, 0.26, 0);
  ud.rings.forEach((r, i) => { r.position.set(x, 0, y); r.scale.setScalar(1.6 - k * (1.1 - i * 0.3)); r.material.opacity = 0.4 + k * 0.6; r.rotation.z += dt * (i ? -9 : 7); });
  const dx = tx - x, dy = ty - y, len = Math.hypot(dx, dy);
  ud.line.position.set(x + dx / 2, 0, y + dy / 2); ud.line.rotation.y = -Math.atan2(dy, dx);
  ud.line.scale.set(len * k, 1, 0.05 + 0.1 * (1 - k)); ud.line.material.opacity = 0.35 + 0.5 * k;
  ud.mark.position.set(tx, 0, ty); ud.mark.scale.setScalar(1.3 - k * 0.7); ud.mark.material.opacity = k;
  ud.cross.position.set(tx, 0, ty); ud.cross.rotation.y += dt * 4; ud.cross.scale.setScalar(1.6 - k * 0.8); ud.cross.children.forEach((b) => (b.material.opacity = k));
}
// ----- 2코스트 스킬 3D 연출 -----
// 이준희: 대상 위에 농구 골대가 나타났다가, 공과 함께 내리꽂혀요
function drawDunk(z, dt) {
  const g = useMesh(z, () => {
    const grp = new THREE.Group(), ud = grp.userData;
    const hoop = (ud.hoop = new THREE.Group()); grp.add(hoop);
    const white = (ud.white = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide }));
    const board = new THREE.Mesh(zgeo().cube, white); board.scale.set(1.3, 0.85, 0.05); board.position.set(0, 0.45, -0.5); hoop.add(board);
    const sq = new THREE.Mesh(zgeo().cube, (ud.red = new THREE.MeshBasicMaterial({ color: 0xe8402e, transparent: true }))); sq.scale.set(0.5, 0.36, 0.06); sq.position.set(0, 0.32, -0.49); hoop.add(sq);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.045, 8, 24), (ud.orange = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true }))); rim.rotation.x = Math.PI / 2; hoop.add(rim);
    const net = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.24, 0.5, 12, 1, true), (ud.net = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, wireframe: true }))); net.position.y = -0.27; hoop.add(net);
    ud.ball = new THREE.Mesh(GEO.ball, new THREE.MeshStandardMaterial({ map: bballTex(), roughness: 0.7, transparent: true })); ud.ball.scale.setScalar(2.6); grp.add(ud.ball);
    ud.ring = new THREE.Mesh(GEO.ringFx, additive("#ff8a3a")); ud.ring.rotation.x = -Math.PI / 2; ud.ring.position.y = 0.26; grp.add(ud.ring);
    return grp;
  });
  const ud = g.userData, t = z.t, fade = Math.max(0, Math.min(1, (z.dur - t) / 0.3)), pop = Math.min(1, t / 0.12);
  g.position.set(worldX(z.X), 0, worldZ(z.Y));
  const slam = Math.max(0, Math.min(1, (t - DUNK_AT) / 0.1));
  ud.hoop.position.y = 2.7 - slam * 1.9; ud.hoop.scale.setScalar((0.3 + 0.7 * pop) * (1 + (slam > 0 && slam < 1 ? 0.2 : 0)));
  for (const m of [ud.white, ud.red, ud.orange, ud.net]) m.opacity = fade;
  const bp = Math.max(0, Math.min(1, (t - 0.12) / (DUNK_AT - 0.08))); // 공: 위에서 골대를 지나 바닥으로
  ud.ball.position.set(0, 4.2 - bp * 3.9 + (bp >= 1 ? Math.abs(Math.sin((t - DUNK_AT) * 12)) * 0.6 * fade : 0), 0); ud.ball.rotation.x += dt * 14; ud.ball.material.opacity = fade; ud.ball.visible = t > 0.1;
  ud.ring.scale.setScalar(1.5 - 0.9 * Math.min(1, t / DUNK_AT)); ud.ring.material.opacity = t < DUNK_AT ? 0.9 : 0;
}
// 이보경: 슬라이딩 자국 (속도선 세 줄)
function drawTackle(z, dt) {
  const g = useMesh(z, () => {
    const grp = new THREE.Group();
    grp.userData.bars = [-0.22, 0, 0.22].map((o, i) => { const m = new THREE.Mesh(zgeo().bar, additive(i === 1 ? "#ffffff" : z.col || "#7fe0a0")); m.userData.o = o; grp.add(m); return m; });
    return grp;
  });
  const x0 = worldX(z.ax), y0 = worldZ(z.ay), x1 = worldX(z.X), y1 = worldZ(z.Y), dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  const grow = Math.min(1, z.t / 0.12), q = Math.max(0, 1 - z.t / z.dur);
  g.position.set(x0, 0.27, y0); g.rotation.y = -Math.atan2(dy, dx);
  g.userData.bars.forEach((m) => { const l = len * grow; m.scale.set(l, 1, 0.07 + 0.08 * q); m.position.set(l / 2, 0, m.userData.o); m.material.opacity = q; });
}
// 윤동욱: 바닥에서 도는 태극 문양과 오가는 두 기운
function yinTex() {
  return textTex("yinyang", 256, 256, (g, w, h) => {
    const c = w / 2, R = w * 0.44; g.clearRect(0, 0, w, h);
    g.fillStyle = "#fff6e0"; g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#2a2060"; g.beginPath(); g.arc(c, c, R, Math.PI / 2, -Math.PI / 2); g.fill();
    g.beginPath(); g.arc(c, c - R / 2, R / 2, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#fff6e0"; g.beginPath(); g.arc(c, c + R / 2, R / 2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(c, c - R / 2, R / 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#2a2060"; g.beginPath(); g.arc(c, c + R / 2, R / 7, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#ffd36b"; g.lineWidth = 8; g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.stroke();
  });
}
function drawYinYang(z, dt) {
  const g = useMesh(z, () => {
    const grp = new THREE.Group(), ud = grp.userData;
    ud.disc = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: yinTex(), transparent: true, depthWrite: false, side: THREE.DoubleSide })); ud.disc.rotation.x = -Math.PI / 2; grp.add(ud.disc);
    ud.ring = new THREE.Mesh(GEO.ringFx, additive("#ffe7a0")); ud.ring.rotation.x = -Math.PI / 2; grp.add(ud.ring);
    ud.yang = new THREE.Mesh(GEO.ball, additive("#fff6e0")); ud.yang.scale.setScalar(2.2); grp.add(ud.yang);
    ud.yin = new THREE.Mesh(GEO.ball, additive("#8a7aff")); ud.yin.scale.setScalar(2.2); grp.add(ud.yin);
    return grp;
  });
  const ud = g.userData, t = z.t, fade = Math.max(0, Math.min(1, (z.dur - t) / 0.3)), grow = Math.min(1, t / 0.15);
  const tx = worldX(z.X), ty = worldZ(z.Y), ux = worldX(z.owner.X), uy = worldZ(z.owner.Y);
  g.position.set(0, 0, 0);
  ud.disc.position.set(tx, 0.28, ty); ud.disc.rotation.z -= dt * 9; ud.disc.scale.setScalar(Math.max(0.01, grow) * (0.85 + 0.15 * fade)); ud.disc.material.opacity = 0.95 * fade;
  ud.ring.position.set(tx, 0.27, ty); ud.ring.scale.setScalar(1.1 + Math.sin(t * 10) * 0.06); ud.ring.material.opacity = 0.8 * fade;
  const fly = (m, a, x0, y0, x1, y1) => { m.visible = a > 0 && a < 1; if (m.visible) m.position.set(x0 + (x1 - x0) * a, 1 + Math.sin(a * Math.PI) * 1.4, y0 + (y1 - y0) * a); };
  fly(ud.yang, t / 0.25, ux, uy, tx, ty);            // 양의 기운: 나 → 대상
  fly(ud.yin, (t - 0.3) / 0.45, tx, ty, ux, uy);     // 음의 기운: 대상 → 나 (회복)
}
// ----- 3코스트 스킬 3D 연출 -----
const glowTex = (sym, key, inner, outer, color = "#ffffff") => textTex(key + sym, 128, 128, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle"; g.font = "bold 80px serif"; g.fillText(sym, w / 2, h / 2 + 4);
});
// 김민기: 거대한 연필이 줄을 세 번 그어요
function drawScribble(z, dt) {
  const g = useMesh(z, () => {
    const grp = new THREE.Group(), ud = grp.userData;
    ud.lines = [-0.55, 0.55, 0].map((a, i) => { const piv = new THREE.Group(); piv.rotation.y = a; piv.position.z = (i - 1) * 0.5; grp.add(piv); const m = new THREE.Mesh(zgeo().bar, additive(i % 2 ? "#ffffff" : "#ffe66b")); piv.add(m); return m; });
    const pen = (ud.pen = new THREE.Group()); grp.add(pen);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.2, 6), new THREE.MeshStandardMaterial({ color: lin(0xf5c518), roughness: 0.5 })); body.position.y = 1.5; pen.add(body);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 6), new THREE.MeshStandardMaterial({ color: lin(0x5a3e2a), roughness: 0.7 })); tip.rotation.x = Math.PI; tip.position.y = 0.2; pen.add(tip);
    const er = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.25, 8), new THREE.MeshStandardMaterial({ color: lin(0xff8aa8), roughness: 0.6 })); er.position.y = 2.72; pen.add(er);
    pen.rotation.z = -0.45;
    return grp;
  });
  const ud = g.userData, LEN = 3.4, fade = Math.max(0, Math.min(1, (z.dur - z.t) / 0.2));
  g.position.set(worldX(z.X), 0.27, worldZ(z.Y));
  let cur = -1, cp = 0;
  ud.lines.forEach((m, i) => {
    const p = Math.max(0, Math.min(1, (z.t - (SCRIB_AT[i] - 0.15)) / 0.15)), len = LEN * p;
    m.scale.set(Math.max(0.001, len), 1, 0.12); m.position.x = -LEN / 2 + len / 2; m.material.opacity = fade * (p > 0 ? 1 : 0);
    if (p > 0 && p < 1) { cur = i; cp = p; }
  });
  ud.pen.visible = cur >= 0;
  if (cur >= 0) { const piv = ud.lines[cur].parent, x = -LEN / 2 + LEN * cp; ud.pen.position.set(Math.cos(piv.rotation.y) * x, 0, piv.position.z - Math.sin(piv.rotation.y) * x); }
}
// 임시온: 앞에 골대가 쿵 내려와요
function drawGoal(z, dt) {
  const g = useMesh(z, () => {
    const grp = new THREE.Group(), ud = grp.userData;
    const white = (ud.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
    const bar = (w, h, x, y) => { const m = new THREE.Mesh(zgeo().cube, white); m.scale.set(w, h, 0.1); m.position.set(x, y, 0); grp.add(m); };
    bar(0.14, 2.5, -1.75, 1.25); bar(0.14, 2.5, 1.75, 1.25); bar(3.64, 0.14, 0, 2.5);
    const net = textTex("goalnet", 256, 128, (c, w, h) => { c.clearRect(0, 0, w, h); c.strokeStyle = "rgba(255,255,255,.9)"; c.lineWidth = 2; for (let x = 0; x <= w; x += 16) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y <= h; y += 16) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); } });
    ud.net = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 2.45), new THREE.MeshBasicMaterial({ map: net, transparent: true, side: THREE.DoubleSide, depthWrite: false })); ud.net.position.y = 1.25; grp.add(ud.net);
    ud.wall = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 2.45), additive("#4fa8ff")); ud.wall.position.set(0, 1.25, 0.02); grp.add(ud.wall);
    ud.ring = new THREE.Mesh(GEO.ringFx, additive("#7fc4ff")); ud.ring.rotation.x = -Math.PI / 2; grp.add(ud.ring);
    return grp;
  });
  const ud = g.userData, t = z.t, fade = Math.max(0, Math.min(1, (z.dur - t) / 0.3));
  const x = worldX(z.X), y = worldZ(z.Y), fy = worldZ(z.Y + (z.team ? 0.6 : -0.6)) - y; // 적 쪽으로 한 발 앞
  const fall = Math.min(1, t / 0.16), drop = (1 - fall) * (1 - fall) * 5 + (fall >= 1 ? Math.abs(Math.sin((t - 0.16) * 14)) * 0.25 * Math.max(0, 1 - (t - 0.16) / 0.35) : 0);
  g.position.set(x, 0.2 + drop, y + fy);
  ud.mat.opacity = fade; ud.net.material.opacity = 0.75 * fade; ud.wall.material.opacity = (0.3 + Math.sin(t * 16) * 0.08) * fade;
  ud.ring.position.set(0, 0.06 - drop, -fy); ud.ring.scale.setScalar(1.4 + Math.sin(t * 8) * 0.12); ud.ring.material.opacity = 0.8 * fade;
}
// 김예균: 마법진과 소환 빛기둥
function drawSummon(z, dt) {
  const g = useMesh(z, () => {
    const grp = new THREE.Group(), ud = grp.userData;
    ud.circle = new THREE.Group(); grp.add(ud.circle);
    const flat = (geo, col, s) => { const m = new THREE.Mesh(geo, additive(col)); m.rotation.x = -Math.PI / 2; m.scale.setScalar(s); ud.circle.add(m); return m; };
    flat(GEO.ringFx, "#7ff0e0", 1.9); flat(GEO.ringFx, "#ffffff", 1.5);
    const tri = zgeo().tri; ud.tri = [flat(tri, "#2fd0c0", 1.75), flat(tri, "#7ff0e0", 1.75)]; ud.tri[1].rotation.z = Math.PI;
    ud.beams = z.spots.map(() => { const b = new THREE.Mesh(zgeo().tube, additive("#7ff0e0")); grp.add(b); return b; });
    return grp;
  });
  const ud = g.userData, t = z.t, x = worldX(z.X), y = worldZ(z.Y), fade = Math.max(0, Math.min(1, (z.dur - t) / 0.35)), grow = Math.min(1, t / 0.2);
  g.position.set(x, 0, y);
  ud.circle.position.y = 0.26; ud.circle.scale.setScalar(Math.max(0.01, grow)); ud.circle.rotation.y += dt * 2.2;
  ud.circle.children.forEach((m, i) => (m.material.opacity = fade * (i === 1 ? 0.6 : 0.9)));
  ud.tri[1].rotation.z -= dt * 4.4;
  ud.beams.forEach((b, i) => { const s = z.spots[i], q = Math.max(0, 1 - t / 0.8); b.position.set(worldX(s.X) - x, 4, worldZ(s.Y) - y); b.scale.set(0.08 + 0.2 * q, 8, 0.08 + 0.2 * q); b.material.opacity = 0.4 * q; });
}
// 진성욱: 내리찍은 자리에 갈라진 땅과 퍼지는 충격파
function drawSlam(z, dt) {
  const k = z.t - SLAM_AT; if (k < 0) return;
  const life = z.dur - SLAM_AT, q = Math.max(0, 1 - k / life);
  const g = useMesh(z, () => {
    const grp = new THREE.Group(), ud = grp.userData; ud.cracks = []; ud.rings = [];
    for (let i = 0; i < 9; i++) {
      const piv = new THREE.Group(); piv.rotation.y = (i / 9) * Math.PI * 2 + Math.random() * 0.4; grp.add(piv);
      const c = new THREE.Mesh(zgeo().bar, additive(i % 2 ? "#ff5a2a" : "#ffd36b")); c.userData.len = 1.6 + Math.random() * 1.4; piv.add(c); ud.cracks.push(c);
    }
    for (const c of ["#ffffff", "#ff8a3a", "#ff3a2a"]) { const m = new THREE.Mesh(GEO.ringFx, additive(c)); m.rotation.x = -Math.PI / 2; grp.add(m); ud.rings.push(m); }
    ud.dome = new THREE.Mesh(GEO.ball, additive("#ffb43a")); grp.add(ud.dome);
    return grp;
  });
  const ud = g.userData, grow = Math.min(1, k / 0.12);
  g.position.set(worldX(z.X), 0.25, worldZ(z.Y));
  ud.cracks.forEach((c) => { const len = c.userData.len * grow; c.scale.set(len, 1, 0.09 * (0.4 + q)); c.position.x = len / 2 + 0.3; c.material.opacity = q; });
  ud.rings.forEach((r, i) => { r.scale.setScalar(0.4 + k * (5.5 - i * 1.3)); r.material.opacity = q * (i ? 0.7 : 1); });
  ud.dome.scale.set(1 + grow * 12, Math.max(0.01, (1 - Math.min(1, k / 0.3)) * 8), 1 + grow * 12); ud.dome.material.opacity = Math.max(0, 0.5 - k * 1.8);
}
// 최윤서 그물: 날아가서 펼쳐진 뒤, 묶는 동안 바닥에 깔려 있어요
const netTex = () => textTex("net", 256, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h); g.strokeStyle = "#ffffff"; g.lineWidth = 11; g.lineCap = "round";
  const cx = w / 2, R = w * 0.47;
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(cx, cx); g.lineTo(cx + Math.cos(a) * R, cx + Math.sin(a) * R); g.stroke(); }
  for (let k = 1; k <= 4; k++) { g.beginPath(); g.arc(cx, cx, (R * k) / 4, 0, 7); g.stroke(); }
  g.lineWidth = 18; g.beginPath(); g.arc(cx, cx, R, 0, 7); g.stroke();
});
function drawNet(z, dt) {
  const k = z.t - z.hitAt, fade = Math.max(0, Math.min(1, (z.dur - z.t) / 0.4));
  const g = useMesh(z, () => {
    const grp = new THREE.Group(), ud = grp.userData;
    ud.net = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: netTex(), color: new THREE.Color("#2dffb0"), transparent: true, depthWrite: false, side: THREE.DoubleSide })); ud.net.rotation.x = -Math.PI / 2; grp.add(ud.net);
    ud.ring = new THREE.Mesh(GEO.ringFx, additive("#2fd0a0")); ud.ring.rotation.x = -Math.PI / 2; ud.ring.position.y = 0.05; grp.add(ud.ring);
    return grp;
  });
  const ud = g.userData, d = z.rad * 2 + 1.2;
  if (k < 0) { // 날아가는 동안: 작은 그물이 포물선을 그리며 커져요
    const q = 1 + k / z.hitAt, ex = worldX(z.X), ez = worldZ(z.Y), sx = worldX(z.ox), sz = worldZ(z.oy);
    g.position.set(sx + (ex - sx) * q, 0.6 + Math.sin(q * Math.PI) * 2.2, sz + (ez - sz) * q);
    ud.net.rotation.z += dt * 8; ud.net.scale.setScalar(0.5 + q * 1.2); ud.net.material.opacity = 0.9;
    ud.ring.scale.setScalar(z.rad + 0.6 - q * 0.4); ud.ring.material.opacity = 0.35 + q * 0.5; ud.ring.position.set(ex - g.position.x, 0.05 - g.position.y, ez - g.position.z);
    return;
  }
  g.position.set(worldX(z.X), 0.12, worldZ(z.Y)); ud.ring.position.set(0, 0, 0);
  // 걸린 적마다 그물이 몸을 덮어요 (유닛에 가려지지 않게 위에 그려요)
  for (const c of z.caught || []) {
    const cm = useMesh(c, () => { const sg = new THREE.SphereGeometry(0.62, 14, 10); sg.userData.own = 1; const m = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: netTex(), color: new THREE.Color("#2dffb0"), transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide })); m.renderOrder = 20; return m; });
    const on = c.o.alive && c.o.stunT > 0;
    cm.visible = on; cm.position.set(worldX(c.o.X), 0.85, worldZ(c.o.Y)); cm.scale.set(1, 1.35, 1); cm.rotation.y += dt * 0.6;
    cm.material.opacity = (0.95 + Math.sin(z.t * 16 + c.o.X) * 0.05) * fade;
  }
  const open = Math.min(1, k / 0.12);
  ud.net.rotation.z = 0.3; ud.net.scale.setScalar(d * 1.15 * (0.8 + 0.2 * open)); g.position.y = 0.2; ud.net.material.opacity = (0.95 + Math.sin(z.t * 14) * 0.05) * fade;
  ud.ring.scale.setScalar(d * 0.45 + k * 3); ud.ring.material.opacity = Math.max(0, 0.7 - k * 2.2);
}
// 은혜린 춤추기 바닥: 무지갯빛 디스코 조각판
const discoTex = () => textTex("disco", 256, 256, (g, w, h) => {
  const cols = ["#ff5fa8", "#ffe66b", "#5fb8ff", "#ffffff", "#b06bff", "#6bffb8"], cx = w / 2, R = w / 2;
  g.clearRect(0, 0, w, h);
  for (let ring = 3; ring >= 0; ring--) for (let i = 0; i < 12; i++) {
    g.fillStyle = cols[(i + ring * 2) % cols.length]; g.globalAlpha = 0.85 - ring * 0.08;
    g.beginPath(); g.moveTo(cx, cx); g.arc(cx, cx, R * ((ring + 1) / 4), (i / 12) * Math.PI * 2, ((i + 1) / 12) * Math.PI * 2); g.closePath(); g.fill();
  }
  g.globalAlpha = 1; g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 5; g.beginPath(); g.arc(cx, cx, R - 3, 0, 7); g.stroke();
});
// 은혜린 춤추기: 반짝이는 무대 + 떠오르는 음표
function drawDance(z, dt) {
  const t = z.t, fade = Math.max(0, Math.min(1, (z.dur - t) / 0.4)), x = worldX(z.X), y = worldZ(z.Y), R = Math.min(z.rad, 4.5);
  const g = useMesh(z, () => {
    const grp = new THREE.Group(), ud = grp.userData;
    ud.floor = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ map: discoTex(), transparent: true, depthWrite: false })); ud.floor.rotation.x = -Math.PI / 2; ud.floor.position.y = 0.27; ud.floor.renderOrder = 2; grp.add(ud.floor);
    ud.rings = ["#ff7ab0", "#ffe66b", "#7fc4ff"].map((c) => { const m = new THREE.Mesh(GEO.ringFx, additive(c)); m.rotation.x = -Math.PI / 2; m.position.y = 0.3; grp.add(m); return m; });
    ud.spot = new THREE.Mesh(zgeo().cone, additive("#ffb0d8")); ud.spot.position.y = 4; grp.add(ud.spot);
    ud.notes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(i % 2 ? "♪" : "♫", "note", "rgba(255,122,176,.95)", "rgba(255,160,60,0)", "#ffffff"), transparent: true, depthWrite: false })); grp.add(sp); return sp; });
    return grp;
  });
  const ud = g.userData; g.position.set(x, 0, y);
  ud.floor.scale.setScalar(R * (0.55 + 0.45 * Math.min(1, t / 0.25))); ud.floor.rotation.z += dt * 0.7; ud.floor.material.opacity = (0.8 + Math.sin(t * 10) * 0.12) * fade;
  for (const c of z.on || []) { // 무대 위 아군 발밑마다 반짝이는 고리
    const m = useMesh(c, () => { const r = new THREE.Mesh(GEO.ringFx, additive("#ff9ad0")); r.rotation.x = -Math.PI / 2; return r; });
    m.visible = c.o.alive; m.position.set(worldX(c.o.X), 0.32, worldZ(c.o.Y)); m.scale.setScalar(0.55 + Math.sin(t * 9 + c.o.X) * 0.08); m.material.opacity = 0.9 * fade;
  }
  ud.rings.forEach((r, i) => { r.rotation.z += dt * (2 + i) * (i % 2 ? -1 : 1); r.scale.setScalar(R * (0.55 + 0.45 * Math.min(1, t / 0.25)) * (1 - i * 0.12) + Math.sin(t * 8 + i) * 0.05); r.material.opacity = (0.55 - i * 0.12) * fade; });
  ud.spot.rotation.y += dt; ud.spot.material.opacity = 0.16 * fade;
  ud.notes.forEach((sp, i) => { const a = t * 2.4 + i * 1.05, rr = Math.min(R, 2.4) * (0.5 + 0.5 * Math.abs(Math.sin(i * 1.7))); sp.position.set(Math.cos(a) * rr, 1.0 + ((t * 1.2 + i * 0.4) % 1.8), Math.sin(a) * rr); sp.scale.setScalar(1.15 + Math.sin(t * 9 + i) * 0.15); sp.material.opacity = fade; });
}
// 박준서: 빛나는 수학 공식이 비스듬히 떨어져요 (가로로 긴 판에 공식을 써요)
function symTex(sym, rgb1 = "200,107,255", rgb2 = "120,60,220") {
  return textTex("sym" + rgb1 + sym, 512, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.save(); g.translate(w / 2, h / 2); g.scale(w / h, 1);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, h / 2); gr.addColorStop(0, `rgba(${rgb1},.95)`); gr.addColorStop(0.6, `rgba(${rgb2},.6)`); gr.addColorStop(1, `rgba(${rgb2},0)`);
    g.fillStyle = gr; g.fillRect(-h / 2, -h / 2, h, h); g.restore();
    g.textAlign = "center"; g.textBaseline = "middle"; g.font = "bold italic 64px serif";
    const k = Math.min(1, (w * 0.8) / g.measureText(sym).width); // 긴 공식은 줄여서 맞춰요
    g.translate(w / 2, h / 2 + 3); g.scale(k, k);
    g.lineWidth = 6; g.strokeStyle = "rgba(40,10,80,.9)"; g.strokeText(sym, 0, 0); g.fillStyle = "#ffffff"; g.fillText(sym, 0, 0);
  });
}
function drawMathRain(z, dt) {
  const FALL = 0.4;
  z.drops.forEach((d, i) => {
    const k = z.t - d.at; if (k < -FALL || k >= 0) return;
    const p = 1 + k / FALL, x = worldX(d.X), y = worldZ(d.Y), big = i === z.drops.length - 1 ? 1.5 : 1;
    const g = useMesh(d, () => {
      const grp = new THREE.Group(), ud = grp.userData;
      ud.sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: symTex(d.sym), transparent: true, depthWrite: false })); grp.add(ud.sp);
      ud.tail = new THREE.Mesh(zgeo().bar, additive("#c86bff")); grp.add(ud.tail);
      ud.ring = new THREE.Mesh(GEO.ringFx, additive("#e39cff")); ud.ring.rotation.x = -Math.PI / 2; grp.add(ud.ring);
      return grp;
    });
    const ud = g.userData, hgt = 1 + (1 - p) * 10, off = (1 - p) * 3;
    g.position.set(x, 0, y);
    ud.sp.position.set(off, hgt, -off * 0.4); const ss = 1.25 * big * (0.9 + Math.sin(clock3d * 30 + i) * 0.06); ud.sp.scale.set(ss * 4, ss, 1);
    ud.tail.position.set(off * 1.12, hgt + 1.1, -off * 0.45); ud.tail.rotation.z = Math.PI / 2 - 0.29; ud.tail.scale.set(2.6, 4, 0.22 * big); ud.tail.material.opacity = 0.7;
    ud.ring.position.y = 0.26; ud.ring.scale.setScalar((1.5 - p) * big); ud.ring.material.opacity = p;
  });
}
// 김예균 "이다연 군단": 발밑의 큰 마법진, 하늘의 소환문, 떨어질 자리로 꽂히는 빛줄기
function drawLegion(z, dt) {
  const t = z.t, x = worldX(z.X), y = worldZ(z.Y), fade = Math.max(0, Math.min(1, (z.dur - t) / 0.45)), grow = Math.min(1, t / 0.3);
  const g = useMesh(z, () => {
    const grp = new THREE.Group(), ud = grp.userData;
    ud.circle = new THREE.Group(); grp.add(ud.circle);
    const flat = (geo, col, s, parent) => { const m = new THREE.Mesh(geo, additive(col)); m.rotation.x = -Math.PI / 2; m.scale.setScalar(s); parent.add(m); return m; };
    for (const [s, c] of [[2.8, "#7ff0e0"], [2.4, "#ffffff"], [1.6, "#2fd0c0"]]) flat(GEO.ringFx, c, s, ud.circle);
    ud.tri = [flat(zgeo().tri, "#2fd0c0", 2.35, ud.circle), flat(zgeo().tri, "#7ff0e0", 2.35, ud.circle)]; ud.tri[1].rotation.z = Math.PI;
    ud.portal = new THREE.Group(); ud.portal.position.y = 7; grp.add(ud.portal);
    for (const [s, c] of [[3.2, "#7ff0e0"], [2.5, "#ffffff"], [1.8, "#2fd0c0"], [1.0, "#ffffff"]]) flat(GEO.ringFx, c, s, ud.portal);
    ud.core = new THREE.Mesh(GEO.ball, additive("#bffff6")); ud.core.scale.setScalar(6); ud.portal.add(ud.core);
    ud.beams = z.news.map((f) => { const b = new THREE.Mesh(zgeo().tube, additive(f.mon.giant ? "#ffffff" : "#7ff0e0")); grp.add(b); return b; });
    ud.marks = z.news.map((f) => flat(GEO.ringFx, f.mon.giant ? "#ffffff" : "#7ff0e0", f.mon.giant ? 1.8 : 0.9, grp));
    return grp;
  });
  const ud = g.userData; g.position.set(x, 0, y);
  ud.circle.position.y = 0.27; ud.circle.scale.setScalar(Math.max(0.01, grow)); ud.circle.rotation.y += dt * 1.6;
  ud.circle.children.forEach((m) => (m.material.opacity = 0.85 * fade)); ud.tri[1].rotation.z -= dt * 3.5;
  ud.portal.rotation.y -= dt * 2.4; ud.portal.scale.setScalar(Math.max(0.01, grow) * (z.legend ? 1.4 : 1) * (1 + Math.sin(t * 9) * 0.04));
  ud.portal.children.forEach((m) => (m.material.opacity = 0.75 * fade)); ud.core.material.opacity = 0.35 * fade;
  z.news.forEach((f, i) => {
    const b = ud.beams[i], mk = ud.marks[i], fx = worldX(f.X) - x, fy = worldZ(f.Y) - y;
    const pre = Math.min(1, t / 0.35), on = f.landed ? Math.max(0, 1 - (t - f.dropAt) / 0.35) : pre;
    const dx = fx, dz = fy, top = 7, len = Math.hypot(dx, top, dz); // 소환문 → 떨어질 자리
    b.position.set(dx / 2, top / 2, dz / 2); b.lookAt(x + dx, 0, y + dz); b.rotateX(Math.PI / 2);
    const w = f.mon.giant ? 0.35 : 0.12; b.scale.set(w * on, len, w * on); b.material.opacity = 0.55 * on * fade;
    mk.position.set(fx, 0.28, fy); mk.scale.setScalar((f.mon.giant ? 1.8 : 0.9) * (f.landed ? 1 + (t - f.dropAt) * 4 : 1.3 - 0.3 * pre)); mk.material.opacity = (f.landed ? on : 0.9) * fade;
  });
}
// 김예균 "세계를 가르는 참격": 몸에서 핏빛 고리가 솟고, 하늘에 붉은 고리 → 참격이 하늘에서 내리꽂힘 → 전장을 가로지르는 거대한 참격
function drawRend(z, dt) {
  const t = z.t, x = worldX(z.X), y = worldZ(z.Y), end = Math.max(0, Math.min(1, (z.dur - t) / 0.5)), ck = Math.min(1, t / REND_AT);
  const T = fxTex(), Q = GEO.fxQuad || (GEO.fxQuad = new THREE.PlaneGeometry(1, 1));
  const g = useMesh(z, () => {
    const grp = new THREE.Group(), ud = grp.userData;
    const flat = (col, sc, parent, op = 1) => { const m = new THREE.Mesh(GEO.ringFx, additive(col)); m.rotation.x = -Math.PI / 2; m.scale.setScalar(sc); m.userData.op = op; parent.add(m); return m; };
    ud.me = new THREE.Group(); grp.add(ud.me); // 시전자 둘레
    ud.rings = ["#ff2a3a", "#ffffff", "#8a0018"].map((c, i) => { const m = flat(c, 1, ud.me); m.position.y = 0.3 + i * 0.5; return m; });
    ud.sig = new THREE.Group(); ud.me.add(ud.sig);
    for (const [sc, c] of [[2.4, "#ff2a3a"], [1.9, "#ff9a6a"], [1.4, "#8a0018"]]) flat(c, sc, ud.sig);
    ud.tri = [new THREE.Mesh(zgeo().tri, additive("#ff2a3a")), new THREE.Mesh(zgeo().tri, additive("#ff2a3a"))];
    ud.tri.forEach((m, i) => { m.rotation.x = -Math.PI / 2; m.rotation.z = i * Math.PI; m.scale.setScalar(1.85); ud.sig.add(m); });
    ud.sig.position.y = 0.27;
    ud.sky = new THREE.Group(); ud.sky.position.set(0, 8.5, 0); grp.add(ud.sky); // 하늘의 붉은 고리 (전장 가운데 위)
    for (let i = 0; i < 4; i++) flat(i === 1 ? "#ffffff" : i === 3 ? "#5a0010" : "#ff2a3a", 2.5 + i * 2.2, ud.sky);
    ud.world = new THREE.Group(); grp.add(ud.world); // 거대한 참격
    for (const [h, c, op, tx] of [[1.4, "#5a0010", 0.7, T.streak], [0.6, "#ff2a3a", 1, T.needle], [0.2, "#ffffff", 1, T.needle]]) { const m = new THREE.Mesh(Q, addTex(tx, c, op)); m.scale.set(40, h, 1); m.userData.h = h; ud.world.add(m); }
    const cr = new THREE.Mesh(Q, addTex(T.crescent, "#ff2a3a")); cr.rotation.set(-Math.PI / 2, 0, 0); cr.scale.setScalar(5); ud.world.add(cr); ud.worldCres = cr;
    ud.rift = new THREE.Mesh(Q, addTex(T.streak, "#ff2a3a", 0.8)); ud.rift.rotation.x = -Math.PI / 2; grp.add(ud.rift); // 땅에 남는 갈라진 자국
    return grp;
  });
  const ud = g.userData; g.position.set(0, 0, 0);
  ud.me.position.set(x, 0, y);
  ud.rings.forEach((r, i) => { r.rotation.z += dt * (6 + i * 3) * (i % 2 ? -1 : 1); r.scale.setScalar(0.5 + (1 - ck) * 1.6 + Math.sin(t * 30 + i) * 0.06); r.material.opacity = (t < REND_AT + 0.2 ? 0.85 : 0) * ck; });
  ud.sig.scale.setScalar(Math.max(0.01, ck)); ud.sig.rotation.y -= dt * 2.4; ud.tri[1].rotation.z += dt * 4;
  ud.sig.children.forEach((m) => (m.material.opacity = 0.8 * end));
  ud.sky.position.x = worldX(3.5); ud.sky.position.z = worldZ(3.5);
  ud.sky.rotation.y += dt * 1.8; ud.sky.scale.setScalar(0.3 + 0.7 * ck);
  ud.sky.children.forEach((m, i) => (m.material.opacity = (i === 3 ? 0.5 : 0.4) * ck * end));
  // 하늘에서 쏟아지는 참격
  for (const d of z.drops) {
    const k = t - d.at, pre = REND_FALL; if (k < -pre || k > 0.5) { const o = pool.get(d); if (o) o.o.visible = false; continue; }
    const m = useMesh(d, () => {
      const grp = new THREE.Group(), u2 = grp.userData;
      u2.blade = new THREE.Group(); grp.add(u2.blade);
      for (const [sc, c, op] of [[3.2, "#5a0010", 0.7], [2.6, "#ff2a3a", 1], [2.0, "#ffffff", 0.9]]) { const c2 = new THREE.Mesh(Q, addTex(T.crescent, c, op)); c2.rotation.z = -Math.PI / 2; c2.scale.setScalar(sc); u2.blade.add(c2); }
      u2.trail = new THREE.Mesh(Q, addTex(T.streak, "#ff2a3a", 0.9)); u2.trail.rotation.z = Math.PI / 2; u2.trail.scale.set(5, 0.5, 1); u2.trail.position.y = 2.6; grp.add(u2.trail);
      u2.mark = new THREE.Mesh(GEO.ringFx, additive("#ff2a3a")); u2.mark.rotation.x = -Math.PI / 2; u2.mark.position.y = 0.27; grp.add(u2.mark);
      return grp;
    });
    m.visible = true;
    const u2 = m.userData; m.position.set(worldX(d.X), 0, worldZ(d.Y)); m.rotation.y = d.yaw;
    if (k < 0) { // 떨어지는 중: 위에서 아래로 내리꽂혀요
      const q = 1 + k / pre; u2.blade.visible = u2.trail.visible = true;
      u2.blade.position.y = 9 * (1 - q) + 1.0; u2.blade.rotation.z = d.tilt;
      u2.trail.position.y = u2.blade.position.y + 2.6; u2.trail.material.opacity = 0.9 * q;
      u2.blade.children.forEach((c) => (c.material.opacity = Math.min(1, q * 1.5) * (c.userData.op || 1)));
      u2.mark.scale.setScalar(1.6 - q * 0.8); u2.mark.material.opacity = q;
    } else { // 땅에 닿은 뒤: 참격이 옆으로 퍼지며 사라지고 자국 고리가 커져요
      if (!d.boom) { d.boom = 1; WFX.push({ kind: "impact", X: d.X, Y: d.Y, col: "#ff2a3a", heavy: 1, t: 0.4, t0: 0.4 }); }
      const q = Math.max(0, 1 - k / 0.5);
      u2.blade.position.y = 1.0; u2.blade.scale.set(1 + k * 3, 1 + k * 1.5, 1); u2.blade.children.forEach((c) => (c.material.opacity = q));
      u2.trail.visible = false;
      u2.mark.scale.setScalar(0.8 + k * 6); u2.mark.material.opacity = q;
    }
  }
  // 거대한 참격: 줄을 따라 왼쪽에서 오른쪽으로 순식간에 갈라요
  const W = z.world;
  ud.world.visible = ud.rift.visible = !!W && t >= z.wAt - 0.12;
  if (W) {
    const k = t - z.wAt, zz = worldZ(W.Y), cx = worldX(3.5);
    ud.world.position.set(cx, 1.1, zz); ud.world.rotation.set(0, 0, 0);
    const grow = Math.min(1, (k + 0.12) / 0.12), q = k < 0 ? 1 : Math.max(0, 1 - k / 0.7);
    ud.world.children.forEach((m) => { if (m === ud.worldCres) return; m.scale.set(40 * grow, m.userData.h * (1 + Math.max(0, k) * 2.5), 1); m.material.opacity = q; m.position.x = (grow - 1) * 20; });
    ud.worldCres.position.x = -20 + grow * 40; ud.worldCres.material.opacity = grow < 1 ? 1 : q;
    ud.rift.position.set(cx, 0.28, zz); ud.rift.scale.set(36 * grow, 0.5 + Math.max(0, k) * 0.4, 1); ud.rift.material.opacity = Math.max(0, Math.min(1, (z.dur - t) / 0.6)) * 0.85;
  }
}
// ----- 1코스트 스킬 3D 연출 -----
// 이승찬: 하트가 포물선으로 날아가 아군에게 닿아요
function drawHearts(z, dt) {
  const g = useMesh(z, () => {
    const grp = new THREE.Group();
    grp.userData.sp = z.targets.map(() => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex("♥", "heart", "rgba(255,154,200,.95)", "rgba(255,110,170,0)", "#ffffff"), transparent: true, depthWrite: false })); grp.add(sp); return sp; });
    return grp;
  });
  const ux = worldX(z.owner.X), uy = worldZ(z.owner.Y);
  g.position.set(0, 0, 0);
  g.userData.sp.forEach((sp, i) => {
    const o = z.targets[i], a = Math.min(1, z.t / 0.45), tx = worldX(o.X), ty = worldZ(o.Y), after = Math.max(0, z.t - 0.45);
    sp.position.set(ux + (tx - ux) * a, 1.5 + Math.sin(a * Math.PI) * 1.6 + after * 1.2, uy + (ty - uy) * a);
    sp.scale.setScalar(1.1 + Math.sin(z.t * 14 + i) * 0.12 + after * 1.5); sp.material.opacity = Math.max(0, 1 - after / 0.45);
  });
}
// 전하율: 약점이 잡힌 적 위에서 도는 과녁
function drawMark(z, dt) {
  const g = useMesh(z, () => {
    const grp = new THREE.Group(), ud = grp.userData;
    ud.rings = [1.0, 0.6].map((s, i) => { const m = new THREE.Mesh(GEO.ringFx, additive(i ? "#ffffff" : "#ff5a4a")); m.rotation.x = -Math.PI / 2; m.scale.setScalar(s); grp.add(m); return m; });
    ud.cross = new THREE.Group(); grp.add(ud.cross);
    for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(zgeo().bar, additive("#c86bff")); b.scale.set(2.3, 1, 0.07); b.rotation.y = i * Math.PI / 2; ud.cross.add(b); }
    return grp;
  });
  const ud = g.userData, t = z.t, pop = Math.min(1, t / 0.15), fade = Math.max(0, Math.min(1, (z.dur - t) / 0.4));
  g.position.set(worldX(z.X), 0.29, worldZ(z.Y)); g.scale.setScalar(0.4 + 0.6 * pop + (1 - pop) * 1.2);
  ud.rings.forEach((r, i) => { r.rotation.z += dt * (i ? -3 : 2); r.material.opacity = (0.55 + Math.sin(t * 6) * 0.2) * fade; });
  ud.cross.rotation.y += dt * 1.5; ud.cross.children.forEach((b) => (b.material.opacity = 0.6 * fade));
}
// 초합체로봇 "초합체 대검": 하늘로 솟는 빛기둥 → 전장을 가로지르며 휘두르는 거대한 빛의 칼날
function drawMegaSword(z, dt) {
  const t = z.t, x = worldX(z.X), y = worldZ(z.Y);
  const g = useMesh(z, () => {
    const grp = new THREE.Group(), ud = grp.userData;
    ud.pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 14, 24, 1, true), additive("#ffe9a0")); ud.pillar.position.y = 7; grp.add(ud.pillar);
    ud.arc = new THREE.Group(); ud.arc.position.y = 1.6; grp.add(ud.arc);
    for (const [w, c, op] of [[2.2, "#ffd36b", 0.55], [0.9, "#bff4ff", 0.9], [0.3, "#ffffff", 1]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(22, w), additive(c)); m.rotation.x = -Math.PI / 2; m.position.x = 11; m.userData.op = op; ud.arc.add(m);
    }
    ud.ring = new THREE.Mesh(GEO.ringFx, additive("#ffd36b")); ud.ring.rotation.x = -Math.PI / 2; ud.ring.position.y = 0.3; grp.add(ud.ring);
    return grp;
  });
  const ud = g.userData; g.position.set(x, 0, y);
  const charge = Math.min(1, t / MEGA_SLASH_AT), k = t - MEGA_SLASH_AT;
  ud.pillar.material.opacity = k < 0 ? 0.5 * charge : Math.max(0, 0.5 * (1 - k / 0.3)); ud.pillar.scale.set(0.3 + charge * 0.8, 1, 0.3 + charge * 0.8);
  ud.ring.scale.setScalar(1 + charge * 2 + (k > 0 ? k * 14 : 0)); ud.ring.material.opacity = k < 0 ? 0.8 * charge : Math.max(0, 0.9 * (1 - k / 0.6));
  const sweep = Math.max(0, Math.min(1, k / 0.22)), fade = k < 0 ? 0 : Math.max(0, 1 - Math.max(0, k - 0.22) / 0.5);
  ud.arc.rotation.y = (z.team ? Math.PI : 0) + 0.5 * Math.PI + (sweep - 0.5) * 2.6; // 한쪽 끝에서 반대쪽 끝까지 크게 휘둘러요
  ud.arc.visible = k >= 0 && fade > 0;
  ud.arc.children.forEach((m) => (m.material.opacity = m.userData.op * fade));
}
const ZDRAW = { megasword: drawMegaSword, net: drawNet, dance: drawDance, zap: drawZap, rend: drawRend, hearts: drawHearts, mark: drawMark, legion: drawLegion, smite: drawSmite, freekick: drawFreekick, snipe: drawFreekick, slam: drawSlam, mathrain: drawMathRain, scribble: drawScribble, goal: drawGoal, summon: drawSummon, dunk: drawDunk, tackle: drawTackle, yinyang: drawYinYang };
function render3D(dt) {
  frameId++; clock3d += dt;
  const P = human();
  const holding = S.phase === "plan" && ((S.sel && S.sel.w !== "i" && getAt(P, S.sel)) || (drag && drag.moved && drag.obj && drag.loc.w !== "i"));
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const sel = S.phase === "plan" && S.sel && S.sel.w === "b" && S.sel.r + 4 === r && S.sel.c === c;
    const t = tiles[r][c], on = sel || (holding && r >= 4);
    t.fill.material.opacity = sel ? 0.35 : on ? 0.12 : 0.04; t.fill.material.color.setHex(sel ? 0xffd75a : 0xffffff);
    t.line.material.opacity = on ? 0.65 : S.phase === "carousel" ? 0 : 0.16;
  }
  pads.forEach((p, i) => p.material.emissive.setHex(S.sel && S.sel.w === "n" && S.sel.i === i ? 0x5a4a08 : 0));
  stepTactician(dt);
  TORCH.forEach((t, i) => { const f = 1 + Math.sin(clock3d * 13 + i * 2) * 0.08 + Math.sin(clock3d * 29 + i) * 0.05; t.flame.scale.set(f, 1 + (f - 1) * 2, f); t.inner.scale.setScalar(f); t.light.intensity = 1.2 * f; });
  carousel.visible = S.phase === "carousel";
  if (carousel.visible && S.car) carousel.rotation.y = -S.car.ang;
  const R = collect(dt);
  LAST_R = R;
  R.forEach((it) => placeUnit(it, dt));
  const B = S.battle;
  if (B && (S.phase === "combat" || S.phase === "result")) {
    // 화살·마법탄이 맞아서 사라지면 그 자리에서 터져요
    for (const p of PREV_PROJ) if (p.done && !p.boomed && p.ck) { p.boomed = 1; WFX.push({ kind: "impact", X: p.X, Y: p.Y, col: p.ccol, heavy: p.ck === "javelin" || p.ck === "lightning", t: 0.3, t0: 0.3 }); }
    PREV_PROJ = B.projs.slice();
    for (const p of B.projs) {
      if (p.ck === undefined) { const CHp = p.who && typeof CHAMPS !== "undefined" && CHAMPS[p.who]; p.ck = (!p.fire && !p.trail && projKind(CHp)) || 0; if (p.ck) p.ccol = "#" + CHp.accent.toString(16).padStart(6, "0"); }
      if (p.ck) {
        const m = useMesh(p, () => champProj(p.ck, p.ccol));
        const y = p.ck === "wave" ? 1.25 : 1.1;
        m.position.set(worldX(p.X), y, worldZ(p.Y)); m.lookAt(worldX(p.t.X), y, worldZ(p.t.Y));
        const ud = m.userData; if (ud.glow) ud.glow.scale.setScalar((p.ck === "magic" ? 0.85 : 0.55) * (1 + Math.sin(clock3d * 30) * 0.12));
        if (ud.ring) ud.ring.rotation.set(clock3d * 9, clock3d * 6, 0);
        if (ud.tg) { ud.tg.rotation.z = p.tilt || 0; ud.tg.scale.setScalar(1 + Math.sin(clock3d * 40) * 0.06); }
        if (p.ck === "wave") m.children.forEach((r, i) => { if (r.geometry === GEO.ringFx) r.scale.setScalar((0.22 + i * 0.1) * (1 + ((clock3d * 3 + i * 0.3) % 1) * 0.6)); });
        if ((p.fxT = (p.fxT || 0) - dt) <= 0 && (p.ck === "magic" || p.ck === "javelin" || p.ck === "lightning")) { p.fxT = 0.05; B.fx.push({ X: p.X, Y: p.Y, r: 0.22, col: p.ccol, t: 0.25, t0: 0.25 }); }
        continue;
      }
      const m = useMesh(p, () => (p.mesh = projSpecial(p)) ? p.mesh : p.trail
        ? new THREE.Mesh(GEO.plane, new THREE.MeshStandardMaterial({ color: lin(0xffffff), emissive: lin(0xf5d76e), emissiveIntensity: 0.6, roughness: 0.6 }))
        : new THREE.Mesh(GEO.chalkP, new THREE.MeshStandardMaterial({ color: new THREE.Color(p.col).convertSRGBToLinear(), roughness: 0.9 })));
      m.position.set(worldX(p.X), 1.05, worldZ(p.Y));
      m.lookAt(worldX(p.t.X), 1.05, worldZ(p.t.Y));
      if (p.shape === "pizza") m.rotation.y += clock3d * 10; // 피자 조각은 빙글빙글 돌며 날아가요
      else if (!p.trail) m.rotateX(Math.PI / 2); else m.rotateZ(Math.sin(clock3d * 20) * 0.2);
      if (p.trail && !p.fire && (p.fxT = (p.fxT || 0) - dt) <= 0) { p.fxT = 0.05; B.fx.push({ X: p.X, Y: p.Y, r: 0.28, col: p.col || "#ffe66b", t: 0.22, t0: 0.22 }); }
      if (p.fire) { // 무회전 불공: 좌우로 흔들리며 불꽃 꼬리를 남겨요
        m.scale.setScalar(1.7); m.position.x += Math.sin(clock3d * 45) * 0.12; m.position.y += Math.sin(clock3d * 31) * 0.1;
        if ((p.fxT = (p.fxT || 0) - dt) <= 0) {
          p.fxT = 0.035; p.fxN = (p.fxN || 0) + 1;
          B.fx.push({ X: p.X, Y: p.Y, r: 0.5, col: p.fxN % 2 ? "#ffb43a" : "#ff5a2a", t: 0.3, t0: 0.3 }, { kind: "spark", X: p.X, Y: p.Y, col: "#ffe9a0", t: 0.3, t0: 0.3 });
        }
      }
    }
    B.fx = drawFx(B.fx, dt);
    for (const z of B.zones) {
      if (ZDRAW[z.kind]) { ZDRAW[z.kind](z, dt); continue; }
      const g = useMesh(z, () => {
        const grp = new THREE.Group();
        const core = new THREE.Mesh(GEO.ball, new THREE.MeshBasicMaterial({ color: 0x000000 })); core.scale.setScalar(4.5); grp.add(core);
        const d1 = new THREE.Mesh(GEO.ringFx, additive("#b06bff")); d1.rotation.x = -Math.PI / 2; d1.scale.setScalar(1.7); grp.add(d1);
        const d2 = new THREE.Mesh(GEO.ringFx, additive("#ff9a5a")); d2.rotation.x = -Math.PI / 2 + 0.35; d2.scale.setScalar(1.15); grp.add(d2);
        const d3 = new THREE.Mesh(GEO.ringFx, additive("#7fc4ff")); d3.rotation.x = -Math.PI / 2 - 0.3; d3.scale.setScalar(2.4); grp.add(d3);
        grp.userData.d = [d1, d2, d3]; return grp;
      });
      const k = z.t / z.dur, grow = Math.min(1, z.t / 0.3) * (k > 0.85 ? Math.max(0.05, (1 - k) / 0.15) : 1);
      g.position.set(worldX(z.X), 1.0, worldZ(z.Y)); g.scale.setScalar(Math.max(0.01, grow) * (1 + Math.sin(clock3d * 12) * 0.04));
      g.userData.d[0].rotation.z += dt * 6; g.userData.d[1].rotation.z -= dt * 9; g.userData.d[2].rotation.z += dt * 3;
      g.userData.d[2].material.opacity = 0.5;
    }

  }
  const crb = B && B.f.find((u) => u.combo && u.combo.t < u.combo.dur);
  if (crb && (S.phase === "combat" || S.phase === "result")) {
    const k = crb.combo, pil = useMesh(k, () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 14, 32, 1, true), additive("#9ff6ff")); return m; });
    const up = Math.min(1, k.t / 1.0), fade = k.t < 1.25 ? 1 : Math.max(0, 1 - (k.t - 1.25) / 0.5);
    pil.position.set(k.cx, 7 * up, k.cz); pil.scale.set(0.3 + up * 0.6 + Math.sin(k.t * 30) * 0.05, up, 0.3 + up * 0.6);
    pil.material.opacity = 0.55 * fade;
    if (k.t >= COMBO_TF && k.t < 1.25) k.members.forEach((mm) => { // 탈것으로 변신해 빙글 달려와요
      const vi = Math.max(0, ROBOT_MEMBERS.indexOf(DEFS[mm.m.d].n)), v = useMesh(mm, () => buildRobotVehicle(vi));
      const p = Math.min(1, k.t / 1.2), ang = mm.a0 + p * 7, rad = mm.r0 * (1 - p * p), pop = Math.min(1, (k.t - COMBO_TF) / 0.12);
      const rise = Math.max(0, k.t - 0.95) * 7 + (vi === 0 ? 1.4 : 0);
      v.position.set(k.cx + Math.cos(ang) * rad, rise, k.cz + Math.sin(ang) * rad); v.rotation.y = -ang;
      v.scale.setScalar(UNIT_K * 1.7 * (0.3 + 0.7 * pop)); if (vi === 0) v.rotation.z = -0.5;
    });
  }
  WFX = drawFx(WFX, dt);
  for (const o of S.orbs || []) {
    const m = useMesh(o, () => { const g = new THREE.Group(); const core = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 16), new THREE.MeshStandardMaterial({ color: lin(o.gold ? 0xffd75a : 0x7fc4ff), emissive: lin(o.gold ? 0xb08a20 : 0x2a6ab0), roughness: 0.2, metalness: 0.3 })); core.castShadow = true; g.add(core); const halo = new THREE.Mesh(GEO.ringFx, additive(o.gold ? "#f5d76e" : "#7fc4ff")); halo.rotation.x = -Math.PI / 2; halo.position.y = -0.55; halo.scale.setScalar(0.55); g.add(halo); return g; });
    m.position.set(o.x, 0.75 + Math.sin(clock3d * 3 + o.x) * 0.12, o.z); m.rotation.y += dt;
  }
  sweep();
  if (camBase) {
    camera.position.copy(camBase.pos);
    if (S.shake > 0) { S.shake -= dt; camera.position.x += (Math.random() - 0.5) * 0.3; camera.position.y += (Math.random() - 0.5) * 0.3; }
  }
  stepDecor(dt);
  if (composer && HQ) composer.render(); else renderer.render(scene, camera);
  return R;
}
const _v = HAS3D ? new THREE.Vector3() : null;
function proj(x, y, z) { _v.set(x, y, z).project(camera); return [((_v.x + 1) / 2) * W, ((1 - _v.y) / 2) * H3]; }
function roundRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function font(px) { return `${Math.round(px)}px ${TOK["--display"]}`; }
function drawItemBox(id, x, y, s) {
  const it = ITEMS[id];
  ctx.fillStyle = it.comp ? it.col : "#2b2410";
  roundRect(x, y, s, s, s * 0.22); ctx.fill();
  if (!it.comp) { ctx.strokeStyle = TOK["--c5"]; ctx.lineWidth = Math.max(1.5, s * 0.1); ctx.stroke(); }
  ctx.fillStyle = it.comp ? "#10201a" : TOK["--c5"];
  ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = font(s * 0.62);
  ctx.fillText(it.n[0], x + s / 2, y + s / 2 + 1);
}
function drawOverlay(dt, R) {
  ctx.clearRect(0, 0, W, H);
  const u0 = Math.max(10, Math.min(W, H) / 52);
  // 배치 인원 표시: 자리가 남았으면 경기장 위에 크게 보여줘요
  if (S.phase === "plan") {
    const P0 = human(), n0 = boardCount(P0);
    if (n0 !== P0.level) {
      const [wx, wy] = proj(0, 0.2, -2.6);
      ctx.save(); ctx.globalAlpha = 0.3; ctx.fillStyle = n0 > P0.level ? "#ff5a4a" : "#f6f2e4";
      ctx.font = font(u0 * 5.5); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(n0 + " / " + P0.level, wx, wy); ctx.restore();
    }
  }
  // 유닛 머리 위 정보
  for (const it of R) {
    const sc = it.g ? it.g.scale.x : 1;
    const [sx, sy] = proj(it.x, (it.lift || 0) + (it.jump || 0) + 1.95 * sc, it.z);
    if (S.phase === "carousel" && it.key && "taken" in it.key) { it.key.sx = sx; it.key.sy = sy + u0 * 1.6; }
    ctx.globalAlpha = it.alpha ?? 1;
    const sp = it.sp, fs = u0 * (it.bench ? 0.78 : 0.92);
    const name = sp.robot ? (sp.mega ? "초합체로봇" : "합체로봇") : sp.mon ? sp.mon.mn : short(DEFS[sp.d].n);
    if (!sp.mon) {
      ctx.fillStyle = sp.star === 3 ? TOK["--c5"] : TOK["--accent"]; ctx.font = font(fs * 0.85);
      ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText("★".repeat(sp.star), sx, sy - fs * 1.15);
    }
    ctx.font = font(fs); ctx.textBaseline = "middle";
    const tw = ctx.measureText(name).width + fs * 0.6;
    ctx.fillStyle = it.enemy ? "rgba(90,30,26,.85)" : "rgba(16,32,26,.8)";
    roundRect(sx - tw / 2, sy - fs * 1.1, tw, fs * 1.15, fs * 0.35); ctx.fill();
    ctx.fillStyle = TOK["--chalk"]; ctx.fillText(name, sx, sy - fs * 0.5);
    if (it.f && (it.f.stunT > 0 || it.f.vulnT > 0) && it.f.alive) {
      ctx.font = font(fs * 0.8); ctx.fillStyle = it.f.stunT > 0 ? TOK["--accent"] : TOK["--c4"]; ctx.textBaseline = "bottom";
      ctx.fillText(it.f.stunT > 0 ? "기절" : "약점", sx, sy - fs * (sp.mon ? 1.2 : 2.1));
    }
    if (it.f) {
      // 체력바: 왼쪽에 별 등급 칸, 초록 체력(칸 나눔), 아래 파란 마나
      const f = it.f, bh = Math.max(5, u0 * 0.5), bw = u0 * 3.3, bx = sx - bw / 2 + bh * 0.7, by = sy + 3;
      const hasMana = f.mm !== Infinity, mh = hasMana ? Math.max(2, bh * 0.5) + 1 : 0;
      ctx.fillStyle = "rgba(6,12,16,.9)"; roundRect(bx - bh * 1.6, by - 2, bw + bh * 1.6 + 2, bh + mh + 4, 3); ctx.fill();
      const hg = ctx.createLinearGradient(0, by, 0, by + bh);
      if (it.enemy) { hg.addColorStop(0, "#ff9a88"); hg.addColorStop(1, "#d2382c"); } else { hg.addColorStop(0, "#86ff8e"); hg.addColorStop(1, "#1fb84a"); }
      ctx.fillStyle = hg; ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, f.hp / f.maxHp)), bh);
      ctx.fillStyle = "rgba(6,12,16,.7)"; for (let v = 300; v < f.maxHp; v += 300) ctx.fillRect(bx + (bw * v) / f.maxHp, by, 1, v % 1500 === 0 ? bh : bh * 0.6);
      if (f.shield > 0) { ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.fillRect(bx, by, Math.min(bw, bw * (f.shield / f.maxHp)), Math.max(2, bh * 0.35)); }
      if (hasMana) { ctx.fillStyle = "#4fb4ff"; ctx.fillRect(bx, by + bh + 1, bw * Math.min(1, f.mana / f.mm), mh - 1); }
      ctx.fillStyle = sp.mon ? "#ff9a88" : sp.star === 3 ? TOK["--c5"] : sp.star === 2 ? "#e4ebee" : "#d19a62";
      ctx.font = font(bh * 1.7); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(sp.mon ? "◆" : String(sp.star || 1), bx - bh * 0.85, by + (bh + mh) / 2 + 1);
    }
    const items = sp.items || [];
    if (items.length && !it.bench) {
      const s = fs * 0.95, w = items.length * s + (items.length - 1) * 2, y = sy + (it.f ? 12 : 3);
      items.forEach((id, i) => drawItemBox(id, sx - w / 2 + i * (s + 2), y, s));
    } else if (items.length) {
      ctx.fillStyle = TOK["--c5"]; ctx.beginPath(); ctx.arc(sx + tw / 2, sy - fs * 1.1, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // 떠오르는 숫자
  const B = S.battle;
  if (B && (S.phase === "combat" || S.phase === "result")) {
    for (const f of B.floats) {
      f.t -= dt; f.h += dt * (f.huge ? 0.5 : 1.3);
      // 작은 숫자는 이름표 위에서 시작해서 이름표·체력바를 가리지 않아요
      const [x, y] = proj(worldX(f.X), f.h + (f.huge ? 0 : 0.6), worldZ(f.Y));
      if (f.huge) { // 스킬 연출용 큰 글자: 쾅 하고 커졌다가 사라져요
        const q = Math.min(1, (f.t0 - f.t) / 0.12), sc = 1 + (1 - q) * 1.4, px = u0 * f.huge;
        ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.rotate(-0.08); ctx.globalAlpha = Math.max(0, Math.min(1, f.t * 3)) * q;
        ctx.font = font(px); ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.shadowColor = f.col2; ctx.shadowBlur = 24; ctx.lineWidth = Math.max(3, px * 0.1); ctx.strokeStyle = "rgba(20,10,0,.85)"; ctx.strokeText(f.text, 0, 0);
        const gr = ctx.createLinearGradient(0, -px / 2, 0, px / 2); gr.addColorStop(0, f.col); gr.addColorStop(1, f.col2);
        ctx.fillStyle = gr; ctx.fillText(f.text, 0, 0); ctx.restore();
        continue;
      }
      ctx.globalAlpha = Math.max(0, Math.min(1, f.t * 2));
      ctx.fillStyle = f.col; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const pop = 1 + Math.max(0, 1 - (0.9 - f.t) / 0.12) * 0.8; // 처음에 톡 튀어나와요
      ctx.font = font(u0 * (f.big === 2 ? 1.7 : f.big ? 1.25 : 1) * pop); ctx.strokeStyle = "rgba(0,0,0,.75)"; ctx.lineWidth = f.big === 2 ? 5 : 3;
      ctx.strokeText(f.text, x, y); ctx.fillText(f.text, x, y);
      ctx.globalAlpha = 1;
    }
    B.floats = B.floats.filter((f) => f.t > 0);
    const label = S.type === "pve" ? "몬스터 라운드" : S.opp ? `상대: ${S.opp.name}${S.oppGhost ? " (복제)" : ""}` : "";
  }
  // 급식 줄 안내
  if (S.phase === "carousel" && S.car) {
    const C = S.car, cur = C.order[C.turn];
    const [cx, cy] = proj(0, 0.3, 0);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = TOK["--accent"]; ctx.font = font(u0 * 1.7); ctx.fillText("급식 줄", cx, cy - u0 * 1.2);
    ctx.fillStyle = TOK["--chalk"]; ctx.font = font(u0 * 1.05);
    const msg = !cur ? "모두 골랐어요" : cur.human ? (C.t >= C.wait ? `지금 고르세요! ${Math.ceil(C.humanT)}초` : "곧 내 차례!") : `${cur.name}이(가) 고르는 중`;
    ctx.fillText(msg, cx, cy + u0 * 0.4);
    const my = C.order.findIndex((p) => p.human);
    if (cur && my > C.turn) { ctx.fillStyle = TOK["--chalk-dim"]; ctx.fillText(`내 순서: ${my + 1}번째`, cx, cy + u0 * 1.7); }
  }
  // 대기석·아이템 줄
  const P = human();
  // 내 마스코트 체력
  if (tact) {
    const [tx, ty] = proj(tact.position.x, 1.6, tact.position.z), bw = u0 * 4;
    ctx.fillStyle = "rgba(0,0,0,.65)"; ctx.fillRect(tx - bw / 2 - 1, ty - 1, bw + 2, 8);
    ctx.fillStyle = "#4fe08a"; ctx.fillRect(tx - bw / 2, ty, bw * Math.max(0, P.hp) / 100, 6);
    ctx.fillStyle = "#fff"; ctx.font = font(u0 * 0.9); ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(String(Math.max(0, P.hp)), tx, ty - 2);
  }
  // 아이템 칸 (왼쪽)
  if (ITEMS_ON) {
  ctx.fillStyle = TOK["--chalk-dim"]; ctx.font = font(u0 * 0.95); ctx.textAlign = "left"; ctx.textBaseline = "bottom";
  ctx.fillText(`아이템 ${P.items.length}/${ITEM_MAX}`, IT.x0, IT.y0 - 4);
  for (let i = 0; i < ITEM_MAX; i++) {
    const [x, y] = itemRect(i);
    ctx.fillStyle = "rgba(14,20,24,.6)"; roundRect(x, y, IT.s, IT.s, 8); ctx.fill();
    ctx.strokeStyle = S.sel && S.sel.w === "i" && S.sel.i === i ? TOK["--accent"] : "rgba(180,143,74,.45)"; ctx.lineWidth = S.sel && S.sel.w === "i" && S.sel.i === i ? 3 : 1.5; ctx.stroke();
    const id = P.items[i];
    if (id && !(drag && drag.moved && drag.loc.w === "i" && drag.loc.i === i)) { const s = IT.s * 0.74; drawItemBox(id, x + (IT.s - s) / 2, y + (IT.s - s) / 2, s); }
  }
  if (drag && drag.moved && drag.obj && drag.loc.w === "i") { const s = IT.s * 0.8; drawItemBox(drag.obj, drag.x - s / 2, drag.y - s / 2, s); }
  }
  // 합체 연출: 섬광과 큰 글자
  const crb2 = S.battle && S.battle.f.find((u) => u.combo && u.combo.t < u.combo.dur);
  if (crb2) {
    const t = crb2.combo.t;
    if (t > 1.1 && t < 1.7) { ctx.fillStyle = `rgba(255,255,255,${Math.max(0, 1 - Math.abs(t - 1.28) / 0.4) * 0.95})`; ctx.fillRect(0, 0, W, H); }
    if (t > COMBO_DONE - 0.05) {
      const q = Math.min(1, (t - COMBO_DONE + 0.05) / 0.18), sc = 1 + (1 - q) * 0.8, [tx, ty] = proj(crb2.combo.cx, 3.2, crb2.combo.cz);
      ctx.save(); ctx.translate(tx, ty); ctx.scale(sc, sc); ctx.globalAlpha = q;
      ctx.font = font(u0 * 4.2); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = "#7ff0ff"; ctx.shadowBlur = 24; ctx.lineWidth = 8; ctx.strokeStyle = "#0b2a3a"; ctx.strokeText(crb2.mega ? "초합체!" : "합체!", 0, 0);
      const gr = ctx.createLinearGradient(0, -u0 * 2, 0, u0 * 2); gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.5, "#7ff0ff"); gr.addColorStop(1, "#ffd36b");
      ctx.fillStyle = gr; ctx.fillText(crb2.mega ? "초합체!" : "합체!", 0, 0);
      const sub = crb2.mega ? "★3 초합체로봇 강림!" : "4인 합체로봇 출격!";
      ctx.font = font(u0 * 1.5); ctx.shadowBlur = 12; ctx.lineWidth = 5; ctx.strokeText(sub, 0, u0 * 3.1); ctx.fillStyle = "#ffe9a0"; ctx.fillText(sub, 0, u0 * 3.1);
      ctx.restore();
    } else if (t < 1.2) {
      const [tx, ty] = proj(crb2.combo.cx, 3.0, crb2.combo.cz);
      ctx.font = font(u0 * 1.6); ctx.textAlign = "center"; ctx.fillStyle = t < COMBO_TF ? "#cff8ff" : "#ffe9a0"; ctx.globalAlpha = 0.6 + Math.sin(t * 20) * 0.4;
      ctx.fillText(t < COMBO_TF ? "합체 준비…" : "변신!", tx, ty); ctx.globalAlpha = 1;
    }
  }
  // 초합체로봇 "초합체 대검": 번쩍 + 화면 전체를 가르는 금빛 선
  const mz = S.battle && S.battle.zones.find((z) => z.kind === "megasword");
  if (mz) {
    const k = mz.t - MEGA_SLASH_AT;
    if (k < 0) { ctx.fillStyle = `rgba(20,14,0,${0.3 * Math.min(1, mz.t / MEGA_SLASH_AT)})`; ctx.fillRect(0, 0, W, H); }
    else if (k < 0.9) {
      const q = 1 - k / 0.9, [cx2, cy2] = proj(worldX(mz.X), 1.4, worldZ(mz.Y)), ang = mz.team ? 0.22 : -0.22, ex = Math.cos(ang), ey = Math.sin(ang);
      if (k < 0.15) { ctx.fillStyle = `rgba(255,248,220,${(1 - k / 0.15) * 0.9})`; ctx.fillRect(0, 0, W, H); }
      ctx.save(); ctx.lineCap = "round"; ctx.globalAlpha = q;
      for (const [lw, col, blur] of [[u0 * 6 * (1 + k * 2), "rgba(255,190,60,.45)", 40], [u0 * 2.4, "#ffd36b", 24], [u0 * 0.8, "#ffffff", 8]]) {
        ctx.shadowColor = "#ffd36b"; ctx.shadowBlur = blur; ctx.strokeStyle = col; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(cx2 - ex * W * 2, cy2 - ey * W * 2); ctx.lineTo(cx2 + ex * W * 2, cy2 + ey * W * 2); ctx.stroke();
      }
      ctx.restore();
    }
  }
  // 김예균 "세계를 가르는 참격": 하늘이 핏빛으로 어두워지고, 참격마다 붉게 번쩍, 마지막엔 화면 전체를 가르는 선
  const rz = S.battle && S.battle.zones.find((z) => z.kind === "rend");
  if (rz) {
    const t = rz.t, fade = Math.max(0, Math.min(1, (rz.dur - t) / 0.5)), dark = Math.min(1, t / 0.5) * fade;
    ctx.fillStyle = `rgba(40,0,8,${0.42 * dark})`; ctx.fillRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, `rgba(20,0,4,${0.6 * dark})`); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    let fl = 0; for (const d of rz.drops) { const k = t - d.at; if (k >= 0 && k < 0.1) fl = Math.max(fl, (1 - k / 0.1) * 0.22); }
    if (fl > 0) { ctx.fillStyle = `rgba(255,60,70,${fl})`; ctx.fillRect(0, 0, W, H); }
    if (rz.world) {
      const k = t - rz.wAt;
      if (k > -0.45 && k < 0) { ctx.fillStyle = `rgba(10,0,2,${0.35 * (1 + k / 0.45)})`; ctx.fillRect(0, 0, W, H); } // 가르기 직전 더 어둡게
      if (k >= 0 && k < 0.9) {
        const [ax, ay] = proj(worldX(-1.5), 1.1, worldZ(rz.world.Y)), [bx, by] = proj(worldX(8.5), 1.1, worldZ(rz.world.Y)), q = 1 - k / 0.9;
        const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, ex = dx / L, ey = dy / L, x0 = ax - ex * W, y0 = ay - ey * W, x1 = bx + ex * W, y1 = by + ey * W;
        if (k < 0.18) { ctx.fillStyle = `rgba(255,235,235,${(1 - k / 0.18) * 0.85})`; ctx.fillRect(0, 0, W, H); } // 번쩍
        ctx.save(); ctx.lineCap = "round"; ctx.globalAlpha = q;
        for (const [lw, col, blur] of [[u0 * 5 * (1 + k * 2), "rgba(120,0,16,.6)", 40], [u0 * 2.2, "#ff2a3a", 24], [u0 * 0.7, "#ffffff", 8]]) { ctx.shadowColor = "#ff2a3a"; ctx.shadowBlur = blur; ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x0, y0 - ex * 0); ctx.lineTo(x1, y1); ctx.stroke(); }
        ctx.restore();
        for (let i = 0; i < 14; i++) { const s2 = ((i * 0.618) % 1), px = ax + dx * s2, py = ay + dy * s2, sp = u0 * (2 + k * 18) * (0.5 + (i % 3) * 0.3); ctx.fillStyle = `rgba(255,${120 + (i % 3) * 50},${100 + (i % 2) * 80},${q})`; ctx.fillRect(px + (i % 2 ? 1 : -1) * sp * 0.3, py + (i % 2 ? -1 : 1) * sp, u0 * 0.5, u0 * 0.5); }
      }
    }
  }
  // 정주환 "천벌": 하늘이 어두워지고, 번개가 칠 때마다 화면이 번쩍
  const sz = S.battle && S.battle.zones.find((z) => z.kind === "smite");
  if (sz) {
    const t = sz.t, fade = Math.max(0, Math.min(1, (sz.dur - t) / 0.5)), dark = Math.min(1, t / 0.4) * fade;
    ctx.fillStyle = `rgba(8,12,40,${0.32 * dark})`; ctx.fillRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, `rgba(0,0,10,${0.5 * dark})`); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    let fl = 0;
    for (const s of (sz.strikes || []).concat(sz.big ? [sz.big] : [])) { const k = t - s.at, fd = s.mega ? 0.45 : 0.12; if (k >= 0 && k < fd) fl = Math.max(fl, (1 - k / fd) * (s.mega ? 1 : s.big ? 0.55 : 0.3)); }
    if (sz.big && sz.big.mega) { const k = t - sz.big.at; if (k > -0.7 && k < 0) { ctx.fillStyle = `rgba(4,6,24,${0.35 * (1 + k / 0.7)})`; ctx.fillRect(0, 0, W, H); } } // 큰 번개 직전엔 더 어둡게
    if (fl > 0) { ctx.fillStyle = `rgba(225,240,255,${fl})`; ctx.fillRect(0, 0, W, H); }
    // 화면 위에서 적에게 내리꽂는 지그재그 번개 (어두운 화면 위에 그려서 잘 보여요)
    for (const s of (sz.strikes || []).concat(sz.big ? [sz.big] : [])) {
      const k = t - s.at, life = s.mega ? 0.8 : s.big ? 0.45 : 0.4; if (k < 0 || k > life) continue;
      const [gx, gy] = proj(worldX(s.X), 0.9, worldZ(s.Y)), q = 1 - k / life, wd = s.mega ? 6 : s.big ? 2.6 : 1.9;
      const zig = (x0, y0, x1, y1, n, jag) => { const pts = [[x0, y0]]; for (let i = 1; i < n; i++) { const kk = i / n; pts.push([x0 + (x1 - x0) * kk + (Math.random() - 0.5) * jag, y0 + (y1 - y0) * kk]); } pts.push([x1, y1]); return pts; };
      const main = zig(gx + (Math.random() - 0.5) * u0 * 6, 0, gx, gy, 10, u0 * 2.6 * wd), paths = [main];
      for (let b = 0; b < (s.mega ? 10 : s.big ? 4 : 2); b++) { const p0 = main[2 + Math.floor(Math.random() * 6)]; paths.push(zig(p0[0], p0[1], p0[0] + (Math.random() - 0.5) * u0 * 8, p0[1] + u0 * (3 + Math.random() * 4), 4, u0 * 1.5)); }
      ctx.save(); ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.globalAlpha = q * (0.7 + Math.random() * 0.3);
      for (const [lw, col, blur] of [[u0 * 0.9 * wd, "rgba(110,190,255,.55)", 30], [u0 * 0.35 * wd, s.big ? "#fff3a0" : "#e8f6ff", 12], [u0 * 0.14 * wd, "#ffffff", 0]]) {
        ctx.strokeStyle = col; ctx.shadowColor = "#7fc8ff"; ctx.shadowBlur = blur;
        paths.forEach((pp, i) => { ctx.lineWidth = i ? lw * 0.45 : lw; ctx.beginPath(); pp.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); });
      }
      const rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, u0 * 4 * wd); rg.addColorStop(0, "rgba(255,255,255,.9)"); rg.addColorStop(0.4, "rgba(150,210,255,.5)"); rg.addColorStop(1, "rgba(150,210,255,0)");
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(gx, gy, u0 * 4 * wd, 0, 7); ctx.fill(); ctx.restore();
    }
    const big = (text, x, y, q, size) => {
      const sc = 1 + (1 - q) * 1.2, j = (Math.random() - 0.5) * u0 * 0.25; ctx.save(); ctx.translate(x + j, y + j); ctx.scale(sc, sc); ctx.globalAlpha = q * fade;
      ctx.font = font(u0 * size); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.shadowColor = "#7fc8ff"; ctx.shadowBlur = 30; ctx.lineWidth = 8; ctx.strokeStyle = "#06102a"; ctx.strokeText(text, 0, 0);
      const gr = ctx.createLinearGradient(0, -u0 * size / 2, 0, u0 * size / 2); gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.45, "#bfe8ff"); gr.addColorStop(1, "#ffe66b");
      ctx.fillStyle = gr; ctx.fillText(text, 0, 0); ctx.restore();
    };
    const [ox, oy] = proj(worldX(sz.X), 3.4, worldZ(sz.Y));
    if (t < SMITE_CHARGE) big("천벌", ox, oy, Math.min(1, t / 0.15), 3.2);
    else if (sz.big && sz.big.mega && t < sz.big.at - 0.05) { if (t > sz.big.at - 0.7) big("신이 노하셨다…", W / 2, H3 * 0.3, Math.min(1, (t - sz.big.at + 0.7) / 0.2), 2.6); }
    else if (sz.big && t >= sz.big.at - 0.05) big(sz.big.mega ? "신의 심판!!" : "심판!", W / 2, H3 * 0.36, Math.min(1, (t - sz.big.at + 0.05) / 0.12), sz.big.mega ? 6.4 : 4.6);
  }
  // 합성 배너: "★★ 이름!" 이 쾅 하고 커졌다가 위로 사라져요
  if (S.mergeFx) {
    const m = S.mergeFx; m.t -= dt;
    const e = m.t0 - m.t, q = Math.min(1, e / 0.14), gold = m.star >= 3;
    const sc = 1 + (1 - q) * 1.6 + (q >= 1 ? Math.max(0, 0.12 - (e - 0.14)) : 0), cy = H3 * 0.3 - Math.max(0, e - 1.1) * u0 * 6, px = u0 * (gold ? 2.4 : 1.9);
    ctx.save(); ctx.translate(W / 2, cy); ctx.scale(sc, sc); ctx.rotate(-0.05);
    ctx.globalAlpha = q * Math.max(0, Math.min(1, m.t * 2.5));
    // 뒤에서 도는 빛살
    ctx.save(); ctx.rotate(e * 0.8); ctx.globalAlpha *= 0.35;
    for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.fillStyle = gold ? "#ffd75a" : "#cfe6ff"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(px * 2.6, -px * 0.22); ctx.lineTo(px * 2.6, px * 0.22); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const stars = "★".repeat(m.star);
    ctx.font = font(px * 0.9); ctx.lineWidth = Math.max(3, px * 0.09); ctx.strokeStyle = "rgba(20,10,0,.9)";
    ctx.shadowColor = gold ? "#ffb43a" : "#7fc8ff"; ctx.shadowBlur = 26;
    ctx.strokeText(stars, 0, -px * 0.75); ctx.fillStyle = gold ? "#ffd75a" : "#e8f2ff"; ctx.fillText(stars, 0, -px * 0.75);
    ctx.font = font(px); ctx.strokeText(m.name + "!", 0, px * 0.35);
    const gr = ctx.createLinearGradient(0, -px * 0.15, 0, px * 0.85);
    if (gold) { gr.addColorStop(0, "#fff6c8"); gr.addColorStop(1, "#ff9a3a"); } else { gr.addColorStop(0, "#ffffff"); gr.addColorStop(1, "#8fc8ff"); }
    ctx.fillStyle = gr; ctx.fillText(m.name + "!", 0, px * 0.35);
    ctx.restore();
    if (m.t <= 0) S.mergeFx = null;
  }
  // 승패 배너
  if (S.banner) {
    S.banner.t -= dt;
    const my = H3 * 0.42;
    ctx.globalAlpha = Math.max(0, Math.min(1, S.banner.t * 2));
    ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(0, my - u0 * 2, W, u0 * 4);
    ctx.fillStyle = S.banner.col; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = font(u0 * 2.6); ctx.fillText(S.banner.text, W / 2, my);
    ctx.globalAlpha = 1;
    if (S.banner.t <= 0) S.banner = null;
  }
}
function tag(text, x, y) {
  if (!text) return;
  ctx.font = font(Math.max(12, W / 32)); ctx.textAlign = "left"; ctx.textBaseline = "top";
  const w = ctx.measureText(text).width + 14;
  ctx.fillStyle = "rgba(16,32,26,.75)"; roundRect(x, y, w, Math.max(12, W / 32) + 10, 8); ctx.fill();
  ctx.fillStyle = TOK["--chalk"]; ctx.fillText(text, x + 7, y + 5);
}
function loop(now) {
  const real = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (S && HAS3D) {
    const paused = !$("ov").hidden;
    const dt = paused ? 0 : real * S.speed;
    if (!paused) {
      if (S.phase === "plan") { if (S.augPending && !S.fast) { S.augT -= real; $("augtier").dataset.t = Math.max(0, Math.ceil(S.augT)); if (S.augT <= 0 && S.augChoose) S.augChoose(); } if (S.augPending && S.fast) { const b = $("augs").querySelector(".augcard"); if (b) b.click(); } if (!S.augPending) { S.timer -= real * (S.fast ? 30 : 1); if (S.timer <= 0) startCombat(); } }
      else if (S.phase === "combat") {
        // 1/60초씩 똑같이 잘라서 계산해요 (온라인 상대 화면과 결과가 같아지도록)
        const B = S.battle; B.acc = (B.acc || 0) + dt;
        withRng(B.rng, () => { while (B.acc >= 1 / 60 && !B.done) { stepBattle(B, 1 / 60); B.acc -= 1 / 60; } });
        if (B.done) finishCombat();
      } else if (S.phase === "result") { S.resultT -= dt; if (S.resultT <= 0) afterResult(); }
      else if (S.phase === "carousel" && S.car) stepCarousel(dt * (S.fast ? 6 : 1));
    }
    if (!paused) netTick(real);
    const R = render3D(paused ? real : dt);
    drawOverlay(dt, R);
    updateTimer();
    if ((S.meterT = (S.meterT || 0) + real) > 0.4) { S.meterT = 0; updateMeter(); }
  }
  requestAnimationFrame(loop);
}
