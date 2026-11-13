// ============================================================
//  game.js — 게임 규칙 (상점 · 유닛 · 합성 · 라운드 진행 · 급식 줄 · 컴퓨터 반)
// ============================================================
"use strict";
// =============== 상태 ===============
let S = null;
const human = () => S.players[0];
function newPlayer(i) {
  return {
    i, name: i === 0 ? "우리반(나)" : CLASS_NAMES[i - 1], human: i === 0,
    hp: 100, gold: 0, level: 1, xp: 0,
    board: Array.from({ length: 4 }, () => Array(COLS).fill(null)), // 0행 = 맨 앞줄
    bench: Array(BENCH).fill(null), items: [], shop: [null, null, null, null, null],
    locked: false, streak: 0, alive: true, place: 0, lastOpp: -1,
    plan: shuffle([...MAIN_TRAITS]).slice(0, 2),
    gpr: 0, buff: { as: 0, ar: 0, ad: 0, hp: 0 }, emb: {}, augs: [],
  };
}
function newGame() {
  S = {
    stage: 1, k: 1, type: "carousel", phase: "carousel", timer: 0, timerMax: 1,
    players: Array.from({ length: 8 }, (_, i) => newPlayer(i)),
    pool: DEFS.map((d) => POOL_SIZE[d.c]),
    speed: S ? S.speed : 1, fast: S ? S.fast : false,
    battle: null, results: [], car: null, sel: null, scout: null, opp: null,
    banner: null, resultT: 0, shake: 0, orbs: [], augPending: false,
  };
  if (NET.on) netSetup();
  startRound(true);
}

// =============== 상점과 공용 풀 ===============
function rollCost(level) {
  const o = ODDS[level]; let r = Math.random() * 100;
  for (let i = 0; i < 5; i++) { if (r < o[i]) return i + 1; r -= o[i]; }
  return 1;
}
function drawFromPool(level) {
  for (let tries = 0; tries < 15; tries++) {
    const cost = rollCost(level);
    const cands = DEFS.map((_, i) => i).filter((i) => DEFS[i].c === cost && S.pool[i] > 0);
    const total = cands.reduce((s, i) => s + S.pool[i], 0);
    if (!total) continue;
    let r = Math.random() * total;
    for (const i of cands) { r -= S.pool[i]; if (r < 0) { S.pool[i]--; return i; } }
  }
  return null;
}
function refreshShop(P) {
  P.shop.forEach((di) => di != null && S.pool[di]++);
  P.shop = Array.from({ length: 5 }, () => drawFromPool(P.level));
}

// =============== 유닛 관리 ===============
function mkUnit(d, star = 1) { return { uid: uid++, d, star, items: [] }; }
function unitsOf(P) {
  const out = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < COLS; c++) if (P.board[r][c]) out.push({ u: P.board[r][c], w: "b", r, c });
  P.bench.forEach((u, i) => u && out.push({ u, w: "n", i }));
  return out;
}
function boardCount(P) { let n = 0; for (const row of P.board) for (const u of row) if (u) n++; return n; }
function getAt(P, l) { return l.w === "b" ? P.board[l.r][l.c] : P.bench[l.i]; }
function setAt(P, l, u) { if (l.w === "b") P.board[l.r][l.c] = u; else P.bench[l.i] = u; }
const sameLoc = (a, b) => a && b && a.w === b.w && (a.w === "b" ? a.r === b.r && a.c === b.c : a.i === b.i);

function buy(P, i) {
  const di = P.shop[i]; if (di == null) return false;
  const def = DEFS[di]; if (P.gold < def.c) return false;
  const free = P.bench.indexOf(null);
  const canMerge = S.phase === "plan" || !P.human;
  if (free < 0) {
    const copies = unitsOf(P).filter((x) => x.u.d === di && x.u.star === 1).length;
    if (!canMerge || copies < 2) return false;
  }
  P.gold -= def.c; P.shop[i] = null;
  const u = mkUnit(di);
  if (free >= 0) P.bench[free] = u; else P.bench.push(u);
  if (canMerge) merge(P, di, 1);
  P.bench.length = BENCH;
  return true;
}
function merge(P, d, star) {
  if (star >= 3) return;
  const list = unitsOf(P).filter((x) => x.u.d === d && x.u.star === star);
  if (list.length < 3) return;
  const keep = list[0], others = list.slice(-2);
  for (const o of others) {
    setAt(P, o, null);
    for (const it of o.u.items) if (!addItem(keep.u, it)) giveItem(P, it);
  }
  keep.u.star = star + 1;
  if (P.human && typeof WFX !== "undefined") {
    const x = keep.w === "b" ? worldX(gridX(4 + keep.r, keep.c)) : benchX(keep.i), z = keep.w === "b" ? worldZ(4 + keep.r) : BENCH_Z;
    // 합성 연출: 빛 기둥 + 별 폭죽 + 퍼지는 고리 (★3은 금색으로 더 크게)
    const gold = star + 1 >= 3, col = gold ? "#ffd75a" : "#cfe6ff";
    WFX.push({ w: 1, X: x, Y: z, r: 1.4, col: "#ffd75a", t: 0.7, t0: 0.7 }, { w: 1, kind: "spark", X: x, Y: z, col: "#ffe9a0", t: 0.6, t0: 0.6 },
      { w: 1, kind: "pillar", X: x, Y: z, col, big: gold, t: gold ? 1.3 : 1.0, t0: gold ? 1.3 : 1.0 },
      { w: 1, kind: "stars", X: x, Y: z, col: gold ? "#fff1a8" : "#ffffff", n: gold ? 18 : 10, t: 1.1, t0: 1.1 },
      { w: 1, X: x, Y: z, r: gold ? 3.2 : 2.2, col, t: 0.9, t0: 0.9 });
    if (gold) { WFX.push({ w: 1, X: x, Y: z, r: 4.5, col: "#ff9a3a", t: 1.2, t0: 1.2 }); S.shake = Math.max(S.shake || 0, 0.4); }
  }
  if (P.human) {
    sfx("merge"); if (star + 1 >= 3) sfx("level");
    S.mergeFx = { name: DEFS[d].n, star: star + 1, t: 1.6, t0: 1.6 };
  }
  merge(P, d, star + 1);
}
function mergeAll(P) { for (let star = 1; star <= 2; star++) for (let d = 0; d < DEFS.length; d++) merge(P, d, star); }
function sellValue(u) { const c = DEFS[u.d].c; return u.star === 1 ? c : c * Math.pow(3, u.star - 1) - 1; }
function sell(P, loc) {
  const u = getAt(P, loc); if (!u) return;
  P.gold += sellValue(u); S.pool[u.d] += Math.pow(3, u.star - 1);
  u.items.forEach((it) => giveItem(P, it));
  setAt(P, loc, null);
}
function giveItem(P, id) { if (ITEMS_ON && P.items.length < ITEM_MAX) P.items.push(id); }
function canAdd(u, id) { return (ITEMS[id].comp && u.items.some((x) => ITEMS[x].comp)) || u.items.length < 3; }
function addItem(u, id) {
  if (ITEMS[id].comp) {
    const ci = u.items.findIndex((x) => ITEMS[x].comp);
    if (ci >= 0) { u.items[ci] = comboKey(u.items[ci], id); return true; }
  }
  if (u.items.length < 3) { u.items.push(id); return true; }
  return false;
}
function equip(P, ii, loc) {
  const u = getAt(P, loc), id = P.items[ii];
  if (!u || !id || !addItem(u, id)) return false;
  P.items.splice(ii, 1);
  return true;
}
function addXp(P, n) {
  if (P.level >= 10) return;
  P.xp += n;
  while (P.level < 10 && P.xp >= XPNEED[P.level]) {
    P.xp -= XPNEED[P.level]; P.level++;
    if (P.human && S.phase !== "carousel") { sfx("level"); toast(`레벨 ${P.level}! 이제 ${P.level}명까지 배치할 수 있어요`); }
  }
  if (P.level >= 10) P.xp = 0;
}
function buyXp(P) { if (P.gold < 4 || P.level >= 10) return false; P.gold -= 4; addXp(P, 4); return true; }
function reroll(P) { if (P.gold < 2) return false; P.gold -= 2; refreshShop(P); return true; }
function autoFill(P) {
  const order = [3, 2, 4, 1, 5, 0, 6];
  for (let i = 0; i < BENCH && boardCount(P) < P.level; i++) {
    const u = P.bench[i]; if (!u) continue;
    const rg = CLASS[DEFS[u.d].k].rg, rows = rg <= 1 ? [0, 1, 2, 3] : [3, 2, 1, 0];
    let placed = false;
    for (const r of rows) { for (const c of order) if (!P.board[r][c]) { P.board[r][c] = u; P.bench[i] = null; placed = true; break; } if (placed) break; }
  }
}

// =============== 시너지 ===============
function traitCounts(defIdxs) {
  const cnt = {};
  [...new Set(defIdxs)].forEach((i) => DEFS[i].t.forEach((t) => (cnt[t] = (cnt[t] || 0) + 1)));
  return cnt;
}
function traitLvl(t, n) { return TRAITS[t].t.filter((x) => n >= x).length; }

// =============== 라운드 진행 ===============
function roundType(s, k) {
  if (s === 1) return k === 1 ? "carousel" : "pve";
  if (k === 4) return "carousel";
  if (k === 7) return "pve";
  return "pvp";
}
const alivePlayers = () => S.players.filter((p) => p.alive);
function startRound(first) {
  S.type = roundType(S.stage, S.k);
  if (!first) {
    for (const P of alivePlayers().filter(isLocal)) {
      const base = S.stage === 1 ? (S.k <= 3 ? 2 : 3) : 5;
      // 아직 줍지 않은 골드 구슬도 내 골드로 쳐요 (컴퓨터 반은 보상을 바로 받으니까)
      const orbGold = P.human ? (S.orbs || []).reduce((s, o) => s + o.gold, 0) : 0;
      const interest = Math.min(5, Math.floor((P.gold + orbGold) / 10));
      const st = Math.abs(P.streak), sb = st >= 6 ? 3 : st >= 5 ? 2 : st >= 3 ? 1 : 0;
      const inc = base + interest + sb + P.gpr;
      P.gold += inc;
      addXp(P, 2);
      if (!P.locked || P.shop.every((x) => x == null)) refreshShop(P);
      if (P.human) toast(`+${inc}골드 (기본 ${base}${interest ? ` · 이자 ${interest}` : ""}${sb ? ` · 연승/연패 ${sb}` : ""})`);
    }
  }
  if (S.type === "carousel") startCarousel(); else startPlan();
}
function nextRound() {
  const max = S.stage === 1 ? 4 : 7;
  if (S.k < max) S.k++; else { S.stage++; S.k = 1; }
  startRound(false);
}
function startPlan() {
  S.phase = "plan";
  S.timer = S.timerMax = S.stage === 1 ? 20 : 30;
  S.battle = null; S.sel = null; S.scout = null; S.opp = null; FLIP = false;
  const tier = AUG_ROUNDS[`${S.stage}-${S.k}`];
  for (const P of alivePlayers().filter(isLocal)) {
    mergeAll(P);
    if (tier && !P.human) { const a = rnd(augOptions(P, TIER_IX[tier])); P.augs.push(a.id); a.f(P); }
    if (!P.human) aiPlan(P);
  }
  if (tier && human().alive) showAugments(tier);
  renderUI();
}
// 손가락: 떼는 순간 한 번 실행. 뒤따라오는 클릭은 모든 버튼에서 무시해요 (한 번 탭 = 한 번 동작)
let TAP_T = 0, TAP_PENDING = false;
// 손가락 탭 뒤에는 브라우저가 클릭을 한 번 더 보내요. 그 클릭 하나는 (언제 오든) 버려요
document.addEventListener("click", (e) => { if (TAP_PENDING && performance.now() - TAP_T < 3000) { TAP_PENDING = false; e.stopPropagation(); e.preventDefault(); } }, true);
function tapButton(el, fn) {
  el.onpointerup = (e) => { if (e.pointerType === "mouse") return; TAP_T = performance.now(); TAP_PENDING = true; fn(); };
  el.onclick = () => fn();
}
function reportError(e) { try { toast("오류가 났어요: " + (e && e.message ? e.message : e)); } catch (x) {} }
window.addEventListener("error", (e) => reportError(e.error || e.message));
// 등급(ti)에 맞는 숫자를 넣은 증강 3개 (등급 전용 증강은 그 등급에서만)
function augOptions(P, ti) {
  return shuffle(AUGS.filter((a) => (ITEMS_ON || !["supplies", "complete"].includes(a.id)) && (a.id.startsWith("emb-") || !P.augs.includes(a.id)) && (!a.tiers || a.tiers.includes(ti))))
    .slice(0, 3).map((a) => { const v = a.v ? a.v[ti] : undefined; return { id: a.id, n: a.n, d: a.d(v), f: (Q) => a.f(Q, v) }; });
}
function showAugments(tier, rerolled) {
  const P = human(), opts = augOptions(P, TIER_IX[tier]);
  S.augPending = true;
  $("augre").hidden = !!rerolled;
  tapButton($("augre"), () => { if (S.augPending) showAugments(tier, true); });
  $("augtier").textContent = `${tier} 증강`;
  $("augtier").className = "augtier t-" + tier;
  $("augs").innerHTML = opts.map((a, i) => `<button class="augcard t-${tier}" data-i="${i}"><span class="augicon">${a.n[0]}</span><b>${a.n}</b><span>${a.d}</span></button>`).join("");
  const choose = (i) => {
    if (!S.augPending) return;
    const a = opts[i]; S.augPending = false; $("aug").hidden = true;
    try { P.augs.push(a.id); a.f(P); mergeAll(P); } catch (e) { reportError(e); }
    sfx("level"); toast(`증강: ${a.n}`); renderUI();
  };
  S.augChoose = () => choose(0);
  $("augs").querySelectorAll(".augcard").forEach((el) => tapButton(el, () => choose(+el.dataset.i)));
  S.augT = 20;
  $("aug").hidden = false;
}
function sideOf(P) {
  const out = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < COLS; c++) if (P.board[r][c]) out.push({ spec: P.board[r][c], lr: r, c });
  return out;
}
function pveTeam(stage, k) {
  let list;
  if (stage === 1) list = k === 2 ? ["hw", "hw"] : k === 3 ? ["hw", "hw", "hw"] : ["hw", "hw", "quiz"];
  else if (stage === 2) list = ["perf", "perf", "perf"];
  else if (stage === 3) list = ["mid", "perf", "perf"];
  else if (stage === 4) list = ["fin", "perf", "perf", "perf"];
  else list = ["mock", "fin", "fin"];
  const scale = stage >= 5 ? 1 + 0.45 * (stage - 5) : 1, cols = [3, 2, 4, 1, 5];
  return list.map((m, i) => ({ spec: { mon: { ...MON[m], hp: MON[m].hp * scale, ad: MON[m].ad * scale } }, lr: 0, c: cols[i] }));
}
function pairUp() {
  const al = alivePlayers();
  let best = null;
  for (let t = 0; t < 25; t++) {
    const sh = shuffle([...al]), pairs = []; let rep = 0;
    for (let i = 0; i + 1 < sh.length; i += 2) { pairs.push({ a: sh[i], b: sh[i + 1], ghost: false }); if (sh[i].lastOpp === sh[i + 1].i) rep++; }
    if (sh.length % 2) { const x = sh[sh.length - 1]; pairs.push({ a: x, b: rnd(al.filter((p) => p !== x)), ghost: true }); }
    if (!best || rep < best.rep) best = { pairs, rep };
    if (!rep) break;
  }
  for (const p of best.pairs) {
    if (!p.ghost && p.b.human) [p.a, p.b] = [p.b, p.a];
    if (!p.ghost) { p.a.lastOpp = p.b.i; p.b.lastOpp = p.a.i; }
  }
  return best.pairs;
}
function startCombat() { if (NET.on && S.phase === "plan") return netWait(); startCombatNow(); }
function startCombatNow() {
  if ((S.phase !== "plan" && S.phase !== "wait") || S.augPending) return;
  collectOrbs(true);
  S.sel = null; S.scout = null; drag = null;
  autoFill(human());
  S.results = [];
  if (S.type === "pve") {
    for (const P of alivePlayers().filter(isLocal)) {
      const B = makeBattle(sideOf(P), pveTeam(S.stage, S.k), P.human, P, null);
      if (P.human) S.battle = B; else runBattle(B);
      S.results.push({ kind: "pve", a: P, B });
    }
    S.opp = null;
  } else {
    for (const pr of NET.on ? netPairs() : pairUp()) {
      const isH = pr.a.human || pr.b.human;
      const B = pr.net ? netBattle(pr) : makeBattle(sideOf(pr.a), sideOf(pr.b), isH, pr.a, pr.b);
      if (isH) { S.battle = B; S.opp = pr.a.human ? pr.b : pr.a; S.oppGhost = pr.ghost; } else runBattle(B);
      S.results.push({ kind: "pvp", ...pr, B });
    }
  }
  if (!S.battle) S.battle = makeBattle(sideOf(human()), [], true, human(), null);
  S.phase = "combat";
  sfx("start");
  renderUI();
}
function loot(P, win) {
  let comps = S.stage === 1 ? (S.k === 4 ? 2 : 1) : 2;
  let gold = S.stage === 1 ? S.k - 2 : 3;
  if (!win) { comps = Math.max(1, comps - 1); gold = 0; }
  const items = ITEMS_ON ? Array.from({ length: comps }, () => rnd(COMP).id) : [];
  if (!ITEMS_ON) gold += comps * 2;
  if (!P.human) { items.forEach((id) => giveItem(P, id)); P.gold += gold; return; }
  // 사람은 경기장에 떨어진 구슬을 마스코트로 주워요
  const drops = items.map((id) => ({ items: [id], gold: 0 }));
  if (!ITEMS_ON) { while (gold > 3) { drops.push({ items: [], gold: 2 }); gold -= 2; } }
  if (gold) drops.push({ items: [], gold });
  drops.forEach((o) => S.orbs.push({ ...o, x: -5 + Math.random() * 10, z: 1.6 + Math.random() * 3.2, born: performance.now() }));
  setTimeout(() => toast("골드 구슬! 빈 땅을 탭해서 마스코트로 주우세요"), 700);
}
function collectOrbs(all) {
  if (!S.orbs || !S.orbs.length) return;
  const P = human(), keep = [];
  for (const o of S.orbs) {
    if (all || Math.hypot(o.x - TACT.x, o.z - TACT.z) < 0.9) {
      o.items.forEach((id) => giveItem(P, id)); P.gold += o.gold;
      if (!all) { sfx("item"); toast(o.gold ? `+${o.gold}골드` : `${ITEMS[o.items[0]].n} 획득!`); }
      if (typeof WFX !== "undefined") WFX.push({ w: 1, X: o.x, Y: o.z, r: 1.2, col: o.gold ? "#f5d76e" : "#7fc4ff", t: 0.5, t0: 0.5 });
    } else keep.push(o);
  }
  S.orbs = keep; renderUI();
}
function finishCombat() {
  S.phase = "result";
  let hWin = null, hDmg = 0;
  const win = (P) => { if (P.remote) return; P.streak = Math.max(1, P.streak + 1); P.gold += 1; };
  const lose = (P, d) => { if (P.remote) return; P.hp -= d; P.streak = Math.min(-1, P.streak - 1); if (P.human) hDmg = d; };
  for (const R of S.results) {
    const B = R.B;
    const surv = (team) => B.f.filter((f) => f.alive && f.team === team && !(f.mon && f.mon.summon));
    const dmgFrom = (team) => STAGE_DMG[Math.min(S.stage, 7)] + surv(team).reduce((s, f) => s + (f.star >= 3 ? 2 : 1), 0);
    if (R.kind === "pve") {
      const w = B.win === 0;
      if (!w) lose(R.a, S.stage === 1 ? surv(1).length : dmgFrom(1));
      loot(R.a, w);
      if (R.a.human) hWin = w;
    } else {
      const { a, b, ghost } = R;
      if (B.win === 0) { win(a); if (!ghost) lose(b, dmgFrom(0)); }
      else if (B.win === 1) { lose(a, dmgFrom(1)); if (!ghost) win(b); }
      else { lose(a, dmgFrom(1)); if (!ghost) lose(b, dmgFrom(0)); }
      if (a.human) hWin = B.win === 0; else if (b.human) hWin = B.win === 1;
    }
  }
  // 탈락 처리
  const dead = alivePlayers().filter((p) => p.hp <= 0).sort((x, y) => x.hp - y.hp);
  let n = alivePlayers().length;
  for (const p of dead) {
    p.place = n--; p.alive = false;
    if (!p.remote) unitsOf(p).forEach((x) => (S.pool[x.u.d] += Math.pow(3, x.u.star - 1)));
    p.shop.forEach((d) => d != null && S.pool[d]++); p.shop = [];
    if (!p.human) setTimeout(() => toast(`${p.name} 탈락! (${p.place}등)`), 900);
  }
  S.banner = hWin ? { text: "승리!", col: TOK["--accent"], t: 1.8 } : { text: hDmg ? `패배  ♥-${hDmg}` : "패배", col: TOK["--danger"], t: 1.8 };
  sfx(hWin ? "win" : "lose");
  S.resultT = 2.2;
  renderUI();
}
function afterResult() {
  const H = human();
  if (!H.alive) return gameOver(H.place);
  if (alivePlayers().length <= 1) { H.place = 1; return gameOver(1); }
  nextRound();
}
function gameOver(place) {
  S.phase = "over";
  netFinish();
  $("ovrules").hidden = true; $("ovbtns").hidden = false; $("ovtext").hidden = false;
  let best = 0; try { best = +localStorage.getItem("uri-best-place") || 0; } catch (e) {}
  if (!best || place < best) { best = place; try { localStorage.setItem("uri-best-place", String(best)); } catch (e) {} }
  $("ovtitle").textContent = place === 1 ? "1등! 우리반 최고!" : `${place}등`;
  $("ovtext").textContent = place === 1 ? "8개 반 중에서 끝까지 살아남았어요." : `${S.stage}-${S.k} 라운드에서 탈락했어요.`;
  $("ovrules").hidden = true;
  $("best").textContent = `최고 기록: ${best}등`;
  $("start").textContent = "혼자 다시 하기";
  $("ov").hidden = false;
  sfx(place <= 4 ? "win" : "lose");
}

// =============== 급식 줄 (회전 선택 라운드) ===============
function startCarousel() {
  S.phase = "carousel"; S.battle = null; S.sel = null; S.scout = null; S.opp = null; FLIP = false;
  const s = S.stage;
  const costs = s === 1 ? [1] : s === 2 ? [1, 2] : s === 3 ? [2, 3] : s === 4 ? [3, 4] : [3, 3, 4, 4, 5];
  const opts = [];
  for (let i = 0; i < 9; i++) {
    // 상점과 같은 풀에서 꺼내요 (남은 수가 많은 친구가 더 자주 나와요)
    let d = null;
    for (let tries = 0; tries < 10 && d == null; tries++) {
      const cost = rnd(costs), cands = DEFS.map((_, j) => j).filter((j) => DEFS[j].c === cost && S.pool[j] > 0);
      let r = Math.random() * cands.reduce((t, j) => t + S.pool[j], 0);
      for (const j of cands) { r -= S.pool[j]; if (r < 0) { d = j; break; } }
    }
    if (d == null) { const left = DEFS.map((_, j) => j).filter((j) => S.pool[j] > 0); if (!left.length) break; d = rnd(left); } // 원하는 코스트가 다 떨어지면 남은 친구 아무나
    S.pool[d]--;
    opts.push({ d, item: ITEMS_ON ? rnd(COMP).id : null, taken: false });
  }
  const order = shuffle(alivePlayers().filter(isLocal)).sort((a, b) => a.hp - b.hp);
  S.car = { opts, order, turn: 0, t: 0, ang: 0, wait: 1.5, humanT: 12 };
  S.timer = S.timerMax = 1;
  renderUI();
}
function stepCarousel(dt) {
  const C = S.car; C.ang += dt * 0.35; C.t += dt;
  if (C.turn >= C.order.length) {
    if (C.t > 1) { C.opts.forEach((o) => { if (!o.taken) S.pool[o.d]++; }); S.car = null; nextRound(); } // 남은 친구는 풀로
    return;
  }
  if (C.t < C.wait) return;
  const P = C.order[C.turn];
  if (P.human) {
    C.humanT -= dt; S.timer = Math.max(0, C.humanT); S.timerMax = 12;
    if (C.humanT <= 0) carouselPick(P, rnd(C.opts.filter((o) => !o.taken)));
    return;
  }
  const free = C.opts.filter((o) => !o.taken);
  free.sort((x, y) => aiUnitScore(P, y.d) - aiUnitScore(P, x.d));
  carouselPick(P, free[0]);
}
function carouselPick(P, o) {
  if (!o || o.taken) return;
  o.taken = true;
  const u = mkUnit(o.d); u.items = o.item ? [o.item] : [];
  const free = P.bench.indexOf(null), copies = unitsOf(P).filter((x) => x.u.d === o.d && x.u.star === 1).length;
  let got = true;
  if (free >= 0) P.bench[free] = u;
  else if (copies >= 2) { P.bench.push(u); merge(P, o.d, 1); P.bench.length = BENCH; } // 바로 합성돼서 자리가 생겨요
  else { got = false; P.gold += DEFS[o.d].c; S.pool[o.d]++; giveItem(P, o.item); } // 자리가 없으면 골드로 바꿔요
  S.car.turn++; S.car.t = 0; S.car.wait = 0.5;
  if (P.human) {
    sfx("buy");
    toast(!got ? `대기석이 가득 차서 ${DEFS[o.d].n} 대신 ${DEFS[o.d].c}골드를 받았어요` : o.item ? `${DEFS[o.d].n} + ${ITEMS[o.item].n} 획득!` : `${DEFS[o.d].n} 획득!`);
  }
  renderUI();
}

// =============== 컴퓨터(AI) 반 ===============
function aiUnitScore(P, d) {
  const def = DEFS[d], own = unitsOf(P).filter((x) => x.u.d === d);
  let s = own.length * 2.2 + def.t.filter((t) => P.plan.includes(t)).length * 1.5 + def.c * 0.3;
  if (own.some((x) => x.u.star === 3)) s -= 10;
  return s;
}
function unitPower(P, u) {
  const def = DEFS[u.d];
  return def.c * Math.pow(3, u.star - 1) + def.t.filter((t) => P.plan.includes(t)).length * 0.8 + u.items.length * 1.5;
}
function aiMakeRoom(P) {
  while (!P.bench.includes(null)) {
    let worst = -1, ws = 1e9;
    P.bench.forEach((u, i) => { if (!u) return; const sc = aiUnitScore(P, u.d) + u.star * 3; if (sc < ws) { ws = sc; worst = i; } });
    sell(P, { w: "n", i: worst });
  }
}
function aiPlan(P) {
  const s = S.stage, k = S.k;
  const target = s === 1 ? 3 : s === 2 ? (k >= 5 ? 5 : 4) : s === 3 ? (k >= 2 ? 6 : 5) : s === 4 ? (k >= 2 ? 8 : 7) : s === 5 ? 8 : 9;
  const floor = P.hp < 35 ? 0 : s >= 5 ? 20 : s >= 4 ? 30 : 50;
  while (P.level < target && buyXp(P));
  for (let loop = 0; loop < 25; loop++) {
    for (let i = 0; i < 5; i++) {
      const di = P.shop[i]; if (di == null || P.gold < DEFS[di].c) continue;
      const total = unitsOf(P).length, sc = aiUnitScore(P, di);
      const need = total < P.level + 1;
      const want = need || (sc >= 2.2 && (P.gold - DEFS[di].c >= floor * 0.5 || s <= 2)) || (sc >= 1.8 && P.gold - DEFS[di].c >= floor);
      if (!want) continue;
      if (!buy(P, i)) { aiMakeRoom(P); buy(P, i); }
    }
    if (s >= 3 && P.gold - 2 >= floor && P.gold >= 2) reroll(P); else break;
  }
  if (P.bench.filter(Boolean).length > 7) aiMakeRoom(P);
  aiArrange(P);
  aiTrim(P, s <= 2 ? 5 : 4);
  aiItems(P);
}
// 컴퓨터 반이 대기석에 친구를 쌓아 두면 풀이 바닥나서 다른 반(사람 포함) 상점에 친구가 안 떠요.
// 대기석은 keep 칸까지만 두고, 합성 가능성이 낮은 친구부터 팔아요.
function aiTrim(P, keep) {
  for (let guard = 0; guard < BENCH; guard++) {
    const bench = P.bench.map((u, i) => ({ u, i })).filter((x) => x.u);
    if (bench.length <= keep) return;
    const copies = (d) => unitsOf(P).filter((x) => x.u.d === d).length;
    bench.sort((a, b) => (copies(a.u.d) >= 2) - (copies(b.u.d) >= 2) || (aiUnitScore(P, a.u.d) + a.u.star * 3) - (aiUnitScore(P, b.u.d) + b.u.star * 3));
    sell(P, { w: "n", i: bench[0].i });
  }
}
function aiArrange(P) {
  const all = unitsOf(P).map((x) => x.u);
  P.board = Array.from({ length: 4 }, () => Array(COLS).fill(null));
  P.bench = Array(BENCH).fill(null);
  all.sort((a, b) => unitPower(P, b) - unitPower(P, a));
  const order = [3, 2, 4, 1, 5, 0, 6], used = [0, 0, 0, 0];
  all.slice(0, P.level).forEach((u) => {
    const rg = CLASS[DEFS[u.d].k].rg;
    const pref = rg <= 1 ? [0, 1, 2, 3] : rg === 2 ? [1, 2, 0, 3] : [3, 2, 1, 0];
    for (const r of pref) if (used[r] < COLS) { P.board[r][order[used[r]++]] = u; break; }
  });
  all.slice(P.level).forEach((u, i) => { if (i < BENCH) P.bench[i] = u; });
}
function aiItems(P) {
  const board = unitsOf(P).filter((x) => x.w === "b").sort((a, b) => unitPower(P, b.u) - unitPower(P, a.u));
  if (!board.length) return;
  for (let ii = P.items.length - 1; ii >= 0; ii--) {
    const id = P.items[ii];
    const top = board.slice(0, 3);
    const t = (ITEMS[id].comp && top.find((x) => x.u.items.some((z) => ITEMS[z].comp))) || board.find((x) => canAdd(x.u, id));
    if (t) equip(P, ii, t);
  }
}
