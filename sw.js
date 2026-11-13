// 우리반 오토배틀 앱: 한 번 열면 저장해 두고, 인터넷이 없어도 혼자 하기는 열려요.
// 게임 파일은 늘 새 버전을 먼저 받아 오고(안 되면 저장본), 3D 라이브러리·글꼴 같은 바깥 파일은 저장본을 먼저 써요.
const CACHE = "uri-autobattle-v1";
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"]).catch(() => {}))); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.protocol !== "https:" && url.protocol !== "http:") return;
  const same = url.origin === location.origin;
  if (same) { // 새 버전 먼저
    e.respondWith(fetch(req).then((res) => { if (res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); } return res; }).catch(() => caches.match(req).then((r) => r || caches.match("./index.html"))));
  } else if (/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(url.host)) { // 저장본 먼저
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => { if (res.ok || res.type === "opaque") { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); } return res; })));
  }
});
