// ============================================================
//  online.js — 친구와 같이 하기 (같은 링크를 연 사람끼리 방 코드로 모여서 실시간 대전)
//  · 모이기: 방 코드가 같은 사람끼리 로비에 모이고, 방장이 시작을 눌러요
//  · 진행: 각자 자기 상점·골드를 운영하고, 전투 시작 직전에 모두 준비될 때까지 기다려요
//  · 대전: 사람끼리 짝이 되면 양쪽이 같은 씨앗(seed)으로 같은 전투를 계산해서 결과가 똑같아요
//  · 빈자리는 컴퓨터 반이 채워요 (컴퓨터 반은 각자 화면에서 따로 움직여요)
// ============================================================
"use strict";
const NET = {
  room: null, ready: false, on: false, done: false, code: "", name: "", me: null,
  gid: null, seed: 0, roster: null, myRi: -1, lastSent: "", sendT: 0, waitT: 0, missing: {}, joined: false,
};
const NET_APP = "ub1", NET_WAIT_MAX = 25, NET_GONE = 15;
function netHash(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }
function netRng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// 전투 계산을 정해진 씨앗으로: 두 화면이 같은 결과를 얻어요
function withRng(rng, fn) {
  if (!rng) return fn();
  const old = Math.random; Math.random = rng;
  try { return fn(); } finally { Math.random = old; }
}
const netRound = () => S.stage * 10 + S.k;
const netPeers = () => (NET.room ? NET.room.peers() : []);
const netMine = (p) => p.presence && p.presence.app === NET_APP && p.presence.rm === NET.code;
function netSnap(P) {
  const out = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < COLS; c++) { const u = P.board[r][c]; if (u) out.push([r, c, u.d, u.star, ...(u.items || [])]); }
  return out;
}
function netBoard(snap) {
  const b = Array.from({ length: 4 }, () => Array(COLS).fill(null));
  if (Array.isArray(snap)) for (const e of snap.slice(0, 28)) {
    if (!Array.isArray(e)) continue;
    const [r, c, d, star, ...items] = e;
    if (r >= 0 && r < 4 && c >= 0 && c < COLS && DEFS[d] && star >= 1 && star <= 3) b[r][c] = { uid: "n" + r + c + d, d, star, items: items.filter((x) => ITEMS[x]).slice(0, 3) };
  }
  return b;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const cleanName = (s) => String(s || "").replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯]/g, "").trim().slice(0, 8);

// ---------- 로비 ----------
function netShowPanel(show) {
  $("net").hidden = !show; $("ovbtns").hidden = show; $("ovrules").hidden = show; $("ovtext").hidden = show;
  $("netnote").hidden = show || NET.ready;
}
function netInit() {
  let saved = ""; try { saved = localStorage.getItem("uri-net-name") || ""; } catch (e) {}
  $("netname").value = saved;
  $("netcode").value = String(1000 + Math.floor(Math.random() * 9000));
  const use = window.claude && window.claude.use ? window.claude.use("room") : Promise.resolve(null);
  use.then((room) => {
    if (!room) { $("netnote").textContent = "친구와 같이 하기는 게임 주인이 공유 메뉴에서 초대한 claude.ai 계정으로 로그인해서 열어야 쓸 수 있어요. 링크만으로는 안 돼요."; return; }
    NET.room = room; NET.ready = true;
    $("online").disabled = false; $("netnote").hidden = true;
    room.onPeers(() => netLobby(), () => { NET.ready = false; $("online").disabled = true; $("netnote").hidden = false; $("netnote").textContent = "온라인 연결이 끊겼어요. 새로고침해 주세요."; });
  }).catch(() => { $("netnote").textContent = "온라인에 연결하지 못했어요."; });
}
function netJoin() {
  const name = cleanName($("netname").value), code = String($("netcode").value || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  if (!name) { $("netname").focus(); return toast("이름을 적어 주세요"); }
  if (!code) { $("netcode").focus(); return toast("방 코드를 적어 주세요"); }
  try { localStorage.setItem("uri-net-name", name); } catch (e) {}
  NET.name = name; NET.code = code; NET.joined = true; NET.done = false; NET.on = false;
  NET.room.presence({ app: NET_APP, rm: code, n: name, st: "lobby", start: null, gid: null, rd: null, rdy: null, hp: null, lv: null, al: null, pl: null, b: null, e: null, bf: null }).catch(() => {});
  $("netlobby").hidden = false; $("netjoin").textContent = "방 바꾸기";
  netLobby();
}
function netLeave() {
  NET.joined = false;
  if (NET.room) NET.room.presence({ app: null, rm: null, st: null, start: null }).catch(() => {});
  $("netlobby").hidden = true; $("netjoin").textContent = "방 들어가기";
  netShowPanel(false);
}
function netLobby() {
  if (!NET.room) return;
  const all = netPeers();
  const me = all.find((p) => p.sameTab); if (me) NET.me = me.peer;
  if (NET.on || !NET.joined) return;
  const here = all.filter(netMine), lobby = here.filter((p) => p.presence.st === "lobby").sort((a, b) => (a.peer < b.peer ? -1 : 1));
  // 누가 나를 넣어서 게임을 시작했으면 바로 들어가요
  const starter = here.find((p) => p.presence.start && Array.isArray(p.presence.start.ro) && p.presence.start.ro.some((r) => r[0] === NET.me) && p.presence.start.gid !== NET.lastGid);
  if (starter) return netBegin(starter.presence.start);
  const host = lobby[0], iAmHost = host && host.sameTab, playing = here.filter((p) => p.presence.st === "game").length;
  $("netlist").innerHTML = lobby.slice(0, 8).map((p, i) => `<li><span class="dot${p.guest ? " g" : ""}"></span>${esc(cleanName(p.presence.n) || "이름 없음")}${p.sameTab ? " <em>나</em>" : ""}${i === 0 ? " <small>방장</small>" : ""}</li>`).join("");
  const n = Math.min(8, lobby.length);
  $("netmsg").textContent = n < 2
    ? `친구에게 이 링크와 방 코드 ${NET.code}를 알려주세요. 친구는 공유 메뉴에서 초대된 계정이어야 해요. 2명부터 시작할 수 있어요.`
    : iAmHost ? `${n}명 모였어요. 빈자리 ${8 - n}개는 컴퓨터 반이 채워요.` : `${n}명 모였어요. 방장이 시작하기를 기다리는 중…`;
  if (playing && lobby.length < 2) $("netmsg").textContent = `이 방은 이미 게임 중이에요 (${playing}명). 다른 방 코드를 써 주세요.`;
  if (lobby.length > 8) $("netmsg").textContent += " 8명까지만 들어가요.";
  $("netstart").hidden = !iAmHost; $("netstart").disabled = n < 2;
}
function netStartAsHost() {
  const lobby = netPeers().filter((p) => netMine(p) && p.presence.st === "lobby").sort((a, b) => (a.peer < b.peer ? -1 : 1)).slice(0, 8);
  if (lobby.length < 2 || !lobby[0].sameTab) return;
  const start = { gid: Math.random().toString(36).slice(2, 10), seed: Math.floor(Math.random() * 1e9), ro: lobby.map((p) => [p.peer, cleanName(p.presence.n) || "친구"]) };
  NET.room.presence({ start }).catch(() => {});
  netBegin(start);
}
function netBegin(start) {
  const ri = start.ro.findIndex((r) => r[0] === NET.me);
  if (ri < 0) return;
  Object.assign(NET, { on: true, done: false, gid: String(start.gid), seed: start.seed >>> 0, roster: start.ro.slice(0, 8), myRi: ri, lastGid: String(start.gid), lastSent: "", waitT: 0, missing: {} });
  NET.room.presence({ st: "game", gid: NET.gid }).catch(() => {});
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  netShowPanel(false);
  $("ov").hidden = true; newGame(); resize();
  toast(`${NET.roster.length}명이 함께하는 온라인 게임 시작!`);
}

// ---------- 게임 안: 자리 채우기 ----------
function netSetup() {
  const me = S.players[0];
  me.name = NET.name; me.ri = NET.myRi; me.peer = NET.me;
  NET.roster.map((r, ri) => ({ peer: r[0], n: cleanName(r[1]) || "친구", ri })).filter((x) => x.ri !== NET.myRi).forEach((o, k) => {
    const P = S.players[k + 1];
    Object.assign(P, { remote: true, human: false, name: o.n, ri: o.ri, peer: o.peer, gold: 0, shop: [] });
  });
}
const isLocal = (P) => !P.remote;
// 사람끼리는 모두 같은 씨앗으로 섞어서 같은 짝을 얻어요
function netPairs() {
  const rd = netRound(), me = human();
  const hum = S.players.filter((p) => p.alive && (p === me || p.remote)).sort((a, b) => a.ri - b.ri);
  const rng = netRng(netHash(NET.gid + ":" + rd + ":" + NET.seed));
  for (let i = hum.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [hum[i], hum[j]] = [hum[j], hum[i]]; }
  const pairs = [];
  let lone = null;
  for (let i = 0; i < hum.length; i += 2) {
    if (i + 1 >= hum.length) { lone = hum[i]; break; }
    const [x, y] = hum[i].ri < hum[i + 1].ri ? [hum[i], hum[i + 1]] : [hum[i + 1], hum[i]];
    if (x === me || y === me) pairs.push({ a: x, b: y, ghost: false, net: true });
  }
  const ais = S.players.filter((p) => p.alive && !p.human && !p.remote);
  if (lone === me) {
    const foe = ais.length ? rnd(ais) : rnd(hum.filter((p) => p !== me));
    if (foe) pairs.push({ a: me, b: foe, ghost: true });
  }
  const sh = shuffle([...ais]);
  for (let i = 0; i + 1 < sh.length; i += 2) pairs.push({ a: sh[i], b: sh[i + 1], ghost: false });
  if (sh.length % 2) { const x = sh[sh.length - 1], others = ais.filter((p) => p !== x); if (others.length) pairs.push({ a: x, b: rnd(others), ghost: true }); }
  return pairs;
}
function netBattle(pr) {
  const rng = netRng(netHash(NET.gid + ":" + netRound() + ":" + pr.a.ri + ":" + pr.b.ri + ":" + NET.seed));
  FLIP = pr.b.human;
  const B = withRng(rng, () => makeBattle(sideOf(pr.a), sideOf(pr.b), true, pr.a, pr.b));
  B.rng = rng; B.net = true;
  return B;
}

// ---------- 전투 직전: 모두 준비될 때까지 기다리기 ----------
function netWait() {
  if (S.phase !== "plan" || S.augPending) return;
  collectOrbs(true);
  S.sel = null; S.scout = null; drag = null;
  autoFill(human());
  S.phase = "wait"; NET.waitT = 0;
  netSend(true);
  renderUI();
}
function netReadyCount() {
  const rd = netRound(), peers = netPeers();
  let ok = 1, all = 1;
  for (const P of S.players) {
    if (!P.remote || !P.alive) continue;
    all++;
    const p = peers.find((x) => x.peer === P.peer && x.presence && x.presence.gid === NET.gid);
    if (!p) { ok++; continue; }
    const q = p.presence;
    if (q.al === false || q.rd > rd || (q.rd === rd && q.rdy)) ok++;
  }
  return [ok, all];
}
function netWaitStep(real) {
  NET.waitT += real;
  const [ok, all] = netReadyCount();
  $("rtype").textContent = `준비 완료 · 다른 반 기다리는 중 ${ok}/${all}`;
  // 시작 직전에 친구들의 최신 배치를 한 번 더 받아요 (준비 신호와 같은 순간의 배치)
  if (ok >= all || NET.waitT > NET_WAIT_MAX) { netPull(0); startCombatNow(); }
}

// ---------- 내 상태 알리기 · 친구 상태 받기 ----------
function netSend(force) {
  if (!NET.on || !NET.room || !S) return;
  const P = human();
  const o = { rd: netRound(), rdy: S.phase === "wait" || S.phase === "combat" || S.phase === "result", hp: Math.max(0, P.hp), lv: P.level, al: P.alive, pl: P.place || null, b: netSnap(P), e: P.emb, bf: P.buff };
  const js = JSON.stringify(o);
  if (!force && js === NET.lastSent) return;
  NET.lastSent = js;
  NET.room.presence(o).catch(() => {});
}
function netPull(real) {
  const peers = netPeers();
  for (const P of S.players) {
    if (!P.remote || P.gone) continue;
    const p = peers.find((x) => x.peer === P.peer && x.presence && x.presence.gid === NET.gid);
    if (!p) {
      NET.missing[P.peer] = (NET.missing[P.peer] || 0) + real;
      if (NET.missing[P.peer] > NET_GONE && P.alive) {
        P.gone = true; P.alive = false; P.place = alivePlayers().length + 1;
        toast(`${P.name} 님이 나갔어요`);
        renderUI();
      }
      continue;
    }
    NET.missing[P.peer] = 0;
    const q = p.presence;
    if (S.phase !== "combat" && S.phase !== "result") {
      if (typeof q.hp === "number") P.hp = Math.max(0, Math.round(q.hp));
      if (typeof q.lv === "number") P.level = Math.max(1, Math.min(10, q.lv | 0));
      P.board = netBoard(q.b);
      P.emb = q.e && typeof q.e === "object" ? Object.fromEntries(Object.entries(q.e).filter(([k, v]) => TRAITS[k] && typeof v === "number").map(([k, v]) => [k, Math.max(0, Math.min(3, v | 0))])) : {};
      const bf = q.bf || {}, num = (v) => (typeof v === "number" && isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
      P.buff = { as: num(bf.as), ar: num(bf.ar), ad: num(bf.ad), hp: num(bf.hp) };
    }
    if (q.al === false && P.alive) {
      P.alive = false; P.place = q.pl || alivePlayers().length + 1;
      toast(`${P.name} 탈락! (${P.place}등)`); renderUI();
    }
  }
}
function netTick(real) {
  if (!NET.on || NET.done || !S) return;
  NET.sendT += real;
  if (NET.sendT > 0.25) { NET.sendT = 0; netPull(0.25); netSend(false); }
  if (S.phase === "wait") netWaitStep(real);
}
function netFinish() {
  if (!NET.on) return;
  netSend(true);
  NET.done = true; NET.on = false;
}
