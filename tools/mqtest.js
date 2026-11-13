// 가짜 MQTT 브로커로 mqttroom.js 두 개를 붙여 보는 시험
const fs = require("fs");
globalThis.window = { addEventListener() {} };
const retained = new Map(), clients = new Set();
const rd = (u8, o) => { const n = (u8[o] << 8) | u8[o + 1]; return [Buffer.from(u8.subarray(o + 2, o + 2 + n)).toString(), o + 2 + n]; };
const len = (n) => { const o = []; do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; o.push(d); } while (n > 0); return o; };
function mkPub(topic, payload) { const t = Buffer.from(topic); const body = [t.length >> 8, t.length & 255, ...t, ...payload]; return new Uint8Array([0x30, ...len(body.length), ...body]); }
function match(f, t) { return f.endsWith("+") ? t.startsWith(f.slice(0, -1)) && !t.slice(f.length - 1).includes("/") : f === t; }
class FakeWS {
  constructor(url, proto) { this.readyState = 0; this.subs = []; this.url = url; clients.add(this); setTimeout(() => { if (url.includes("emqx.io:8084/mqtt") && !url.includes("cn") && globalThis.FAIL_FIRST) { this.readyState = 3; this.onclose && this.onclose(); return; } this.readyState = 1; this.onopen && this.onopen(); }, 5); }
  deliver(u8) { setTimeout(() => this.onmessage && this.onmessage({ data: u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) }), 1); }
  send(u8) {
    let i = 1, mul = 1, n = 0, b; do { b = u8[i++]; n += (b & 127) * mul; mul *= 128; } while (b & 128);
    const type = u8[0] >> 4, body = u8.subarray(i, i + n);
    if (type === 1) { let [p, o] = rd(body, 0); o += 1; const fl = body[o]; o += 3; let id; [id, o] = rd(body, o); if (fl & 4) { let wt; [wt, o] = rd(body, o); const wl = (body[o] << 8) | body[o + 1]; this.will = { t: wt, p: body.subarray(o + 2, o + 2 + wl), r: !!(fl & 0x20) }; } this.deliver(new Uint8Array([0x20, 2, 0, 0])); }
    else if (type === 8) { const [f] = rd(body, 2); this.subs.push(f); this.deliver(new Uint8Array([0x90, 3, body[0], body[1], 0])); for (const [t, p] of retained) if (match(f, t)) this.deliver(mkPub(t, p)); }
    else if (type === 3) { const [t, o] = rd(body, 0); const p = body.slice(o); if (u8[0] & 1) { if (p.length) retained.set(t, p); else retained.delete(t); } for (const c of clients) if (c.readyState === 1 && c.subs.some((f) => match(f, t))) c.deliver(mkPub(t, p)); }
    else if (type === 14) { this.will = null; }
  }
  close() { if (this.readyState === 3) return; this.readyState = 3; clients.delete(this); if (this.will) this.send(mkPub(this.will.t, this.will.p).map((x, k) => (k === 0 ? 0x31 : x))); }
}
// 브로커가 연결이 끊긴 사람의 유언 메시지를 대신 보내는 흉내
FakeWS.prototype.drop = function () { const w = this.will; this.readyState = 3; clients.delete(this); if (w) { if (w.r) retained.set(w.t, w.p); if (!w.p.length) retained.delete(w.t); for (const c of clients) if (c.subs.some((f) => match(f, w.t))) c.deliver(mkPub(w.t, w.p)); } this.onclose && this.onclose(); };
globalThis.WebSocket = FakeWS;
eval(fs.readFileSync(process.argv[2], "utf8") + "\nglobalThis.makePeerRoom = makePeerRoom;");
globalThis.FAIL_FIRST = true;
const A = makePeerRoom(), B = makePeerRoom();
const names = (r) => r.peers().map((p) => (p.presence.n || "?") + (p.isMe ? "*" : "")).join(",");
(async () => {
  A.presence({ rm: "1234", n: "예균", st: "lobby" });
  await new Promise((r) => setTimeout(r, 400));
  B.presence({ rm: "1234", n: "주환", st: "lobby" });
  await new Promise((r) => setTimeout(r, 400));
  console.log("A sees", names(A), "| B sees", names(B), "| A ok", A.connected(), "brokers", [...clients].map((c) => c.url.split("/")[2]).join(" "));
  B.presence({ st: "play", b: [1, 2, 3] });
  await new Promise((r) => setTimeout(r, 300));
  console.log("A sees B state", JSON.stringify(A.peers().find((p) => !p.isMe).presence));
  [...clients].find((c) => c.will && c.will.t.endsWith(B.peers()[0].peer)).drop(); // B 갑자기 끊김
  await new Promise((r) => setTimeout(r, 300));
  console.log("after B drop, A sees", names(A));
  process.exit(0);
})();
