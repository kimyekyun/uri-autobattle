// ============================================================
//  mqttroom.js — Claude 없이도 같이 하기 (외부 라이브러리 없이 MQTT 웹소켓으로 연결)
//  · 공개 MQTT 중계 서버를 써요. 중국에서도 잘 되는 서버를 먼저 시도하고, 안 되면 다음 서버로 넘어가요
//  · 방 코드마다 주제(topic)를 하나 쓰고, 각자 자기 상태를 '남겨 두는(retain)' 메시지로 올려요
//  · 연결이 끊기면 서버가 대신 빈 메시지(유언 메시지)를 올려서 방에서 빠지게 해요
//  · online.js 가 쓰는 방 기능(peers · onPeers · presence)을 Claude 방 기능과 똑같이 흉내 내요
// ============================================================
"use strict";
const MQ_BROKERS = ["wss://broker.emqx.io:8084/mqtt", "wss://broker-cn.emqx.io:8084/mqtt", "wss://test.mosquitto.org:8081/mqtt", "wss://broker.hivemq.com:8884/mqtt"];
const MQ_PREFIX = "uri-autobattle/v2/";
function makePeerRoom() {
  if (typeof WebSocket === "undefined" || typeof TextEncoder === "undefined") return null;
  const ME = "u" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
  const enc = new TextEncoder(), dec = new TextDecoder();
  let mine = {}, others = {}, seen = {}, handlers = [], code = null, ws = null, ok = false, gen = 0, bi = 0, pubT = null, beatT = null, pingT = null, buf = new Uint8Array(0), pid = 1;
  const topicOf = (c) => MQ_PREFIX + c + "/p/";
  const list = () => {
    const out = [{ peer: ME, sameTab: true, isMe: true, guest: false, kind: "viewer", presence: Object.freeze({ ...mine }) }];
    for (const [id, pr] of Object.entries(others)) if (id !== ME) out.push({ peer: id, sameTab: false, isMe: false, guest: false, kind: "viewer", presence: Object.freeze({ ...pr }) });
    return Object.freeze(out);
  };
  let snap = list();
  const fire = () => { snap = list(); handlers.forEach((h) => { try { h({ peers: snap, joined: [], left: [], updated: [] }); } catch (e) {} }); };
  // ---- MQTT 3.1.1 패킷 만들기 ----
  const str = (s) => { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b]; };
  const len = (n) => { const o = []; do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; o.push(d); } while (n > 0); return o; };
  const pkt = (h, body) => new Uint8Array([h, ...len(body.length), ...body]);
  const send = (u8) => { if (ws && ws.readyState === 1) try { ws.send(u8); } catch (e) {} };
  const publish = (topic, payload, retain) => { const p = typeof payload === "string" ? enc.encode(payload) : payload; const t = str(topic); const body = new Uint8Array(t.length + p.length); body.set(t, 0); body.set(p, t.length); const h = [0x30 | (retain ? 1 : 0), ...len(body.length)]; const out = new Uint8Array(h.length + body.length); out.set(h, 0); out.set(body, h.length); send(out); };
  const subscribe = (topic) => { const id = pid++ & 0xffff || 1; send(pkt(0x82, [id >> 8, id & 255, ...str(topic), 0])); };
  // ---- 받은 바이트를 패킷으로 나눠 읽기 ----
  function onBytes(u8) {
    const nb = new Uint8Array(buf.length + u8.length); nb.set(buf, 0); nb.set(u8, buf.length); buf = nb;
    for (;;) {
      if (buf.length < 2) return;
      let mul = 1, n = 0, i = 1, b;
      do { if (i >= buf.length) return; b = buf[i++]; n += (b & 127) * mul; mul *= 128; } while (b & 128);
      if (buf.length < i + n) return;
      const type = buf[0] >> 4, flags = buf[0] & 15, body = buf.subarray(i, i + n);
      buf = buf.slice(i + n);
      if (type === 2) { if (body[1] === 0) onConnected(); }
      else if (type === 3) {
        const tl = (body[0] << 8) | body[1], topic = dec.decode(body.subarray(2, 2 + tl)); let off = 2 + tl;
        if ((flags >> 1) & 3) off += 2;
        onMessage(topic, body.subarray(off));
      }
    }
  }
  function onMessage(topic, payload) {
    if (!code || !topic.startsWith(topicOf(code))) return;
    const id = topic.slice(topicOf(code).length); if (!id || id === ME || id.length > 32) return;
    if (!payload.length) { if (others[id]) { delete others[id]; delete seen[id]; fire(); } return; }
    try { const m = JSON.parse(dec.decode(payload)); if (m && typeof m === "object" && m.pr && typeof m.pr === "object" && !(m.ts && Date.now() - m.ts > 60000)) { others[id] = m.pr; seen[id] = Date.now(); fire(); } } catch (e) {}
  }
  function onConnected() {
    ok = true; bi = bi % MQ_BROKERS.length;
    subscribe(topicOf(code) + "+");
    pubNow();
    clearInterval(beatT); beatT = setInterval(() => { pubNow(); const now = Date.now(); let ch = false; for (const id of Object.keys(others)) if (now - (seen[id] || 0) > 75000) { delete others[id]; delete seen[id]; ch = true; } if (ch) fire(); }, 20000); // 살아 있다는 표시 + 오래 소식 없는 사람 빼기
    clearInterval(pingT); pingT = setInterval(() => send(new Uint8Array([0xc0, 0])), 25000);
    fire();
  }
  const pubNow = () => { if (ok && code) publish(topicOf(code) + ME, JSON.stringify({ pr: mine, ts: Date.now() }), true); };
  const pubSoon = () => { if (pubT) return; pubT = setTimeout(() => { pubT = null; pubNow(); }, 70); };
  function close(clean) {
    gen++; ok = false; clearInterval(beatT); clearInterval(pingT); clearTimeout(pubT); pubT = null; buf = new Uint8Array(0);
    if (ws) { if (clean && ws.readyState === 1) { try { publish(topicOf(code) + ME, new Uint8Array(0), true); send(new Uint8Array([0xe0, 0])); } catch (e) {} } try { ws.close(); } catch (e) {} }
    ws = null;
  }
  function open(c, delay) {
    const my = ++gen;
    setTimeout(() => {
      if (my !== gen || c !== code) return;
      const url = MQ_BROKERS[bi % MQ_BROKERS.length];
      let s; try { s = new WebSocket(url, "mqtt"); } catch (e) { bi++; open(c, 800); return; }
      ws = s; s.binaryType = "arraybuffer";
      const fail = () => { if (my !== gen) return; ok = false; ws = null; clearInterval(beatT); clearInterval(pingT); bi++; open(c, bi % MQ_BROKERS.length ? 300 : 3000); };
      const timer = setTimeout(() => { if (my === gen && !ok) { try { s.close(); } catch (e) {} fail(); } }, 6000);
      s.onopen = () => {
        if (my !== gen) return;
        const will = topicOf(c) + ME; // 끊기면 서버가 빈 메시지를 남겨서 방에서 빠져요
        send(pkt(0x10, [...str("MQTT"), 4, 0x02 | 0x04 | 0x20, 0, 40, ...str(ME), ...str(will), 0, 0]));
      };
      s.onmessage = (e) => { if (my === gen) { if (!ok) clearTimeout(timer); onBytes(new Uint8Array(e.data)); } };
      s.onclose = () => { clearTimeout(timer); if (my === gen) { others = {}; fire(); fail(); } };
      s.onerror = () => {};
    }, delay || 0);
  }
  window.addEventListener("pagehide", () => close(true));
  return {
    peers: () => snap,
    onPeers(h) { handlers.push(h); setTimeout(() => h({ peers: snap, joined: snap, left: [], updated: [] }), 0); return () => { handlers = handlers.filter((x) => x !== h); }; },
    presence(patch) {
      for (const [k, v] of Object.entries(patch || {})) { if (v === null) delete mine[k]; else mine[k] = v; }
      const c = typeof mine.rm === "string" && mine.rm ? mine.rm : null;
      if (c !== code) { close(true); code = c; others = {}; seen = {}; if (c) { open(c, 0); setTimeout(() => { if (code === c && !ok && typeof toast === "function") toast("온라인 서버에 연결하는 중이에요… 잠시만요"); }, 7000); } }
      else pubSoon();
      fire();
      return Promise.resolve();
    },
    connected: () => ok,
  };
}
