// 사용: node tools/view.js <dir> <out-prefix> [game|chars|both]
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const dir = path.resolve(process.argv[2]), out = process.argv[3], mode = process.argv[4] || "both";
const mini = fs.readFileSync(path.join(__dirname, "mini-three.js"), "utf8");
(async () => {
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const p = await b.newPage({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1 });
  const errs = []; p.on("pageerror", (e) => errs.push(String(e.stack || e).slice(0, 500))); p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push("console: " + m.text().slice(0, 300)); });
  await p.route("**/*", (r) => { const u = r.request().url(); if (u.startsWith("file:")) return r.continue(); if (u.includes("three.min.js")) return r.fulfill({ contentType: "text/javascript", body: mini }); return r.abort(); });
  await p.goto("file://" + dir + "/index.html");
  await p.waitForTimeout(1500);
  if (mode !== "chars") {
    await p.evaluate(() => {
      document.getElementById("ov").hidden = true;
      S.phase = "plan"; S.type = "pvp"; S.stage = 3; S.k = 2; S.timer = S.timerMax = 9999; S.car = null;
      const P = human(); P.level = 7; P.gold = 42; P.shop = [0, 5, 9, 14, 17];
      const put = (r, c, d, star) => (P.board[r][c] = mkUnit(d, star));
      put(0, 2, 6, 2); put(0, 3, 10, 1); put(0, 4, 1, 2); put(1, 1, 4, 1); put(2, 3, 12, 2); put(3, 1, 3, 1); put(3, 5, 17, 1);
      P.bench[0] = mkUnit(0); P.bench[1] = mkUnit(7, 2); P.bench[3] = mkUnit(15); P.bench[6] = mkUnit(13);
      S.scout = 1; const Q = S.players[1]; [[0, 3, 2, 1], [0, 1, 8, 2], [1, 4, 11, 1], [2, 2, 16, 1], [3, 5, 5, 1]].forEach(([r, c, d, s]) => (Q.board[r][c] = mkUnit(d, s)));
      renderUI();
    });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: out + "-game.png" });
  }
  if (mode !== "game") {
    await p.evaluate(() => {
      const cv2 = document.createElement("canvas"); cv2.id = "sheet"; cv2.style.cssText = "position:fixed;inset:0;z-index:999;background:#3a4650";
      document.body.appendChild(cv2);
      const r = new THREE.WebGLRenderer({ canvas: cv2 }); r.setSize(1180, 820); r.toneMappingExposure = 0.76;
      const sc = new THREE.Scene();
      sc.add(new THREE.HemisphereLight(0xc4c8ff, 0x58506e, 0.8));
      const sun = new THREE.DirectionalLight(0xffdcae, 1.5); sun.position.set(-6, 10, 12); sc.add(sun);
      const fill = new THREE.DirectionalLight(0xbfd0ff, 0.3); fill.position.set(10, 6, 6); sc.add(fill);
      const cam = new THREE.PerspectiveCamera(16, 1180 / 820, 0.1, 200); cam.position.set(0, 3.4, 30); cam.lookAt(new THREE.Vector3(0, 2.75, 0));
      const cols = 6, list = DEFS.map((d, i) => i);
      list.forEach((d, i) => { const u = buildStudent(DEFS[d], false); u.position.set((i % cols - (cols - 1) / 2) * 1.45, 5.2 - Math.floor(i / cols) * 2.55 - 0.2, 0); u.rotation.y = (i % 2 ? -1 : 1) * 0.45; if (window.SHEET_BACK) u.rotation.y += Math.PI; sc.add(u); });
      r.render(sc, cam);
    });
    await p.waitForTimeout(300);
    await p.screenshot({ path: out + "-chars.png" });
  }
  console.log("errors:", JSON.stringify([...new Set(errs)].slice(0, 6), null, 1));
  await b.close();
})();
