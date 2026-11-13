const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const dir = path.resolve(process.argv[2]), out = process.argv[3], foe = process.argv[4] || "dummy";
const mini = fs.readFileSync(path.join(__dirname, "mini-three.js"), "utf8");
(async () => {
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const p = await b.newPage({ viewport: { width: 1180, height: 820 } });
  const errs = []; p.on("pageerror", (e) => errs.push(String(e.stack || e).slice(0, 500)));
  await p.route("**/*", (r) => { const u = r.request().url(); if (u.startsWith("file:")) return r.continue(); if (u.includes("three.min.js")) return r.fulfill({ contentType: "text/javascript", body: mini }); return r.abort(); });
  await p.goto("file://" + dir + "/index.html"); await p.waitForTimeout(1200);
  await p.click("#practice"); await p.waitForTimeout(500);
  if (foe === "team") await p.click('#prac [data-foe="team"]');
  await p.click("#ready"); await p.evaluate(() => { S.speed = 0.5; });
  const shots = [];
  for (let i = 0; i < 18; i++) { await p.waitForTimeout(350); const st = await p.evaluate(() => { const z = S.battle && S.battle.zones.find((z) => z.kind === "rend"); return z ? z.t.toFixed(2) : "-"; }); const f = `${out}-${String(i).padStart(2, "0")}.png`; await p.screenshot({ path: f }); shots.push(st); }
  console.log(shots.join(" "));
  console.log("errors:", JSON.stringify([...new Set(errs)].slice(0, 5), null, 1));
  await b.close();
})();
