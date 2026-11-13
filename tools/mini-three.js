// mini-three.js — 확인용 간이 three.js 대체품 (게임에 들어가지 않아요. 제 작업 환경에서 장면을 눈으로 확인하는 용도)
// 실제 three.js r128과 좌표·도형 규칙을 맞춘 최소 구현: 변환 계층, 기본 도형, 단순 조명, 텍스처, 점·스프라이트·선.
(() => {
  "use strict";
  const U = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === "then" ? undefined : U()), apply: () => U(), construct: () => U(), set: () => true });
  class Vector2 { constructor(x = 0, y = 0) { this.x = x; this.y = y; } set(x, y) { this.x = x; this.y = y; return this; } }
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setScalar(s) { return this.set(s, s, s); }
    copy(v) { return this.set(v.x, v.y, v.z); }
    clone() { return new Vector3(this.x, this.y, this.z); }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    negate() { return this.multiplyScalar(-1); } divideScalar(s) { return this.multiplyScalar(1 / s); } lengthSq() { return this.dot(this); }
    addVectors(a, b) { return this.set(a.x + b.x, a.y + b.y, a.z + b.z); } subVectors(a, b) { return this.set(a.x - b.x, a.y - b.y, a.z - b.z); }
    multiply(v) { this.x *= v.x; this.y *= v.y; this.z *= v.z; return this; } equals(v) { return v.x === this.x && v.y === this.y && v.z === this.z; }
    addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
    dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
    crossVectors(a, b) { return this.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
    cross(v) { return this.crossVectors(this.clone(), v); }
    length() { return Math.hypot(this.x, this.y, this.z); }
    distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
    normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
    lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
    applyMatrix4(m) { const e = m.elements, x = this.x, y = this.y, z = this.z, w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]); return this.set((e[0] * x + e[4] * y + e[8] * z + e[12]) * w, (e[1] * x + e[5] * y + e[9] * z + e[13]) * w, (e[2] * x + e[6] * y + e[10] * z + e[14]) * w); }
    project(cam) { cam._upd(); return this.applyMatrix4(cam.matrixWorldInverse).applyMatrix4(cam.projectionMatrix); }
  }
  class Matrix4 {
    constructor() { this.elements = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
    copy(m) { this.elements.set(m.elements); return this; }
    clone() { return new Matrix4().copy(this); }
    multiplyMatrices(a, b) {
      const A = a.elements, B = b.elements, o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = A[r] * B[c * 4] + A[4 + r] * B[c * 4 + 1] + A[8 + r] * B[c * 4 + 2] + A[12 + r] * B[c * 4 + 3];
      this.elements = o; return this;
    }
    multiply(b) { return this.multiplyMatrices(this, b); }
    compose(p, q, s) {
      const e = this.elements, x = q.x, y = q.y, z = q.z, w = q.w, x2 = x + x, y2 = y + y, z2 = z + z;
      const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
      e[0] = (1 - (yy + zz)) * s.x; e[1] = (xy + wz) * s.x; e[2] = (xz - wy) * s.x; e[3] = 0;
      e[4] = (xy - wz) * s.y; e[5] = (1 - (xx + zz)) * s.y; e[6] = (yz + wx) * s.y; e[7] = 0;
      e[8] = (xz + wy) * s.z; e[9] = (yz - wx) * s.z; e[10] = (1 - (xx + yy)) * s.z; e[11] = 0;
      e[12] = p.x; e[13] = p.y; e[14] = p.z; e[15] = 1; return this;
    }
    makeBasis(x, y, z) { this.elements.set([x.x, x.y, x.z, 0, y.x, y.y, y.z, 0, z.x, z.y, z.z, 0, 0, 0, 0, 1]); return this; }
    makeTranslation(x, y, z) { this.elements.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]); return this; }
  }
  class Quaternion {
    constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; this._o = null; }
    _touch() { if (this._o) this._o._useQuat = true; return this; }
    copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this._touch(); }
    setFromEuler(e) {
      const c1 = Math.cos(e.x / 2), c2 = Math.cos(e.y / 2), c3 = Math.cos(e.z / 2), s1 = Math.sin(e.x / 2), s2 = Math.sin(e.y / 2), s3 = Math.sin(e.z / 2);
      if (e.order === "YXZ") { this.x = s1 * c2 * c3 + c1 * s2 * s3; this.y = c1 * s2 * c3 - s1 * c2 * s3; this.z = c1 * c2 * s3 - s1 * s2 * c3; this.w = c1 * c2 * c3 + s1 * s2 * s3; }
      else { this.x = s1 * c2 * c3 + c1 * s2 * s3; this.y = c1 * s2 * c3 - s1 * c2 * s3; this.z = c1 * c2 * s3 + s1 * s2 * c3; this.w = c1 * c2 * c3 - s1 * s2 * s3; }
      return this;
    }
    setFromRotationMatrix(m) {
      const e = m.elements, m11 = e[0], m12 = e[4], m13 = e[8], m21 = e[1], m22 = e[5], m23 = e[9], m31 = e[2], m32 = e[6], m33 = e[10], tr = m11 + m22 + m33;
      if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); this.w = 0.25 / s; this.x = (m32 - m23) * s; this.y = (m13 - m31) * s; this.z = (m21 - m12) * s; }
      else if (m11 > m22 && m11 > m33) { const s = 2 * Math.sqrt(1 + m11 - m22 - m33); this.w = (m32 - m23) / s; this.x = 0.25 * s; this.y = (m12 + m21) / s; this.z = (m13 + m31) / s; }
      else if (m22 > m33) { const s = 2 * Math.sqrt(1 + m22 - m11 - m33); this.w = (m13 - m31) / s; this.x = (m12 + m21) / s; this.y = 0.25 * s; this.z = (m23 + m32) / s; }
      else { const s = 2 * Math.sqrt(1 + m33 - m11 - m22); this.w = (m21 - m12) / s; this.x = (m13 + m31) / s; this.y = (m23 + m32) / s; this.z = 0.25 * s; }
      return this._touch();
    }
    multiply(q) { const a = this, x = a.w * q.x + a.x * q.w + a.y * q.z - a.z * q.y, y = a.w * q.y - a.x * q.z + a.y * q.w + a.z * q.x, z = a.w * q.z + a.x * q.y - a.y * q.x + a.z * q.w, w = a.w * q.w - a.x * q.x - a.y * q.y - a.z * q.z; this.x = x; this.y = y; this.z = z; this.w = w; return this._touch(); }
  }
  class Euler { constructor(x = 0, y = 0, z = 0, order = "XYZ") { this.x = x; this.y = y; this.z = z; this.order = order; } set(x, y, z, o) { this.x = x; this.y = y; this.z = z; if (o) this.order = o; return this; } }
  const s2l = (c) => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4));
  class Color {
    constructor(v) { this.r = 1; this.g = 1; this.b = 1; if (v !== undefined) this.set(v); }
    set(v) {
      if (v instanceof Color) return this.copy(v);
      if (typeof v === "string") { if (v[0] === "#") { let h = v.slice(1); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); return this.setHex(parseInt(h, 16)); } const m = /rgba?\(([^)]+)\)/.exec(v); if (m) { const p = m[1].split(",").map(Number); this.r = p[0] / 255; this.g = p[1] / 255; this.b = p[2] / 255; } return this; }
      if (typeof v === "number") return this.setHex(v);
      return this;
    }
    setHex(h) { h = Math.floor(h); this.r = ((h >> 16) & 255) / 255; this.g = ((h >> 8) & 255) / 255; this.b = (h & 255) / 255; return this; }
    setHSL(h, s, l) { const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * 6 * (2 / 3 - t) : p; }; h = ((h % 1) + 1) % 1; if (s === 0) this.r = this.g = this.b = l; else { const q = l <= 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; this.r = f(p, q, h + 1 / 3); this.g = f(p, q, h); this.b = f(p, q, h - 1 / 3); } return this; }
    copy(c) { this.r = c.r; this.g = c.g; this.b = c.b; return this; }
    getHex() { const f = (v) => Math.max(0, Math.min(255, Math.round(v * 255))); return (f(this.r) << 16) | (f(this.g) << 8) | f(this.b); }
    clone() { return new Color().copy(this); }
    convertSRGBToLinear() { this.r = s2l(this.r); this.g = s2l(this.g); this.b = s2l(this.b); return this; }
    multiplyScalar(s) { this.r *= s; this.g *= s; this.b *= s; return this; }
  }
  // ---------- 물체 계층 ----------
  class Object3D {
    constructor() { this.position = new Vector3(); this.rotation = new Euler(); this.quaternion = new Quaternion(); this.quaternion._o = this; this.scale = new Vector3(1, 1, 1); this.children = []; this.parent = null; this.visible = true; this.userData = {}; this._useQuat = false; this.matrixWorld = new Matrix4(); }
    add(...os) { for (const o of os) if (o instanceof Object3D) { if (o.parent) o.parent.remove(o); o.parent = this; this.children.push(o); } return this; }
    remove(o) { const i = this.children.indexOf(o); if (i >= 0) { this.children.splice(i, 1); o.parent = null; } return this; }
    traverse(f) { f(this); for (const c of this.children) c.traverse(f); }
    _local() { const q = this._useQuat ? this.quaternion : _q.setFromEuler(this.rotation); return new Matrix4().compose(this.position, q, this.scale); }
    lookAt(x, y, z) { const t = x instanceof Vector3 ? x : new Vector3(x, y, z); const zz = t.clone().sub(this.position).normalize(), xx = new Vector3().crossVectors(new Vector3(0, 1, 0), zz).normalize(), yy = new Vector3().crossVectors(zz, xx); this.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(xx, yy, zz)); }
    _rot(ax, a) { if (!this._useQuat) this.quaternion.copy(new Quaternion().setFromEuler(this.rotation)); const s = Math.sin(a / 2); this.quaternion.multiply(new Quaternion(ax === 0 ? s : 0, ax === 1 ? s : 0, ax === 2 ? s : 0, Math.cos(a / 2))); return this; }
    rotateX(a) { return this._rot(0, a); } rotateY(a) { return this._rot(1, a); } rotateZ(a) { return this._rot(2, a); }
    updateMatrixWorld() {} updateMatrix() { this.matrix = this._local(); }
  }
  const _q = new Quaternion();
  class Group extends Object3D { constructor() { super(); this.isGroup = true; } }
  class Scene extends Object3D { constructor() { super(); this.background = null; this.fog = null; this.environment = null; } }
  class Mesh extends Object3D { constructor(g, m) { super(); this.geometry = g; this.material = m; this.isMesh = true; } }
  class Line extends Object3D { constructor(g, m) { super(); this.geometry = g; this.material = m; this.isLine = true; } }
  class Points extends Object3D { constructor(g, m) { super(); this.geometry = g; this.material = m; this.isPoints = true; } }
  class Sprite extends Object3D { constructor(m) { super(); this.material = m; this.isSprite = true; } }
  class InstancedMesh extends Mesh {
    constructor(g, m, n) { super(g, m); this.count = n; this.isInstancedMesh = true; this._m = new Float32Array(n * 16); this._c = null; this.instanceMatrix = { needsUpdate: false }; }
    setMatrixAt(i, m) { this._m.set(m.elements, i * 16); }
    setColorAt(i, c) { if (!this._c) this._c = new Float32Array(this.count * 3).fill(1); this._c[i * 3] = c.r; this._c[i * 3 + 1] = c.g; this._c[i * 3 + 2] = c.b; }
  }
  class Light extends Object3D { constructor(c, i = 1) { super(); this.color = new Color(c); this.intensity = i; this.isLight = true; this.shadow = { mapSize: new Vector2(), camera: {}, bias: 0, normalBias: 0 }; } }
  class DirectionalLight extends Light { constructor(c, i) { super(c, i); this.isDirectionalLight = true; } }
  class HemisphereLight extends Light { constructor(a, b, i) { super(a, i); this.groundColor = new Color(b); this.isHemisphereLight = true; } }
  class PointLight extends Light { constructor(c, i, d = 0, k = 1) { super(c, i); this.distance = d; this.decay = k; this.isPointLight = true; } }
  class AmbientLight extends Light { constructor(c, i) { super(c, i); this.isAmbientLight = true; } }
  class PerspectiveCamera extends Object3D {
    constructor(fov = 50, aspect = 1, near = 0.1, far = 2000) { super(); this.fov = fov; this.aspect = aspect; this.near = near; this.far = far; this.projectionMatrix = new Matrix4(); this.matrixWorldInverse = new Matrix4(); this._bx = new Vector3(1, 0, 0); this._by = new Vector3(0, 1, 0); this._bz = new Vector3(0, 0, 1); }
    lookAt(x, y, z) { const t = x instanceof Vector3 ? x : new Vector3(x, y, z); this._bz = this.position.clone().sub(t).normalize(); this._bx = new Vector3().crossVectors(new Vector3(0, 1, 0), this._bz).normalize(); this._by = new Vector3().crossVectors(this._bz, this._bx); }
    updateProjectionMatrix() { this._upd(); }
    _upd() {
      const f = 1 / Math.tan((this.fov * Math.PI) / 360), n = this.near, fr = this.far;
      this.projectionMatrix.elements.set([f / this.aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (fr + n) / (n - fr), -1, 0, 0, (2 * fr * n) / (n - fr), 0]);
      const x = this._bx, y = this._by, z = this._bz, p = this.position;
      this.matrixWorldInverse.elements.set([x.x, y.x, z.x, 0, x.y, y.y, z.y, 0, x.z, y.z, z.z, 0, -x.dot(p), -y.dot(p), -z.dot(p), 1]);
    }
  }
  // ---------- 도형 ----------
  class BufferAttribute {
    constructor(array, itemSize) { this.array = array instanceof Float32Array ? array : new Float32Array(array); this.itemSize = itemSize; this.count = this.array.length / itemSize; this.version = 0; }
    set needsUpdate(v) { if (v) this.version++; }
    getX(i) { return this.array[i * this.itemSize]; } getY(i) { return this.array[i * this.itemSize + 1]; } getZ(i) { return this.array[i * this.itemSize + 2]; }
    setX(i, v) { this.array[i * this.itemSize] = v; this.version++; return this; } setY(i, v) { this.array[i * this.itemSize + 1] = v; this.version++; return this; } setZ(i, v) { this.array[i * this.itemSize + 2] = v; this.version++; return this; }
    setXYZ(i, x, y, z) { this.array.set([x, y, z], i * 3); this.version++; return this; }
  }
  class Float32BufferAttribute extends BufferAttribute {}
  class BufferGeometry {
    constructor() { this.attributes = {}; this.index = null; this.userData = {}; }
    _init(pos, idx, uv) { this.attributes.position = new BufferAttribute(new Float32Array(pos), 3); if (uv) this.attributes.uv = new BufferAttribute(new Float32Array(uv), 2); this.index = idx ? { array: idx } : null; return this; }
    setAttribute(n, a) { this.attributes[n] = a; return this; }
    setIndex(a) { this.index = { array: Array.from(a.array || a), count: (a.array || a).length }; return this; }
    setFromPoints(pts) { const p = []; for (const v of pts) p.push(v.x, v.y, v.z || 0); this.attributes.position = new BufferAttribute(new Float32Array(p), 3); return this; }
    _each(f) { const p = this.attributes.position; for (let i = 0; i < p.count; i++) { const o = f(p.array[i * 3], p.array[i * 3 + 1], p.array[i * 3 + 2]); p.array.set(o, i * 3); } p.version++; return this; }
    translate(x, y, z) { return this._each((a, b, c) => [a + x, b + y, c + z]); }
    scale(x, y, z) { return this._each((a, b, c) => [a * x, b * y, c * z]); }
    rotateX(t) { const c = Math.cos(t), s = Math.sin(t); return this._each((x, y, z) => [x, y * c - z * s, y * s + z * c]); }
    rotateY(t) { const c = Math.cos(t), s = Math.sin(t); return this._each((x, y, z) => [x * c + z * s, y, -x * s + z * c]); }
    rotateZ(t) { const c = Math.cos(t), s = Math.sin(t); return this._each((x, y, z) => [x * c - y * s, x * s + y * c, z]); }
    computeVertexNormals() { if (!this.attributes.normal) this.attributes.normal = new BufferAttribute(new Float32Array(this.attributes.position.array.length), 3); } dispose() {}
    clone() { const g = new BufferGeometry(); for (const [k, v] of Object.entries(this.attributes)) g.attributes[k] = new BufferAttribute(new Float32Array(v.array), v.itemSize); g.index = this.index ? { array: this.index.array.slice(), count: this.index.array.length } : null; g._flatHint = this._flatHint; if (!g.attributes.normal) g.attributes.normal = new BufferAttribute(new Float32Array(g.attributes.position.array.length), 3); return g; }
    applyMatrix4(m) { const p = this.attributes.position; for (let i = 0; i < p.count; i++) { const v = new Vector3(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(m); p.array.set([v.x, v.y, v.z], i * 3); } p.version++; return this; }
  }
  const grid = (g, nu, nv, f) => { // (nu+1)x(nv+1) 격자 → 삼각형
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const p = f(i / nu, j / nv); pos.push(p[0], p[1], p[2]); uv.push(i / nu, 1 - j / nv); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    return g._init(pos, idx, uv);
  };
  class SphereGeometry extends BufferGeometry { constructor(r = 1, ws = 8, hs = 6, p0 = 0, pl = Math.PI * 2, t0 = 0, tl = Math.PI) { super(); ws = Math.max(3, Math.floor(ws)); hs = Math.max(2, Math.floor(hs)); grid(this, ws, hs, (u, v) => { const ph = p0 + u * pl, th = t0 + v * tl; return [-r * Math.cos(ph) * Math.sin(th), r * Math.cos(th), r * Math.sin(ph) * Math.sin(th)]; }); } }
  class CylinderGeometry extends BufferGeometry {
    constructor(rt = 1, rb = 1, h = 1, rs = 8, hs = 1, open = false, t0 = 0, tl = Math.PI * 2) {
      super(); rs = Math.max(3, Math.floor(rs)); hs = Math.max(1, Math.floor(hs));
      grid(this, rs, hs, (u, v) => { const th = t0 + u * tl, r = rt + (rb - rt) * v; return [r * Math.sin(th), h / 2 - v * h, r * Math.cos(th)]; });
      if (!open) { const p = Array.from(this.attributes.position.array), ix = this.index.array, uv = Array.from(this.attributes.uv.array);
        for (const [rad, y] of [[rt, h / 2], [rb, -h / 2]]) { if (rad <= 0) continue; const c = p.length / 3; p.push(0, y, 0); uv.push(0.5, 0.5); for (let i = 0; i <= rs; i++) { const th = t0 + (i / rs) * tl; p.push(rad * Math.sin(th), y, rad * Math.cos(th)); uv.push(0.5, 0.5); } for (let i = 0; i < rs; i++) ix.push(c, c + 1 + i, c + 2 + i); }
        this._init(p, ix, uv); }
    }
  }
  class ConeGeometry extends CylinderGeometry { constructor(r = 1, h = 1, rs = 8, hs = 1, open = false, t0, tl) { super(0, r, h, rs, hs, open, t0, tl); } }
  class BoxGeometry extends BufferGeometry {
    constructor(w = 1, h = 1, d = 1) { super(); const pos = [], uv = [], idx = [], x = w / 2, y = h / 2, z = d / 2;
      const face = (a, b, c, e) => { const k = pos.length / 3; for (const p of [a, b, c, e]) pos.push(...p); uv.push(0, 1, 1, 1, 0, 0, 1, 0); idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); };
      face([x, y, z], [x, y, -z], [x, -y, z], [x, -y, -z]); face([-x, y, -z], [-x, y, z], [-x, -y, -z], [-x, -y, z]);
      face([-x, y, -z], [x, y, -z], [-x, y, z], [x, y, z]); face([-x, -y, z], [x, -y, z], [-x, -y, -z], [x, -y, -z]);
      face([-x, y, z], [x, y, z], [-x, -y, z], [x, -y, z]); face([x, y, -z], [-x, y, -z], [x, -y, -z], [-x, -y, -z]);
      this._init(pos, idx, uv); }
  }
  class PlaneGeometry extends BufferGeometry { constructor(w = 1, h = 1, ws = 1, hs = 1) { super(); grid(this, ws, hs, (u, v) => [(u - 0.5) * w, (0.5 - v) * h, 0]); } }
  class CircleGeometry extends BufferGeometry { constructor(r = 1, seg = 8, t0 = 0, tl = Math.PI * 2) { super(); const pos = [0, 0, 0], uv = [0.5, 0.5], idx = []; for (let i = 0; i <= seg; i++) { const t = t0 + (i / seg) * tl; pos.push(r * Math.cos(t), r * Math.sin(t), 0); uv.push(0.5 + 0.5 * Math.cos(t), 0.5 + 0.5 * Math.sin(t)); } for (let i = 1; i <= seg; i++) idx.push(i, i + 1, 0); this._init(pos, idx, uv); } }
  class RingGeometry extends BufferGeometry { constructor(ri = 0.5, ro = 1, seg = 8) { super(); grid(this, seg, 1, (u, v) => { const t = u * Math.PI * 2, r = ri + (ro - ri) * v; return [r * Math.cos(t), r * Math.sin(t), 0]; }); } }
  class TorusGeometry extends BufferGeometry { constructor(R = 1, t = 0.4, rs = 8, ts = 6, arc = Math.PI * 2) { super(); grid(this, ts, rs, (u, v) => { const a = u * arc, b = v * Math.PI * 2; return [(R + t * Math.cos(b)) * Math.cos(a), (R + t * Math.cos(b)) * Math.sin(a), t * Math.sin(b)]; }); } }
  class LatheGeometry extends BufferGeometry { constructor(pts, seg = 12) { super(); const n = pts.length - 1; grid(this, seg, n, (u, v) => { const p = pts[Math.round(v * n)], ph = u * Math.PI * 2; return [p.x * Math.sin(ph), p.y, p.x * Math.cos(ph)]; }); } }
  class IcosahedronGeometry extends SphereGeometry { constructor(r = 1, d = 0) { super(r, d > 0 ? 8 : 5, d > 0 ? 6 : 3); this._flatHint = true; } }
  class OctahedronGeometry extends SphereGeometry { constructor(r = 1) { super(r, 4, 2); this._flatHint = true; } }
  class DodecahedronGeometry extends SphereGeometry { constructor(r = 1, d = 0) { super(r, 6, 4); this._flatHint = true; } }
  // ---------- 재질 · 텍스처 ----------
  class Material {
    constructor(p = {}, lit = true) { this.color = new Color(0xffffff); this.emissive = new Color(0x000000); this.emissiveIntensity = 1; this.opacity = 1; this.transparent = false; this.map = null; this.lit = lit; this.depthWrite = true; this.blending = 1; this.side = 0; this.size = 1; this.alphaTest = 0; this.fog = true; this.userData = {}; if (!lit) this.emissive = undefined;
      for (const [k, v] of Object.entries(p)) { if (k === "color" || k === "emissive") this[k] = new Color(v); else this[k] = v; } }
    dispose() {}
  }
  class MeshStandardMaterial extends Material {}
  class MeshToonMaterial extends Material {}
  class DataTexture { constructor() { this.image = null; this.repeat = new Vector2(1, 1); this.offset = new Vector2(); } set needsUpdate(v) {} dispose() {} }
  class MeshBasicMaterial extends Material { constructor(p) { super(p, false); this.isMeshBasicMaterial = true; } }
  class LineBasicMaterial extends Material { constructor(p) { super(p, false); } }
  class PointsMaterial extends Material { constructor(p) { super(p, false); } }
  class SpriteMaterial extends Material { constructor(p) { super(p, false); } }
  class CanvasTexture { constructor(c) { this.image = c; this.repeat = new Vector2(1, 1); this.offset = new Vector2(0, 0); this.wrapS = 0; this.wrapT = 0; this.version = 1; this.userData = {}; } set needsUpdate(v) { if (v) this.version++; } dispose() {} }
  class Fog { constructor(c, n, f) { this.color = new Color(c); this.near = n; this.far = f; } }
  // ---------- 그리기 ----------
  const VS = `#version 300 es
  in vec3 aPos; in vec3 aNor; in vec2 aUv; in vec3 aCol; out vec3 vCol;
  uniform mat4 uPV, uM; uniform mat3 uN; uniform float uPoint; uniform float uPScale; uniform mat4 uV;
  out vec3 vN; out vec3 vW; out vec2 vUv; out float vD;
  void main(){ vCol = aCol; vec4 w = uM * vec4(aPos,1.0); vW = w.xyz; vN = uN * aNor; vUv = aUv; vec4 mv = uV * w; vD = -mv.z; gl_Position = uPV * w; if (uPoint > 0.0) gl_PointSize = uPoint * uPScale / max(0.1, -mv.z); }`;
  const FS = `#version 300 es
  precision highp float;
  in vec3 vN; in vec3 vW; in vec2 vUv; in float vD; in vec3 vCol; uniform float uVC;
  uniform vec3 uColor, uEmis, uSky, uGround, uSunDir, uSunCol, uFillDir, uFillCol, uFogCol; uniform float uOpacity, uLit, uUseMap, uPoint, uFogOn, uFogNear, uFogFar, uAlphaTest, uExpo;
  uniform vec4 uUvX; uniform sampler2D uMap; uniform vec3 uPL[4]; uniform vec4 uPC[4];
  out vec4 o;
  vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
  void main(){
    vec3 base = uColor * mix(vec3(1.0), vCol, uVC); float a = uOpacity;
    if (uUseMap > 0.5) { vec2 uv = uPoint > 0.0 ? vec2(gl_PointCoord.x, gl_PointCoord.y) : vUv * uUvX.xy + uUvX.zw; vec4 t = texture(uMap, uv); base *= pow(t.rgb, vec3(2.2)); a *= t.a; }
    if (a <= uAlphaTest) discard;
    vec3 c = base;
    if (uLit > 0.5) {
      vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
      vec3 amb = mix(uGround, uSky, n.y*0.5+0.5);
      vec3 l = amb + uSunCol * max(dot(n, uSunDir), 0.0) + uFillCol * max(dot(n, uFillDir), 0.0);
      for (int i=0;i<4;i++){ vec3 d = uPL[i]-vW; float dist = length(d); float att = uPC[i].a > 0.0 ? pow(clamp(1.0 - dist/uPC[i].a, 0.0, 1.0), 2.0) : 0.0; l += uPC[i].rgb * att * max(dot(n, d/dist), 0.0); }
      c = base * l + uEmis;
    }
    if (uFogOn > 0.5) c = mix(c, uFogCol, smoothstep(uFogNear, uFogFar, vD));
    c = aces(c * uExpo);
    o = vec4(pow(c, vec3(1.0/2.2)), a);
  }`;
  class WebGLRenderer {
    constructor(p = {}) {
      this.domElement = p.canvas || document.createElement("canvas");
      const gl = (this.gl = this.domElement.getContext("webgl2", { antialias: true, alpha: true, preserveDrawingBuffer: true, premultipliedAlpha: false }));
      this.capabilities = { getMaxAnisotropy: () => 1, isWebGL2: true }; this.shadowMap = {}; this.toneMappingExposure = 1; this._pr = 1;
      const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
      const pr = (this.prog = gl.createProgram()); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
      gl.bindAttribLocation(pr, 0, "aPos"); gl.bindAttribLocation(pr, 1, "aNor"); gl.bindAttribLocation(pr, 2, "aUv"); gl.bindAttribLocation(pr, 3, "aCol"); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      this.u = new Proxy({}, { get: (t, k) => t[k] || (t[k] = gl.getUniformLocation(pr, k)) });
      this.geo = new WeakMap(); this.tex = new WeakMap();
      this.white = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.white); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      this.quad = this._buf(new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), new Float32Array(18).map((_, i) => (i % 3 === 2 ? 1 : 0)), new Float32Array([0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1]), 6);
    }
    setPixelRatio(r) { this._pr = r; } setSize(w, h) { this.domElement.width = Math.round(w * this._pr); this.domElement.height = Math.round(h * this._pr); }
    dispose() {} forceContextLoss() {}
    _buf(pos, nor, uv, n, col) { const gl = this.gl, vao = gl.createVertexArray(); gl.bindVertexArray(vao); [pos, nor, uv, col || new Float32Array(n * 3).fill(1)].forEach((a, i) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, a, gl.STATIC_DRAW); gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, i === 2 ? 2 : 3, gl.FLOAT, false, 0, 0); }); return { vao, n }; }
    _geo(g, flat, raw) {
      const P = g.attributes.position, ver = P.version + (g.attributes.uv ? g.attributes.uv.version : 0);
      let e = this.geo.get(g); const key = flat ? "f" : raw ? "r" : "s";
      if (e && e[key] && e[key].ver === ver) return e[key];
      if (!e) this.geo.set(g, (e = {}));
      const p = P.array, uvA = g.attributes.uv ? g.attributes.uv.array : null;
      let out;
      if (raw) out = this._buf(p, new Float32Array(p.length), new Float32Array((p.length / 3) * 2), p.length / 3);
      else {
        const ix = g.index ? g.index.array : Array.from({ length: P.count }, (_, i) => i), n = ix.length;
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), acc = new Map(), fn = new Float32Array(n * 3), cA = g.attributes.color ? g.attributes.color.array : null, col = new Float32Array(n * 3).fill(1);
        const kf = (i) => Math.round(p[i * 3] * 2000) + "," + Math.round(p[i * 3 + 1] * 2000) + "," + Math.round(p[i * 3 + 2] * 2000);
        for (let t = 0; t < n; t += 3) {
          const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
          const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
          const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          for (let k = 0; k < 3; k++) { const vi = ix[t + k]; pos.set([p[vi * 3], p[vi * 3 + 1], p[vi * 3 + 2]], (t + k) * 3); if (cA) col.set([cA[vi * 3], cA[vi * 3 + 1], cA[vi * 3 + 2]], (t + k) * 3); if (uvA) uv.set([uvA[vi * 2], uvA[vi * 2 + 1]], (t + k) * 2); else uv.set([0.5, 0.5], (t + k) * 2); fn.set([nx, ny, nz], (t + k) * 3);
            if (!flat) { const key2 = kf(vi); let s = acc.get(key2); if (!s) acc.set(key2, (s = [0, 0, 0])); s[0] += nx; s[1] += ny; s[2] += nz; } }
        }
        for (let i = 0; i < n; i++) { let s = flat ? [fn[i * 3], fn[i * 3 + 1], fn[i * 3 + 2]] : acc.get(kf(ix[i])); const l = Math.hypot(s[0], s[1], s[2]) || 1; nor.set([s[0] / l, s[1] / l, s[2] / l], i * 3); }
        out = this._buf(pos, nor, uv, n, col);
      }
      out.ver = ver; e[key] = out; return out;
    }
    _tex(t) {
      const gl = this.gl; let e = this.tex.get(t);
      if (!e) this.tex.set(t, (e = { tex: gl.createTexture(), ver: -1 }));
      gl.bindTexture(gl.TEXTURE_2D, e.tex);
      if (e.ver !== t.version) { e.ver = t.version; gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, t.image); gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, t.wrapS === 1000 ? gl.REPEAT : gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, t.wrapT === 1000 ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    }
    render(scene, cam) {
      const gl = this.gl, u = this.u, W = this.domElement.width, H = this.domElement.height;
      cam._upd(); gl.viewport(0, 0, W, H); gl.useProgram(this.prog); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const PV = new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse), I = new Matrix4();
      gl.uniformMatrix4fv(u.uPV, false, PV.elements); gl.uniformMatrix4fv(u.uV, false, cam.matrixWorldInverse.elements); gl.uniform1f(u.uPScale, H * 0.5); gl.uniform1f(u.uExpo, (this.toneMappingExposure || 1) / 0.6);
      gl.activeTexture(gl.TEXTURE0); gl.uniform1i(u.uMap, 0);
      // 조명 모으기
      const items = [], dirs = [], pls = []; let sky = [0.5, 0.5, 0.5], ground = [0.3, 0.3, 0.3];
      const walk = (o, pm) => {
        if (!o.visible) return;
        const m = new Matrix4().multiplyMatrices(pm, o._local()); o.matrixWorld = m;
        if (o.isDirectionalLight) dirs.push(o); else if (o.isPointLight) pls.push([m.elements[12], m.elements[13], m.elements[14], o]);
        else if (o.isHemisphereLight) { const k = o.intensity; sky = [s2l(o.color.r) * k, s2l(o.color.g) * k, s2l(o.color.b) * k]; ground = [s2l(o.groundColor.r) * k, s2l(o.groundColor.g) * k, s2l(o.groundColor.b) * k]; }
        else if (o.isMesh || o.isPoints || o.isSprite || o.isLine) items.push([o, m]);
        for (const c of o.children) walk(c, m);
      };
      walk(scene, I);
      const dl = (d) => { const p = d ? d.position.clone().normalize() : new Vector3(0, 1, 0), k = d ? d.intensity * 1.0 : 0, c = d ? d.color : new Color(); return [[p.x, p.y, p.z], [s2l(c.r) * k, s2l(c.g) * k, s2l(c.b) * k]]; };
      const [sd, sc] = dl(dirs[0]), [fd, fc] = dl(dirs[1]);
      gl.uniform3fv(u.uSunDir, sd); gl.uniform3fv(u.uSunCol, sc); gl.uniform3fv(u.uFillDir, fd); gl.uniform3fv(u.uFillCol, fc);
      gl.uniform3fv(u.uSky, sky); gl.uniform3fv(u.uGround, ground);
      for (let i = 0; i < 4; i++) { const p = pls[i]; gl.uniform3fv(gl.getUniformLocation(this.prog, `uPL[${i}]`), p ? p.slice(0, 3) : [0, 0, 0]); const c = p ? p[3].color : null, k = p ? p[3].intensity * 1.5 : 0; gl.uniform4fv(gl.getUniformLocation(this.prog, `uPC[${i}]`), p ? [s2l(c.r) * k, s2l(c.g) * k, s2l(c.b) * k, p[3].distance] : [0, 0, 0, 0]); }
      const fog = scene.fog; gl.uniform1f(u.uFogOn, 0);
      if (fog) { gl.uniform3fv(u.uFogCol, [fog.color.r, fog.color.g, fog.color.b]); gl.uniform1f(u.uFogNear, fog.near); gl.uniform1f(u.uFogFar, fog.far); }
      const setMat = (mt, M, colMul) => {
        const c = mt.color, k = colMul || [1, 1, 1];
        gl.uniform3fv(u.uColor, [c.r * k[0], c.g * k[1], c.b * k[2]]); gl.uniform1f(u.uVC, mt.vertexColors ? 1 : 0); gl.uniform1f(u.uOpacity, mt.opacity); gl.uniform1f(u.uLit, mt.lit ? 1 : 0); gl.uniform1f(u.uAlphaTest, mt.alphaTest || 0);
        const ei = mt.emissiveIntensity; gl.uniform3fv(u.uEmis, mt.lit && mt.emissive ? [mt.emissive.r * ei, mt.emissive.g * ei, mt.emissive.b * ei] : [0, 0, 0]);
        if (mt.map && mt.map.image) { this._tex(mt.map); gl.uniform1f(u.uUseMap, 1); gl.uniform4fv(u.uUvX, [mt.map.repeat.x, mt.map.repeat.y, mt.map.offset.x, mt.map.offset.y]); } else { gl.bindTexture(gl.TEXTURE_2D, this.white); gl.uniform1f(u.uUseMap, 0); }
        gl.uniformMatrix4fv(u.uM, false, M.elements);
        const e = M.elements, a = e[0], b = e[1], c2 = e[2], d = e[4], f = e[5], g = e[6], h = e[8], i = e[9], j = e[10];
        const A = f * j - g * i, B = g * h - d * j, C = d * i - f * h, det = a * A + b * B + c2 * C || 1;
        gl.uniformMatrix3fv(u.uN, false, [A / det, B / det, C / det, (c2 * i - b * j) / det, (a * j - c2 * h) / det, (b * h - a * i) / det, (b * g - c2 * f) / det, (c2 * d - a * g) / det, (a * f - b * d) / det]);
        gl.uniform1f(u.uFogOn, fog && mt.fog !== false ? 1 : 0);
      };
      // 배경
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      if (scene.background && scene.background.image) { const bm = new Material({ map: scene.background }, false); const inv = I; gl.uniformMatrix4fv(u.uPV, false, I.elements); setMat(bm, inv); gl.uniform1f(u.uFogOn, 0); gl.uniform1f(u.uPoint, 0); gl.bindVertexArray(this.quad.vao); gl.drawArrays(gl.TRIANGLES, 0, 6); gl.uniformMatrix4fv(u.uPV, false, PV.elements); }
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      const draw = ([o, M]) => {
        let mt = Array.isArray(o.material) ? o.material[4] || o.material[0] : o.material; if (!mt || !(mt instanceof Material)) return;
        if (mt.side === 1) return; // 외곽선용 뒷면 껍데기는 이 간이 렌더러에선 생략
        if (window.__CULL && mt.side === 0 && !o.isSprite) { gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); } else gl.disable(gl.CULL_FACE);
        gl.depthMask(mt.depthWrite !== false && !(mt.transparent && mt.blending === 2));
        if (mt.transparent) { gl.enable(gl.BLEND); if (mt.blending === 2) gl.blendFunc(gl.SRC_ALPHA, gl.ONE); else gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA); } else gl.disable(gl.BLEND);
        gl.uniform1f(u.uPoint, 0);
        if (o.isSprite) {
          const e = M.elements, sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), bx = cam._bx, by = cam._by;
          const S = new Matrix4(); S.elements.set([bx.x * sx * 0.5, bx.y * sx * 0.5, bx.z * sx * 0.5, 0, by.x * sy * 0.5, by.y * sy * 0.5, by.z * sy * 0.5, 0, 0, 0, 1, 0, e[12], e[13], e[14], 1]);
          setMat(mt, S); gl.bindVertexArray(this.quad.vao); gl.drawArrays(gl.TRIANGLES, 0, 6); return;
        }
        if (!o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
        if (o.isPoints) { const b = this._geo(o.geometry, false, true); setMat(mt, M); gl.uniform1f(u.uPoint, mt.size || 1); gl.bindVertexArray(b.vao); gl.drawArrays(gl.POINTS, 0, b.n); return; }
        if (o.isLine) { const b = this._geo(o.geometry, false, true); setMat(mt, M); gl.bindVertexArray(b.vao); gl.drawArrays(gl.LINE_STRIP, 0, b.n); return; }
        const b = this._geo(o.geometry, !!mt.flatShading || !!o.geometry._flatHint, false); gl.bindVertexArray(b.vao);
        if (o.isInstancedMesh) { const im = new Matrix4(), wm = new Matrix4(); for (let i = 0; i < o.count; i++) { im.elements = o._m.subarray(i * 16, i * 16 + 16); wm.multiplyMatrices(M, im); setMat(mt, wm, o._c ? [o._c[i * 3], o._c[i * 3 + 1], o._c[i * 3 + 2]] : null); gl.drawArrays(gl.TRIANGLES, 0, b.n); } return; }
        setMat(mt, M); gl.drawArrays(gl.TRIANGLES, 0, b.n);
      };
      const isT = (o) => { const m = Array.isArray(o.material) ? o.material[0] : o.material; return m && m.transparent; };
      const depth = (M) => { const e = M.elements, v = cam.matrixWorldInverse.elements; return v[2] * e[12] + v[6] * e[13] + v[10] * e[14] + v[14]; };
      items.filter((x) => !isT(x[0])).forEach(draw);
      items.filter((x) => isT(x[0])).sort((a, b) => depth(a[1]) - depth(b[1])).forEach(draw);
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
  }
  const real = { Vector2, Vector3, Matrix4, Quaternion, Euler, Color, Object3D, Group, Scene, Mesh, Line, Points, Sprite, InstancedMesh, DirectionalLight, HemisphereLight, PointLight, AmbientLight, PerspectiveCamera,
    BufferAttribute, Float32BufferAttribute, BufferGeometry, SphereGeometry, CylinderGeometry, ConeGeometry, BoxGeometry, PlaneGeometry, CircleGeometry, RingGeometry, TorusGeometry, LatheGeometry, IcosahedronGeometry, DodecahedronGeometry, OctahedronGeometry,
    MeshStandardMaterial, MeshToonMaterial, DataTexture, LuminanceFormat: 1024, NearestFilter: 1003, MeshBasicMaterial, LineBasicMaterial, PointsMaterial, SpriteMaterial, CanvasTexture, Fog, WebGLRenderer,
    MathUtils: { degToRad: (d) => (d * Math.PI) / 180, clamp: (v, a, b) => Math.max(a, Math.min(b, v)), lerp: (a, b, t) => a + (b - a) * t },
    AdditiveBlending: 2, NormalBlending: 1, DoubleSide: 2, FrontSide: 0, BackSide: 1, RepeatWrapping: 1000, ClampToEdgeWrapping: 1001, sRGBEncoding: 3001, MINI: true };
  const UNDEF = new Set(["EffectComposer", "UnrealBloomPass", "ShaderPass", "RenderPass", "RoomEnvironment", "WebGLMultisampleRenderTarget"]);
  window.THREE = new Proxy(real, { get: (t, k) => (k in t ? t[k] : UNDEF.has(k) ? undefined : U()), set: (t, k, v) => true });
})();
