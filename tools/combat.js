const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const dir = path.resolve(process.argv[2]), out = process.argv[3];
const mini = fs.readFileSync(path.join(__dirname, "mini-three.js"), "utf8");
(async () => {
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const p = await b.newPage({ viewport: { width: 1180, height: 820 } });
  const errs = []; p.on("pageerror", (e) => errs.push(String(e.stack || e).slice(0, 400)));
  await p.route("**/*", (r) => { const u = r.request().url(); if (u.startsWith("file:")) return r.continue(); if (u.includes("three.min.js")) return r.fulfill({ contentType: "text/javascript", body: mini }); return r.abort(); });
  await p.goto("file://" + dir + "/index.html"); await p.waitForTimeout(1200);
  await p.evaluate(() => {
    document.getElementById("ov").hidden = true;
    S.phase = "plan"; S.type = "pvp"; S.stage = 4; S.k = 2; S.timer = S.timerMax = 9999; S.car = null; S.augPending = false; document.getElementById("aug").hidden = true;
    const P = human(); P.level = 9;
    [[0, 1, 6, 2], [0, 3, 9, 2], [0, 5, 10, 1], [1, 2, 4, 2], [1, 4, 14, 1], [2, 3, 12, 2], [3, 1, 13, 1], [3, 3, 16, 1], [3, 5, 17, 1]].forEach(([r, c, d, s]) => (P.board[r][c] = mkUnit(d, s)));
    for (const Q of S.players.slice(1)) { Q.level = 8; [[0, 2, 1, 2], [0, 4, 7, 2], [1, 3, 2, 1], [2, 2, 5, 2], [2, 4, 8, 1], [3, 3, 11, 2], [3, 1, 15, 2], [3, 5, 0, 2]].forEach(([r, c, d, s]) => (Q.board[r][c] = mkUnit(d, s))); }
    startCombat();
  });
  for (const t of [2500, 4500]) { await p.waitForTimeout(t); await p.screenshot({ path: `${out}-${t}.png` }); }
  console.log("phase:", await p.evaluate(() => S.phase), "errors:", JSON.stringify([...new Set(errs)].slice(0, 5), null, 1));
  await b.close();
})();
