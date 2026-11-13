// 사용: node tools/hero.js <dir> <out> <names,comma> [cull]  — 영웅 크게: 앞 / 3/4 / 뒤
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const dir = path.resolve(process.argv[2]), out = process.argv[3], names = process.argv[4].split(","), cull = process.argv[5] === "cull";
const mini = fs.readFileSync(path.join(__dirname, "mini-three.js"), "utf8");
(async () => {
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const p = await b.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });
  const errs = []; p.on("pageerror", (e) => errs.push(String(e.stack || e).slice(0, 600)));
  await p.route("**/*", (r) => { const u = r.request().url(); if (u.startsWith("file:")) return r.continue(); if (u.includes("three.min.js")) return r.fulfill({ contentType: "text/javascript", body: mini }); return r.abort(); });
  await p.goto("file://" + dir + "/index.html");
  await p.waitForTimeout(1200);
  await p.evaluate(([names, cull]) => {
    window.__CULL = cull;
    const cv2 = document.createElement("canvas"); cv2.id = "sheet"; cv2.style.cssText = "position:fixed;inset:0;z-index:999;background:#3c4652";
    document.body.appendChild(cv2);
    const r = new THREE.WebGLRenderer({ canvas: cv2 }); r.setSize(1200, 800); r.toneMappingExposure = 0.8;
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xc4c8ff, 0x58506e, 0.85));
    const sun = new THREE.DirectionalLight(0xffdcae, 1.5); sun.position.set(-6, 10, 12); sc.add(sun);
    const fill = new THREE.DirectionalLight(0xbfd0ff, 0.35); fill.position.set(10, 6, 6); sc.add(fill);
    const H = names.length * 2.6, cam = new THREE.PerspectiveCamera(2 * Math.atan(H / 60) * 180 / Math.PI, 1.5, 0.1, 200); cam.position.set(0, H / 2 + 0.1, 30); cam.lookAt(new THREE.Vector3(0, H / 2 + 0.1, 0));
    const rows = names.length, ang = [0.35, -0.9, Math.PI + 0.4];
    names.forEach((n, row) => {
      const def = DEFS.find((d) => d.n === n);
      ang.forEach((a, i) => { const u = buildStudent(def, false); u.position.set((i - 1) * 1.55, (rows - 1 - row) * 2.6 + 0.0, 0); u.rotation.y = a; sc.add(u); });
    });
    r.render(sc, cam);
  }, [names, cull]);
  await p.waitForTimeout(300);
  await p.screenshot({ path: out });
  console.log("errors:", JSON.stringify([...new Set(errs)].slice(0, 5), null, 1));
  await b.close();
})();
