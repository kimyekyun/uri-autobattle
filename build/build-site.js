// 웹 버전(클로드 없이 하는 사이트) 만들기: src/ (아티팩트 원본) → index.html (GitHub Pages)
// 사용: node build/build-site.js
//  · src/ 파일은 건드리지 않고, 메모리에서만 웹용으로 바꿔서 한 파일로 묶어요
//  · 친구와 같이 하기: Claude 방 기능 대신 web/mqttroom.js (MQTT 웹소켓 중계)
//  · 카드 사진: cards/cNN.jpg 파일 (SITE_CARDS)
//  · 앱 설치(PWA): manifest.webmanifest · sw.js · 아이콘
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), SRC = path.join(ROOT, "src");
const read = (p) => fs.readFileSync(path.join(SRC, p), "utf8");
const must = (s, a, b, what) => { if (!s.includes(a)) throw new Error("바꿀 자리를 못 찾았어요: " + what + " — src 가 바뀌었으면 이 스크립트도 고쳐 주세요"); return s.replace(a, b); };

const SITE_CARDS = { "진성욱": "cards/c00.jpg", "이현": "cards/c01.jpg", "박희찬": "cards/c02.jpg", "이보경": "cards/c03.jpg", "최효민": "cards/c04.jpg", "임시온": "cards/c05.jpg", "이준희": "cards/c06.jpg", "김현우": "cards/c07.jpg", "전하율": "cards/c08.jpg", "박준서": "cards/c09.jpg", "손태민": "cards/c10.jpg", "윤동욱": "cards/c11.jpg" };

// ---- 파일별 웹용 바꾸기 ----
const patch = {
  "js/online.js": (s) => {
    s = must(s, `  const use = window.claude && window.claude.use ? window.claude.use("room") : Promise.resolve(null);`,
      `  // claude.ai 안에서는 Claude의 방 기능을, 일반 웹사이트에서는 MQTT 중계(mqttroom.js)를 써요
  const inClaude = !!(window.claude && window.claude.use);
  const use = inClaude ? window.claude.use("room") : Promise.resolve(typeof makePeerRoom === "function" ? makePeerRoom() : null);`, "online.js 방 연결");
    s = s.replace(/\$\("netnote"\)\.textContent = "친구와 같이 하기는 게임 주인이[^"]*";/, `$("netnote").textContent = inClaude ? "친구와 같이 하기는 claude.ai에 로그인해서 열면 쓸 수 있어요." : "온라인 연결 도구를 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.";`);
    s = s.replace(/친구에게 이 링크와 방 코드 \$\{NET\.code\}를 알려주세요\.[^`]*2명부터 시작할 수 있어요\./, "친구에게 이 링크와 방 코드 ${NET.code}를 알려주세요. 친구도 같은 링크를 열고 같은 방 코드를 적으면 들어와요. 2명부터 시작할 수 있어요.");
    return s;
  },
  "js/photos.js": (s) => {
    s = must(s, `"use strict";\n`, `"use strict";\nconst SITE_CARDS = ${JSON.stringify(SITE_CARDS)};\n`, "photos.js 시작");
    s = must(s, `function photosInit() {\n`, `function photosInit() {\n  if (!window.claude) DEFS.forEach((def, d) => { const f = SITE_CARDS[def.n]; if (f && !hasCustomCard(d)) { PORTRAIT[d] = f; BASE_PORTRAIT[d] = f; } }); // 웹 버전: 같이 올린 사진 파일\n`, "photos.js photosInit");
    return s;
  },
};
let html = read("index.html");
html = html.replace(/<p class="netguide">[\s\S]*?<\/p>/, `<p class="netguide">친구들과 같은 방 코드를 쓰면 한 방에 모여요. 친구들도 같은 링크를 열고 같은 방 코드를 적으면 돼요. 인터넷이 연결돼 있어야 해요.</p>`);
html = html.replace(/^<!doctype html>.*?<body>\n/s, "").replace("</body></html>", "").trimEnd();
html = html.replace(`<link rel="stylesheet" href="style.css">`, () => `<style>\n${read("style.css")}\n</style>`);
html = html.replace(/<script src="(js\/[a-z0-9]+\.js)"><\/script>/g, (m, f) => {
  let code = read(f);
  if (patch[f]) code = patch[f](code);
  const pre = f === "js/online.js" ? `<script>\n${fs.readFileSync(path.join(ROOT, "web/mqttroom.js"), "utf8")}\n</script>\n` : "";
  return `${pre}<script>\n${code}\n</script>`;
});
const out = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0a161d">
<title>우리반 오토배틀</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon-192.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="우리반">
<script>if ("serviceWorker" in navigator && location.protocol === "https:") addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));</script>
<style>:root{box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
${html}
</body>
</html>
`;
if (/src="js\//.test(out) || /href="style.css"/.test(out)) throw new Error("묶이지 않은 로컬 파일이 있어요");
if (!out.includes("makePeerRoom()")) throw new Error("online.js 웹용 바꾸기가 안 됐어요");
fs.writeFileSync(path.join(ROOT, "index.html"), out);
console.log("index.html", out.length, "bytes,", (out.match(/<script/g) || []).length, "scripts");
