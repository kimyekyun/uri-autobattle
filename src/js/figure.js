// ============================================================
//  figure.js — 캐릭터 그리기 도구 (만화 음영 · 외곽선 · 얼굴 그림 · 머리카락 · 부품 합치기)
//  render3d.js 의 buildStudent 가 가져다 써요.
//   · toonMat      : 색을 몇 단계로 뚝뚝 끊어 보이게 하는 만화 느낌 재질
//   · bakeFigure   : 작은 부품을 마디(머리·몸통·팔·다리…)마다 한 덩어리로 합치고, 덩어리마다 외곽선을 붙여요
//   · faceTexFor   : 눈·눈썹·코·입을 그림(텍스처)으로 그려 얼굴 위에 씌워요 (눈 깜빡임은 그림 두 장을 바꿔 끼워요)
//   · buildHair2   : 머리카락을 '두피에 붙은 모자 + 한 가닥씩 만든 머리 다발'로 만들어요
// ============================================================
"use strict";

// 친구 캐릭터의 얼굴(눈·눈썹·코·입)을 그릴지 여부. false 면 얼굴 없이 나와요 (되돌리려면 true). 이다연 젤리 얼굴은 따로 항상 그려요
const SHOW_FACE = false;

// ---------- 만화 음영 ----------
let _TOON_GRAD = null;
function toonGrad() {
  if (!_TOON_GRAD) {
    // 밝기를 4단계로 끊어요 (어두운 쪽 → 밝은 쪽)
    _TOON_GRAD = new THREE.DataTexture(new Uint8Array([128, 176, 226, 255]), 4, 1, THREE.LuminanceFormat);
    _TOON_GRAD.minFilter = _TOON_GRAD.magFilter = THREE.NearestFilter; _TOON_GRAD.generateMipmaps = false; _TOON_GRAD.needsUpdate = true;
  }
  return _TOON_GRAD;
}
// extra 에 emissive/transparent/opacity/side 가 있으면 따로 그려요(합치지 않음). 그 밖의 값(rough, metalness…)은 만화 재질에선 쓰지 않아요.
function toonMat(hex, extra = {}) {
  const o = { color: lin(hex), gradientMap: toonGrad() };
  let bake = true;
  for (const k of ["emissive", "emissiveIntensity", "transparent", "opacity", "side"]) {
    if (extra[k] === undefined) continue;
    o[k] = extra[k]; if (k !== "emissiveIntensity") bake = false;
  }
  if (o.transparent) o.depthWrite = false; // 반투명 부품이 뒤의 얼굴 그림을 가리지 않게
  const m = new THREE.MeshToonMaterial(o);
  m.userData.bake = bake;
  return m;
}

// ---------- 외곽선 (뒤집은 껍데기) ----------
// 각 꼭짓점에 'ow'(바깥으로 밀 길이)를 넣어 두고, 뒷면만 그려서 윤곽선처럼 보이게 해요.
// 두개골 크기(머리 좌표). render3d.js 의 두개골 · 얼굴 껍데기 · 머리카락 모자가 같은 값을 써요
const SKULL_SX = 0.95, SKULL_SY = 1.03, SKULL_SZ = 0.98;
const OUTLINE_W = 0.0125, OUTLINE_COL = 0x140c0a, TOON_GAIN = 1.0;
function outlineMat() {
  const m = new THREE.MeshBasicMaterial({ color: lin(OUTLINE_COL), side: THREE.BackSide });
  m.userData.opq = true;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = "attribute float ow;\n" + sh.vertexShader.replace("#include <begin_vertex>", "vec3 transformed = position + normalize(normal) * ow;");
  };
  return m;
}

// ---------- 부품 합치기 ----------
// g 아래 모든 마디(Group)에서, 합칠 수 있는 부품(재질에 bake 표시, 자식 없음)을 한 덩어리로 만들어요.
// 덩어리는 꼭짓점 색을 써서 부품마다 색이 달라도 한 번에 그려요. 마디가 움직이면 덩어리도 같이 움직여요.
function bakeFigure(g, ud) {
  const body = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGrad() });
  const edge = outlineMat();
  const gone = new Set();
  const walk = (node, sc) => {
    const list = node.children.filter((c) => c.isMesh && c.children.length === 0 && c.material && c.material.userData && c.material.userData.bake && !c.userData.keep);
    if (list.length) {
      const geos = list.map((m) => { m.updateMatrix(); const gm = m.geometry.clone(); gm.applyMatrix4(m.matrix); return gm; });
      let nV = 0, nI = 0;
      for (const gm of geos) { nV += gm.attributes.position.count; nI += gm.index ? gm.index.count : gm.attributes.position.count; }
      const P = new Float32Array(nV * 3), N = new Float32Array(nV * 3), C = new Float32Array(nV * 3), W = new Float32Array(nV), I = nV < 65536 ? new Uint16Array(nI) : new Uint32Array(nI);
      let v0 = 0, i0 = 0;
      geos.forEach((gm, k) => {
        const p = gm.attributes.position, n = gm.attributes.normal, col = list[k].material.color, cnt = p.count;
        let vc = gm.attributes.color ? gm.attributes.color.array : null; // hero.js 처럼 꼭짓점에 색을 칠해 둔 부품이면 그 색을 곱해요
        if (!vc && cnt > 12) { // 아니면 위는 밝고 아래는 어두운 '칠한 음영'을 살짝 넣어요
          let y0 = Infinity, y1 = -Infinity; for (let i = 0; i < cnt; i++) { const y = p.array[i * 3 + 1]; if (y < y0) y0 = y; if (y > y1) y1 = y; }
          const span = Math.max(1e-4, y1 - y0); vc = new Float32Array(cnt * 3);
          for (let i = 0; i < cnt; i++) { const k = 0.8 + 0.3 * Math.pow((p.array[i * 3 + 1] - y0) / span, 0.8); vc[i * 3] = vc[i * 3 + 1] = vc[i * 3 + 2] = k; }
        }
        P.set(p.array.subarray(0, cnt * 3), v0 * 3); N.set(n.array.subarray(0, cnt * 3), v0 * 3);
        for (let i = 0; i < cnt; i++) { C[(v0 + i) * 3] = col.r * TOON_GAIN * (vc ? vc[i * 3] : 1); C[(v0 + i) * 3 + 1] = col.g * TOON_GAIN * (vc ? vc[i * 3 + 1] : 1); C[(v0 + i) * 3 + 2] = col.b * TOON_GAIN * (vc ? vc[i * 3 + 2] : 1); W[v0 + i] = OUTLINE_W / sc; }
        if (gm.index) for (let i = 0; i < gm.index.count; i++) I[i0 + i] = gm.index.array[i] + v0; else for (let i = 0; i < cnt; i++) I[i0 + i] = v0 + i;
        v0 += cnt; i0 += gm.index ? gm.index.count : cnt; gm.dispose();
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(P, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(N, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(C, 3)); geo.setAttribute("ow", new THREE.BufferAttribute(W, 1)); geo.setIndex(new THREE.BufferAttribute(I, 1));
      geo.userData.own = true; // 사라질 때 같이 지워요 (render3d.js 의 sweep)
      for (const m of list) { node.remove(m); gone.add(m.material); }
      const bm = new THREE.Mesh(geo, body); bm.castShadow = true; bm.userData.merged = true; node.add(bm);
      const em = new THREE.Mesh(geo, edge); em.userData.merged = true; node.add(em);
    }
    for (const c of node.children.slice()) if (c.isGroup) walk(c, sc * c.scale.x);
  };
  walk(g, 1);
  for (const m of gone) m.dispose();
  ud.mats = ud.mats.filter((m) => !gone.has(m)); ud.mats.push(body, edge);
  g.traverse((o) => { if (o.isMesh) o.castShadow = !!o.userData.merged && o.material === body; });
}

// ---------- 얼굴 그림 ----------
const FACE_CACHE = {};
const hexCss = (n) => "#" + n.toString(16).padStart(6, "0");
const shadeCss = (n, k) => `rgb(${Math.min(255, ((n >> 16) & 255) * k) | 0},${Math.min(255, ((n >> 8) & 255) * k) | 0},${Math.min(255, (n & 255) * k) | 0})`;
function paintFace(g, W, H, o) {
  g.clearRect(0, 0, W, H);
  const S = W / 0.36, X = (x) => W / 2 + x * S, Y = (y) => H / 2 - y * S; // 얼굴 길이(머리 좌표) → 그림 칸
  const ell = (cx, cy, rx, ry, a0 = 0, a1 = Math.PI * 2) => { g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, a0, a1); };
  g.lineCap = "round"; g.lineJoin = "round";
  if (o.blush) for (const s of [-1, 1]) {
    const bx = X(s * 0.1), by = Y(-0.038), gr = g.createRadialGradient(bx, by, 0, bx, by, 0.05 * S);
    gr.addColorStop(0, "rgba(255,105,115,.6)"); gr.addColorStop(1, "rgba(255,105,115,0)"); g.fillStyle = gr; g.fillRect(bx - 0.06 * S, by - 0.06 * S, 0.12 * S, 0.12 * S);
  }
  // 코: 양옆 그림자 + 코끝 하이라이트
  g.strokeStyle = shadeCss(o.skin, 0.7); g.lineWidth = 0.0038 * S;
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(X(s * 0.011), Y(-0.01)); g.quadraticCurveTo(X(s * 0.017), Y(-0.034), X(s * 0.01), Y(-0.046)); g.stroke(); }
  g.fillStyle = shadeCss(o.skin, 1.12); ell(X(0), Y(-0.034), 0.006 * S, 0.01 * S); g.fill();
  for (const s of [-1, 1]) {
    const cx = X(s * 0.066), cy = Y(0.014), ew = 0.04 * o.eye * S, eh = 0.037 * o.eye * S; // 만화처럼 큼직하게
    if (!o.closed) {
      g.fillStyle = shadeCss(o.skin, 0.84); ell(cx, cy - eh * 0.3, ew * 1.1, eh * 1.2); g.fill(); // 눈두덩 그늘
      g.fillStyle = "#f8f6f2"; ell(cx, cy, ew, eh); g.fill();
      g.save(); ell(cx, cy, ew, eh); g.clip();
      const ix = cx - s * ew * 0.04, iy = cy + eh * 0.05, irx = ew * 0.68, iry = eh * 1.04, gr = g.createLinearGradient(0, iy - iry, 0, iy + iry);
      gr.addColorStop(0, shadeCss(o.iris, 0.5)); gr.addColorStop(0.55, hexCss(o.iris)); gr.addColorStop(1, shadeCss(o.iris, 1.7));
      g.fillStyle = gr; ell(ix, iy, irx, iry); g.fill();
      g.fillStyle = "#120c0a"; ell(ix, iy, irx * 0.5, iry * 0.56); g.fill();
      g.fillStyle = "rgba(255,255,255,.96)"; ell(ix - irx * 0.4, iy - iry * 0.42, irx * 0.3, irx * 0.3); g.fill();
      g.fillStyle = "rgba(255,255,255,.8)"; ell(ix + irx * 0.34, iy + iry * 0.4, irx * 0.13, irx * 0.13); g.fill();
      g.restore();
      g.strokeStyle = "#1a110c"; g.lineWidth = 0.0095 * S; ell(cx, cy, ew * 1.04, eh * 1.06, Math.PI * 1.03, Math.PI * 1.97); g.stroke(); // 윗 속눈썹선
      g.lineWidth = 0.0055 * S; g.beginPath(); g.moveTo(cx + s * ew * 1.0, cy - eh * 0.15); g.lineTo(cx + s * ew * 1.34, cy - eh * 0.52); g.stroke(); // 눈꼬리
      g.strokeStyle = "rgba(70,34,24,.35)"; g.lineWidth = 0.003 * S; ell(cx, cy, ew, eh, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
    } else {
      g.strokeStyle = "#1a110c"; g.lineWidth = 0.0078 * S; ell(cx, cy - eh * 0.5, ew * 1.02, eh * 0.9, Math.PI * 0.08, Math.PI * 0.92); g.stroke(); // 감은 눈 ‿
    }
    // 눈썹: 화난/착한/보통
    const inY = o.fierce ? 0.059 : o.kind ? 0.075 : 0.066, outY = o.fierce ? 0.083 : o.kind ? 0.064 : 0.071, midY = o.fierce ? 0.074 : 0.078;
    g.strokeStyle = shadeCss(o.hair, 0.85); g.lineWidth = 0.0125 * o.brow * S;
    g.beginPath(); g.moveTo(X(s * 0.034), Y(inY + 0.01)); g.quadraticCurveTo(X(s * 0.068), Y(midY + 0.012 + (o.eye - 1) * 0.02), X(s * 0.104), Y(outY + 0.008)); g.stroke();
  }
  // 입
  const col = "#7a3a30";
  g.strokeStyle = col; g.fillStyle = col;
  if (o.mouth === "smile") {
    g.lineWidth = 0.0058 * S; g.beginPath(); g.moveTo(X(-0.034), Y(-0.088)); g.quadraticCurveTo(X(0), Y(-0.116), X(0.034), Y(-0.088)); g.stroke();
    g.lineWidth = 0.004 * S; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(X(s * 0.034), Y(-0.088)); g.lineTo(X(s * 0.039), Y(-0.082)); g.stroke(); }
  } else if (o.mouth === "grin") {
    g.fillStyle = "#6e2226"; g.beginPath(); g.moveTo(X(-0.042), Y(-0.086)); g.quadraticCurveTo(X(0), Y(-0.1), X(0.042), Y(-0.086)); g.quadraticCurveTo(X(0), Y(-0.14), X(-0.042), Y(-0.086)); g.fill();
    g.save(); g.clip(); g.fillStyle = "#fbf8f2"; g.fillRect(X(-0.045), Y(-0.082), 0.09 * S, 0.016 * S); g.fillStyle = "#e8828a"; ell(X(0), Y(-0.128), 0.02 * S, 0.012 * S); g.fill(); g.restore();
    g.lineWidth = 0.004 * S; g.beginPath(); g.moveTo(X(-0.042), Y(-0.086)); g.quadraticCurveTo(X(0), Y(-0.1), X(0.042), Y(-0.086)); g.stroke();
  } else if (o.mouth === "pout") {
    g.fillStyle = "#b86a62"; ell(X(0), Y(-0.1), 0.017 * S, 0.0085 * S); g.fill();
    g.lineWidth = 0.0045 * S; g.beginPath(); g.moveTo(X(-0.02), Y(-0.1)); g.lineTo(X(0.02), Y(-0.1)); g.stroke();
  } else if (o.mouth === "flat") {
    g.lineWidth = 0.0058 * S; g.beginPath(); g.moveTo(X(-0.03), Y(-0.1)); g.lineTo(X(0.03), Y(-0.1)); g.stroke();
    g.fillStyle = "rgba(200,110,100,.5)"; ell(X(0), Y(-0.109), 0.016 * S, 0.006 * S); g.fill();
  } else {
    g.fillStyle = "#c27a70"; ell(X(0), Y(-0.095), 0.024 * S, 0.0072 * S); g.fill();
    g.fillStyle = "#d48c82"; ell(X(0), Y(-0.107), 0.02 * S, 0.0085 * S); g.fill();
    g.strokeStyle = "rgba(90,40,34,.7)"; g.lineWidth = 0.0035 * S; g.beginPath(); g.moveTo(X(-0.024), Y(-0.1)); g.quadraticCurveTo(X(0), Y(-0.103), X(0.024), Y(-0.1)); g.stroke();
  }
}
// 친구마다 한 번만 그려요 ([뜬 눈, 감은 눈])
function faceTexFor(def, LK, fierce, kind, hairHex, irisHex, skinHex) {
  if (FACE_CACHE[def.n]) return FACE_CACHE[def.n];
  const blush = LK.acc.some((a) => a[0] === "blush");
  const base = { skin: skinHex, hair: hairHex, iris: irisHex, eye: LK.eye, mouth: LK.mouth, brow: LK.brow, fierce, kind, blush };
  return (FACE_CACHE[def.n] = [false, true].map((closed) => canvasTex(256, 256, (g, w, h) => paintFace(g, w, h, { ...base, closed }))));
}
// 얼굴 앞쪽만 오려 낸 껍데기 (두개골을 아주 조금 부풀린 모양, 얼굴 그림이 평평하게 투영돼요)
function faceMaskGeo() {
  if (GEO.faceMask) return GEO.faceMask;
  const src = GEO.human.skull, p = src.attributes.position, nm = src.attributes.normal, ix = src.index;
  const map = new Map(), pos = [], nor = [], uv = [], ind = [];
  const V = (i) => {
    if (map.has(i)) return map.get(i);
    let x = p.getX(i) * SKULL_SX, y = p.getY(i) * SKULL_SY, z = p.getZ(i) * SKULL_SZ - 0.005;
    let nx = nm.getX(i) / SKULL_SX, ny = nm.getY(i) / SKULL_SY, nz = nm.getZ(i) / SKULL_SZ; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    pos.push(x + nx * 0.0022, y + ny * 0.0022, z + nz * 0.0022); nor.push(nx, ny, nz); uv.push((x + 0.18) / 0.36, (y + 0.18) / 0.36);
    map.set(i, pos.length / 3 - 1); return map.get(i);
  };
  for (let t = 0; t < ix.count; t += 3) {
    const a = ix.getX(t), b = ix.getX(t + 1), c = ix.getX(t + 2);
    const nz = (nm.getZ(a) + nm.getZ(b) + nm.getZ(c)) / 3, zs = Math.min(p.getZ(a), p.getZ(b), p.getZ(c)), ys = (p.getY(a) + p.getY(b) + p.getY(c)) / 3;
    if (nz > 0.28 && zs > 0.02 && Math.abs(ys * SKULL_SY) < 0.2) ind.push(V(a), V(b), V(c));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ind);
  return (GEO.faceMask = g);
}
function faceMesh(tex) {
  const m = new THREE.MeshToonMaterial({ map: tex[0], gradientMap: toonGrad(), transparent: true, alphaTest: 0.03, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  m.userData.keepT = true;
  const mesh = new THREE.Mesh(faceMaskGeo(), m); mesh.renderOrder = -1; // 반투명 안경알보다 먼저 그려요
  mesh.userData.keep = true;
  return mesh;
}

// ---------- 머리카락 ----------
// 머리 좌표(두개골 반지름 0.2, 가로 0.9·세로 1.04·앞뒤 0.98 배)에 맞춰요.
// shell: 두피에 붙은 모자. front/side/back = 앞·옆·뒤 머리선의 높이(높을수록 이마·귀·목이 많이 보여요), vol = 두께 배율
const HAIR_CACHE = {};
const smoothstep = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
function hairShellGeo(p) {
  const key = "sh" + [p.front, p.side, p.back, p.vol].join("_");
  if (HAIR_CACHE[key]) return HAIR_CACHE[key];
  const R = 0.2 + 0.012 * p.vol * 1.0, g = new THREE.SphereGeometry(1, 34, 22), pos = g.attributes.position;
  const rx = SKULL_SX * R * p.vol, ry = SKULL_SY * R * p.vol, rz = SKULL_SZ * R * p.vol;
  for (let i = 0; i < pos.count; i++) {
    let dx = pos.getX(i), dy = pos.getY(i), dz = pos.getZ(i);
    const az = Math.atan2(dx, dz), fa = Math.abs(az);
    const line = fa < 0.75 ? p.front : fa < 1.75 ? p.front + (p.side - p.front) * smoothstep((fa - 0.75)) : p.side + (p.back - p.side) * smoothstep((fa - 1.75) / 1.0);
    const yMin = line / ry; // 머리선 아래로 내려간 꼭짓점은 머리선 높이로 끌어올려서 깔끔한 가장자리를 만들어요
    if (dy < yMin) { dy = yMin; const rho = Math.sqrt(Math.max(0, 1 - dy * dy)); dx = rho * Math.sin(az); dz = rho * Math.cos(az); }
    pos.setXYZ(i, dx * rx, dy * ry, dz * rz - 0.005);
  }
  g.computeVertexNormals(); g.userData.shared = true;
  return (HAIR_CACHE[key] = g);
}
// 한 가닥(다발): 위쪽 뿌리에서 아래로 늘어지는 납작한 칼날 모양. curve 만큼 아래로 갈수록 바깥(+z)으로 휘어요.
function lockGeo(len, w, th, tp, cv) {
  const key = "lk" + [len, w, th, tp, cv].map((x) => x.toFixed(3)).join("_");
  if (HAIR_CACHE[key]) return HAIR_CACHE[key];
  const NS = 5, NK = 8, pos = [], ind = [];
  for (let i = 0; i <= NS; i++) {
    const t = i / NS, sw = w * (1 - tp * Math.pow(t, 1.3)), st = th * (1 - 0.45 * tp * t), cy = -len * t, cz = cv * len * t * t;
    for (let k = 0; k < NK; k++) { const a = (k / NK) * Math.PI * 2; pos.push(Math.cos(a) * sw, cy, cz + Math.sin(a) * st); }
  }
  for (let i = 0; i < NS; i++) for (let k = 0; k < NK; k++) { const a = i * NK + k, b = i * NK + ((k + 1) % NK), c = (i + 1) * NK + k, d = (i + 1) * NK + ((k + 1) % NK); ind.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(ind); g.computeVertexNormals();
  return (HAIR_CACHE[key] = g);
}
const hv3 = (x, y, z) => new THREE.Vector3(x, y, z);
// 두피 위의 한 점(t: 정수리에서 내려온 각도, a: 정면에서 오른쪽으로 돌린 각도)에서 한 가닥을 늘어뜨려요
// o: len w th tp cv sw(옆으로 쓸기) out(바깥으로 뜨기) dir([x,y,z] 방향을 직접 지정) m(재질)
function addLock(C, t, a, o) {
  const tr = (t * Math.PI) / 180, ar = (a * Math.PI) / 180, R = 0.206;
  const P = hv3(Math.sin(tr) * Math.sin(ar) * SKULL_SX * R, Math.cos(tr) * SKULL_SY * R, Math.sin(tr) * Math.cos(ar) * SKULL_SZ * R - 0.005);
  const N = hv3(P.x / (SKULL_SX * SKULL_SX), P.y / (SKULL_SY * SKULL_SY), (P.z + 0.005) / (SKULL_SZ * SKULL_SZ)).normalize();
  let D;
  if (o.dir) D = hv3(...o.dir).normalize();
  else {
    const down = hv3(0, -1, 0); down.addScaledVector(N, -down.dot(N)).normalize(); // 두피를 따라 흘러내리는 방향
    D = down.clone().addScaledVector(N, o.out ?? 0.3).addScaledVector(hv3(1, 0, 0), o.sw ?? 0).normalize();
  }
  const Y = D.clone().negate(), Z = N.clone().addScaledVector(Y, -N.dot(Y));
  if (Z.lengthSq() < 1e-4) Z.set(0, 0, 1);
  Z.normalize(); const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
  const mesh = C.put(lockGeo(o.len, o.w, o.th ?? o.w * 0.55, o.tp ?? 0.4, o.cv ?? 0.15), o.m || C.mHair, P.x, P.y, P.z, C.head);
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  return mesh;
}
// 같은 모양을 여러 각도에 반복
function lockRow(C, t, angles, o, per) {
  angles.forEach((a, i) => addLock(C, t, a, { ...o, ...(per ? per(a, i) : null) }));
}
const range = (a, b, st) => { const r = []; for (let x = a; x <= b + 1e-6; x += st) r.push(x); return r; };
function blobHair(C, t, a, r, m) {
  const tr = (t * Math.PI) / 180, ar = (a * Math.PI) / 180, R = 0.2;
  const b = C.put(HAIR_CACHE.blob || (HAIR_CACHE.blob = new THREE.SphereGeometry(1, 8, 6)), m || C.mHair, Math.sin(tr) * Math.sin(ar) * SKULL_SX * R, Math.cos(tr) * SKULL_SY * R, Math.sin(tr) * Math.cos(ar) * SKULL_SZ * R - 0.005, C.head);
  b.scale.setScalar(r); return b;
}
// st: 머리 스타일 이름 (friends.js 의 LOOKS.hair)
function buildHair2(st, C) {
  const { put, head, mHair, mTip } = C;
  const shell = (front, side, back, vol = 1.0, m = mHair) => put(hairShellGeo({ front, side, back, vol }), m, 0, 0, 0, head);
  const row = (t, angles, o, per) => lockRow(C, t, angles, o, per);
  const bang = { len: 0.07, w: 0.031, th: 0.017, tp: 0.15, cv: 0.1, out: 0.35 };
  switch (st) {
    case "buzz": shell(0.115, 0.03, -0.06, 0.985); break;
    case "bowl":
      shell(0.075, -0.03, -0.08, 1.04);
      row(64, range(-56, 56, 14), bang, (a) => ({ sw: a / 90 })); row(64, [-72, 72], { ...bang, len: 0.1, w: 0.04 });
      addLock(C, 95, -86, { len: 0.1, w: 0.04, tp: 0.2, m: mHair }); addLock(C, 95, 86, { len: 0.1, w: 0.04, tp: 0.2 });
      break;
    case "spiky":
      shell(0.105, 0.03, -0.045, 1.0);
      range(0, 330, 40).forEach((a, i) => addLock(C, 40, a, { len: 0.1, w: 0.05, th: 0.05, tp: 1, cv: 0, dir: [Math.sin((a * Math.PI) / 180) * 0.8, 0.75, Math.cos((a * Math.PI) / 180) * 0.8 - 0.1], m: i % 2 ? mTip : mHair }));
      addLock(C, 4, 0, { len: 0.14, w: 0.055, th: 0.055, tp: 1, cv: 0, dir: [0, 1, 0.1], m: mTip });
      row(62, [-30, 0, 30], { len: 0.085, w: 0.04, th: 0.04, tp: 1, cv: 0, dir: [0, 0.35, 1] });
      break;
    case "side":
      shell(0.095, 0.0, -0.07, 1.03);
      row(60, range(-60, 40, 25), { len: 0.095, w: 0.042, th: 0.02, tp: 0.5, cv: 0.25, sw: 1.1, m: mTip });
      row(34, [-40, 0, 40], { len: 0.08, w: 0.045, th: 0.025, tp: 0.5, cv: 0.2, sw: 0.7, out: 0.6 });
      addLock(C, 92, -88, { len: 0.1, w: 0.04, tp: 0.4 });
      break;
    case "pomp":
      shell(0.115, 0.02, -0.06, 1.02);
      row(50, range(-45, 45, 15), { len: 0.12, w: 0.045, th: 0.045, tp: 0.5, cv: 0.1, dir: [0, 1, 0.45], m: mTip });
      row(34, range(-35, 35, 17.5), { len: 0.15, w: 0.048, th: 0.05, tp: 0.55, cv: 0.1, dir: [0, 1, 0.1], m: mTip });
      break;
    case "curtain":
      shell(0.1, -0.01, -0.07, 1.03);
      for (const s of [-1, 1]) row(52, [8, 22, 36, 50].map((x) => x * s), { len: 0.095, w: 0.037, th: 0.016, tp: 0.4, cv: 0.2, sw: s * 0.75, m: mTip });
      addLock(C, 92, -84, { len: 0.1, w: 0.04, tp: 0.4 }); addLock(C, 92, 84, { len: 0.1, w: 0.04, tp: 0.4 });
      break;
    case "curly":
      shell(0.1, 0.02, -0.06, 1.03);
      for (const [t, n, r] of [[24, 6, 0.058], [48, 9, 0.054], [72, 11, 0.05], [92, 8, 0.046]]) range(0, n - 1, 1).forEach((i) => {
        const a = (i / n) * 360 + (t % 3) * 11, az = Math.abs(((a + 180) % 360) - 180);
        if (t >= 60 && az < 58) return; // 이마·눈 앞은 비워요
        blobHair(C, t, a, r, (i + t) % 5 === 0 ? mTip : mHair);
      });
      blobHair(C, 0, 0, 0.065);
      break;
    case "mushroom":
      shell(0.05, -0.07, -0.1, 1.1);
      row(62, range(-52, 52, 13), { len: 0.075, w: 0.037, th: 0.02, tp: 0.1, cv: 0.12, out: 0.4, m: mTip });
      addLock(C, 96, -90, { len: 0.09, w: 0.045, tp: 0.15 }); addLock(C, 96, 90, { len: 0.09, w: 0.045, tp: 0.15 });
      break;
    case "messy":
      shell(0.1, 0.02, -0.05, 1.02);
      [[34, -50, 0.1, 0.045, -0.7, 0.45], [32, 15, 0.1, 0.045, 0.7, 0.4], [18, -120, 0.1, 0.04, -0.4, 0.5], [18, 120, 0.1, 0.04, 0.5, 0.5], [55, -20, 0.085, 0.04, -0.3, 0.2],
       [55, 35, 0.085, 0.04, 0.9, 0.2], [66, 0, 0.07, 0.04, 0.2, 0.1], [8, 0, 0.12, 0.05, 0.4, 0.8], [75, -75, 0.08, 0.04, -0.6, 0.6], [75, 75, 0.08, 0.04, 0.6, 0.6]]
        .forEach(([t, a, len, w, sw, out], i) => addLock(C, t, a, { len, w, th: w, tp: 0.8, cv: 0.35, sw, out, m: i % 3 === 0 ? mTip : mHair }));
      break;
    case "mohawk":
      shell(0.12, 0.06, -0.02, 0.985);
      [[74, 0, 0.085], [58, 0, 0.1], [40, 0, 0.115], [20, 0, 0.125], [4, 0, 0.12], [24, 180, 0.11], [48, 180, 0.095]].forEach(([t, a, len]) =>
        addLock(C, t, a, { len, w: 0.032, th: 0.05, tp: 0.85, cv: 0, dir: [0, 1, a ? -0.55 : 0.25], m: mTip }));
      break;
    case "slick":
      shell(0.115, 0.02, -0.07, 1.03);
      row(64, range(-40, 40, 20), { len: 0.2, w: 0.05, th: 0.02, tp: 0.6, cv: -0.1, dir: [0, 0.4, -1], m: mTip });
      break;
    case "flat": {
      shell(0.1, 0.02, -0.05, 1.0);
      const top = put(HAIR_CACHE.flat || (HAIR_CACHE.flat = new THREE.CylinderGeometry(0.14, 0.165, 0.06, 16)), mTip, 0, 0.205, -0.01, head); top.scale.set(1, 1, 1.08);
      break;
    }
    case "wavy":
      shell(0.085, -0.03, -0.12, 1.04);
      row(60, range(-40, 30, 17.5), { len: 0.09, w: 0.038, th: 0.017, tp: 0.4, cv: 0.2, sw: 0.5, m: mTip });
      [[-76, 0.35], [76, -0.25]].forEach(([a, cv]) => { addLock(C, 88, a, { len: 0.16, w: 0.047, th: 0.022, tp: 0.5, cv }); addLock(C, 106, a * 0.85, { len: 0.13, w: 0.045, tp: 0.5, cv: -cv }); });
      range(150, 210, 20).forEach((a, i) => addLock(C, 108, a, { len: 0.17, w: 0.05, th: 0.025, tp: 0.5, cv: i % 2 ? 0.3 : -0.2, dir: [0, -1, -0.2] }));
      break;
    case "long":
      shell(0.09, -0.05, -0.2, 1.05);
      range(130, 230, 16.7).forEach((a) => addLock(C, 100, a, { len: 0.5, w: 0.052, th: 0.03, tp: 0.5, cv: -0.1, dir: [0, -1, -0.12] }));
      for (const s of [-1, 1]) { addLock(C, 92, s * 88, { len: 0.44, w: 0.047, th: 0.026, tp: 0.5, cv: 0.1, dir: [s * 0.05, -1, 0.1] }); row(55, [10, 25, 40, 55].map((x) => x * s), { len: 0.11, w: 0.04, th: 0.016, tp: 0.4, cv: 0.2, sw: s * 0.8 }); }
      break;
    default: row(62, range(-40, 40, 20), bang);
  }
}
