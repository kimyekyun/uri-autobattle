// 사용: node tools/anim.js <dir> <out> "이름1,이름2,..."  — 친구마다 한 줄, 공격 동작을 6장면으로 (옆에서 본 모습)
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const dir = path.resolve(process.argv[2]), out = process.argv[3], names = process.argv[4].split(",");
const mini = fs.readFileSync(path.join(__dirname, "mini-three.js"), "utf8");
(async () => {
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const p = await b.newPage({ viewport: { width: 1200, height: 260 * names.length } });
  const errs = []; p.on("pageerror", (e) => errs.push(String(e.stack || e).slice(0, 400)));
  await p.route("**/*", (r) => { const u = r.request().url(); if (u.startsWith("file:")) return r.continue(); if (u.includes("three.min.js")) return r.fulfill({ contentType: "text/javascript", body: mini }); return r.abort(); });
  await p.goto("file://" + dir + "/index.html"); await p.waitForTimeout(1200);
  await p.evaluate((names) => {
    const W = 1200, H = 260 * names.length;
    const cv2 = document.createElement("canvas"); cv2.style.cssText = "position:fixed;inset:0;z-index:999;background:#46525c"; document.body.appendChild(cv2);
    const r = new THREE.WebGLRenderer({ canvas: cv2 }); r.setSize(W, H); r.toneMappingExposure = 0.9;
    const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0x9aa8ff, 0x3a3050, 0.9));
    const sun = new THREE.DirectionalLight(0xd6e2ff, 1.3); sun.position.set(6, 10, 10); sc.add(sun);
    const rowH = 2.6, cam = new THREE.PerspectiveCamera(12, W / H, 0.1, 400); const cy = -(names.length - 1) * rowH / 2 + 1.1;
    cam.position.set(0, cy + 0.6, 15 * names.length + 6); cam.lookAt(new THREE.Vector3(0, cy, 0));
    const P = [0, 0.12, 0.22, 0.32, 0.45, 0.7];
    names.forEach((n, row) => P.forEach((pp, i) => {
      const d = DEFS.findIndex((x) => x.n === n), def = DEFS[d], g = buildStudent(def, false), ud = g.userData;
      const CH = CHAMPS[n], A = CANIM[CH_ANIM[CH.weapon]](pp);
      ud.arms[0].rotation.set(A.la ?? 0, 0, ud.restZ[0] + (A.lz || 0)); ud.arms[1].rotation.set(A.ra ?? 0, 0, ud.restZ[1] + (A.rz || 0));
      ud.elbows[0].rotation.x = -0.22 + (A.le || 0); ud.elbows[1].rotation.x = -0.22 + (A.re || 0);
      ud.torso.rotation.x = (A.lean || 0) + 0; ud.torso.rotation.y = A.spin != null ? A.spin : A.twist || 0; ud.head.rotation.x = A.head || 0;
      if (ud.aimW) for (const a of ud.aimW) { const mode = pp > 0 ? a.atk : a.idle, th = ud.arms[a.side].rotation.x + ud.elbows[a.side].rotation.x + ud.torso.rotation.x; a.w.rotation.x = mode === "up" ? -th : mode === "fwd" ? Math.PI / 2 - th : a.rest; }
      g.position.set((i - 2.5) * 1.75, -row * rowH - (A.hop ? -A.hop : 0) + (names.length - 1) * rowH / 2 - 1.0 + 1.1 - 1.1, 0);
      g.rotation.y = Math.PI / 2 - 0.35; // 오른쪽을 보고 공격 (옆모습)
      sc.add(g);
    }));
    r.render(sc, cam);
  }, names);
  await p.waitForTimeout(300); await p.screenshot({ path: out + ".png" });
  console.log("errors:", JSON.stringify(errs));
  await b.close();
})();
