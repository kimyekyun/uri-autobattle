// ============================================================
//  ui.js — 터치 입력 · 화면 버튼 · 정보창 · 설정 메뉴 · 시작
// ============================================================
"use strict";
// =============== 입력 ===============
const _ndc = HAS3D ? new THREE.Vector2() : null, _hit = HAS3D ? new THREE.Vector3() : null;
function groundAt(x, y) {
  _ndc.set((x / W) * 2 - 1, -(y / H3) * 2 + 1);
  raycaster.setFromCamera(_ndc, camera);
  return raycaster.ray.intersectPlane(pickPlane, _hit) ? _hit.clone() : null;
}
let LAST_R = [];
function unitAtScreen(x, y) {
  // 친구 몸(발~머리)을 화면에 비춰서, 손가락에서 가장 가까운 친구를 골라요
  let best = null, bd = Math.max(26, Math.min(W, H) * 0.045);
  for (const it of LAST_R) {
    if (!it.hit || !it.g) continue;
    const sc = it.g.scale.x;
    const [fx, fy] = proj(it.x, 0.2, it.z), [hx, hy] = proj(it.x, 1.6 * sc, it.z);
    const t = Math.max(0, Math.min(1, ((x - fx) * (hx - fx) + (y - fy) * (hy - fy)) / (((hx - fx) ** 2 + (hy - fy) ** 2) || 1)));
    const d = Math.hypot(x - (fx + (hx - fx) * t), y - (fy + (hy - fy) * t));
    if (d < bd) { bd = d; best = it.hit; }
  }
  return best;
}
function hitTest(x, y) {
  if (ITEMS_ON) for (let i = 0; i < ITEM_MAX; i++) { const [ix, iy] = itemRect(i); if (x >= ix && x < ix + IT.s && y >= iy && y < iy + IT.s) return { g: "item", i }; }
  const p = groundAt(x, y);
  const u = unitAtScreen(x, y);
  if (u) return { ...u, p };
  if (!p) return null;
  if (Math.abs(p.z - BENCH_Z) < 0.9 && p.x > BENCH_X0 && p.x < -BENCH_X0) return { g: "bench", i: Math.min(BENCH - 1, Math.floor((p.x - BENCH_X0) / SLOT_W)), p };
  let best = null, bd = 1e9;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const d = Math.hypot(p.x - worldX(gridX(r, c)), p.z - worldZ(r));
    if (d < bd) { bd = d; best = { g: "board", r, c, p }; }
  }
  return bd < 1.05 ? best : { g: "ground", p };
}
function toLoc(h) {
  if (!h) return null;
  if (h.g === "ground") return null;
  if (h.g === "board") return h.r >= 4 ? { w: "b", r: h.r - 4, c: h.c } : null;
  return h.g === "bench" ? { w: "n", i: h.i } : { w: "i", i: h.i };
}
const objAt = (l) => (!l ? null : l.w === "i" ? human().items[l.i] || null : getAt(human(), l));
function canvasPos(e) { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }
const shopOpen = () => ["plan", "combat", "result"].includes(S.phase);
cv.addEventListener("pointerdown", (e) => {
  TAP_PENDING = false;
  if (!S || S.phase === "over" || S.phase === "carousel") return;
  const [x, y] = canvasPos(e), loc = toLoc(hitTest(x, y));
  drag = { loc, obj: objAt(loc), sx: x, sy: y, x, y, moved: false, wp: null };
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const [x, y] = canvasPos(e); drag.x = x; drag.y = y;
  const wp = groundAt(x, y); if (wp) drag.wp = wp;
  if (drag.obj && Math.hypot(x - drag.sx, y - drag.sy) > (e.pointerType === "mouse" ? 8 : 18)) drag.moved = true;
  const over = drag.moved && drag.loc && drag.loc.w !== "i" && overShop(e);
  $("shop").classList.toggle("selling", !!over);
  if (over) $("shop").dataset.sell = `판매 +${sellValue(drag.obj)}골드`;
});
cv.addEventListener("pointerup", (e) => {
  const [x, y] = canvasPos(e);
  if (S && S.phase === "carousel") return carouselTap(x, y);
  if (!drag) return;
  const h = hitTest(x, y), loc = toLoc(h), d = drag; drag = null;
  $("shop").classList.remove("selling");
  if (d.moved && d.loc && d.loc.w !== "i" && overShop(e)) {
    if (d.loc.w === "b" && S.phase !== "plan") { toast("전투 중에는 보드 위 친구를 팔 수 없어요"); return; }
    if (!shopOpen()) return;
    sell(human(), d.loc); S.sel = null; sfx("sell"); renderUI(); return;
  }
  if (d.moved) {
    if (d.loc.w === "i") { if (loc && loc.w !== "i") humanEquip(d.loc.i, loc); }
    else if (loc && loc.w !== "i") humanMove(d.loc, loc);
    renderUI(); return;
  }
  tap(h, loc);
});
cv.addEventListener("pointercancel", () => { drag = null; });
function overShop(e) { const r = $("shop").getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom + 20; }
function carouselTap(x, y) {
  const C = S.car; if (!C) return;
  const cur = C.order[C.turn];
  if (!cur || !cur.human || C.t < C.wait) return toast("아직 내 차례가 아니에요");
  let best = null, bd = Math.max(30, W * 0.08);
  for (const o of C.opts) if (!o.taken && o.sx != null) { const d = Math.hypot(x - o.sx, y - o.sy); if (d < bd) { bd = d; best = o; } }
  if (best) carouselPick(cur, best);
}
function tap(h, loc) {
  const P = human();
  if (!loc) {
    const hadSel = S.sel; S.sel = null; renderUI();
    let shown = false;
    if (h && h.g === "board") {
      if (S.battle && S.phase !== "plan") { const f = S.battle.f.find((u) => u.alive && u.r === h.r && u.c === h.c); if (f) { showFighter(f); shown = true; } }
      else if (S.scout != null) { const u = S.players[S.scout].board[3 - h.r][COLS - 1 - h.c]; if (u) { showUnit(u, true); shown = true; } }
    }
    if (!shown && !hadSel && h && h.p) moveTactician(h.p);
    return;
  }
  if (S.battle && S.phase !== "plan" && loc.w === "b") {
    const f = S.battle.f.find((u) => u.alive && u.r === h.r && u.c === h.c); S.sel = null; renderUI(); if (f) showFighter(f); return;
  }
  const obj = objAt(loc);
  if (S.sel) {
    if (sameLoc(S.sel, loc)) { S.sel = null; return renderUI(); }
    if (S.sel.w === "i") {
      if (loc.w !== "i" && obj) { humanEquip(S.sel.i, loc); return; }
      S.sel = obj ? loc : null; return renderUI();
    }
    if (loc.w === "i") { S.sel = obj ? loc : null; return renderUI(); }
    if (getAt(P, S.sel)) { humanMove(S.sel, loc); return; }
  }
  if (!obj && loc.w === "b" && h && h.p) moveTactician(h.p);
  S.sel = obj ? loc : null; renderUI();
}
function humanMove(from, to) {
  const P = human();
  if (sameLoc(from, to)) return;
  if ((from.w === "b" || to.w === "b") && S.phase !== "plan") { toast("전투 중에는 보드를 바꿀 수 없어요"); return; }
  const a = getAt(P, from), b = getAt(P, to); if (!a) return;
  if (to.w === "b" && from.w === "n" && !b && boardCount(P) >= P.level) { toast(`레벨 ${P.level}: 최대 ${P.level}명까지 배치해요`); return; }
  setAt(P, to, a); setAt(P, from, b);
  sfx("place"); S.sel = null; renderUI();
}
function humanEquip(ii, loc) {
  const P = human();
  if (loc.w === "b" && S.phase !== "plan") { toast("전투 중에는 보드 위 친구에게 줄 수 없어요"); return; }
  const u = getAt(P, loc); if (!u) return;
  const id = P.items[ii], before = u.items.slice();
  if (!equip(P, ii, loc)) { toast("아이템은 한 친구에게 3개까지예요"); return; }
  sfx("item");
  const made = u.items.find((x, i) => !ITEMS[x].comp && before[i] !== x);
  if (ITEMS[id].comp && made) toast(`조합 완성! ${ITEMS[made].n}`);
  S.sel = null; renderUI();
}

// =============== 화면 UI ===============
let toastTimer;
function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 1800);
}
function skillText(def, star) {
  const cf = 1 + (def.c - 1) * 0.22, P = cf * STARM[star] * tuneOf(def).sk * legendOf(def, star).sk;
  if (SK[def.n]) return SK[def.n].d(P);
  return {
    "수호자": `자신에게 보호막 ${Math.round(260 * P)}`,
    "돌격대": `대상에게 공격력×2 + ${Math.round(130 * P)} 피해`,
    "저격수": `대상에게 공격력×1.6 + ${Math.round(160 * P)} 저격`,
    "천재": `대상과 주변 적 모두에게 ${Math.round(170 * P)} 피해`,
    "응원단": `체력이 가장 낮은 아군 ${Math.round(230 * P)} 회복`,
    "신": `적 전체 ${Math.round(150 * P)} 피해, 아군 전체 ${Math.round(110 * P)} 회복`,
  }[def.k];
}
const itemTag = (id) => `<span class="it" style="background:${ITEMS[id].comp ? ITEMS[id].col : "var(--c5)"}">${ITEMS[id].n}</span>`;
function showUnit(u, foe) {
  const def = DEFS[u.d], cl = CLASS[def.k], cf = 1 + (def.c - 1) * 0.22, sm = STARM[u.star];
  const its = u.items.length ? "<br>" + u.items.map((id) => `${itemTag(id)} ${ITEMS[id].d}`).join("<br>") : "";
  $("info").innerHTML = `<div class="txt"><b style="color:var(${COST_COLOR[def.c]})">${def.n}</b> ${"★".repeat(u.star)} · ${def.c}코스트 · ${def.t.join(", ")}${foe ? " · <span style='color:var(--danger)'>상대</span>" : ""}<br>
    ${def.c === 5 && u.star >= 3 ? "<b style='color:var(--c5)'>전설!</b> " : ""}체력 ${Math.round(cl.hp * cf * sm * tuneOf(def).hp * legendOf(def, u.star).hp)} · 공격 ${Math.round(cl.ad * cf * sm * tuneOf(def).ad * legendOf(def, u.star).ad)} · 사거리 ${cl.rg}칸<br>스킬 <b>${SK[def.n] ? SK[def.n].s : cl.sk}</b>: ${skillText(def, u.star)}<br>무기 <b>${WEAPONS[def.n] ? WEAPONS[def.n].n : "없음"}</b>${its}</div>`;
  const P = human();
  const sellable = !foe && S.sel && S.sel.w !== "i" && (S.sel.w === "n" ? shopOpen() : S.phase === "plan");
  if (sellable) {
    const b = document.createElement("button"); b.className = "sell";
    b.textContent = `판매 +${sellValue(u)}`;
    b.onclick = () => { sell(P, S.sel); S.sel = null; sfx("sell"); renderUI(); };
    $("info").appendChild(b);
  }
  if (!foe) {
    // 카드 사진 바꾸기: 게임을 고칠 수 있는 사람이 올리면 모두에게, 아니면 내 기기에만 (photos.js)
    const row = document.createElement("div"); row.className = "cardrow";
    const pick = document.createElement("button"); pick.className = "sell cardpick"; pick.textContent = "카드 사진 바꾸기";
    pick.onclick = () => { CARD_TARGET = u.d; $("cardfile").click(); };
    row.appendChild(pick);
    if (hasCustomCard(u.d) || (canShare() && sharedCard(u.d))) {
      const back = document.createElement("button"); back.className = "sell cardpick"; back.textContent = "원래 사진으로";
      back.onclick = () => {
        if (!hasCustomCard(u.d)) return unshareCardPhoto(u.d);
        try { localStorage.removeItem("uri-card-" + DEFS[u.d].n); } catch (e) {}
        PORTRAIT[u.d] = sharedCard(u.d) ? blobUrl(sharedCard(u.d)) : BASE_PORTRAIT[u.d]; toast("원래 카드 사진으로 돌아왔어요"); renderUI();
      };
      row.appendChild(back);
    }
    $("info").appendChild(row);
  }
}
let CARD_TARGET = null;
const BASE_PORTRAIT = {};
function hasCustomCard(d) { try { return !!localStorage.getItem("uri-card-" + DEFS[d].n); } catch (e) { return false; } }
function loadCustomCards() {
  DEFS.forEach((def, d) => {
    BASE_PORTRAIT[d] = PORTRAIT[d];
    let url = null; try { url = localStorage.getItem("uri-card-" + def.n); } catch (e) {}
    if (url) PORTRAIT[d] = url;
  });
}
function pickCardPhoto(file) {
  const d = CARD_TARGET; if (file == null || d == null) return;
  const r = new FileReader();
  r.onload = () => {
    const img = new Image();
    img.onload = () => {
      // 카드 비율(4:5)에 맞게 가운데를 잘라요
      const c = document.createElement("canvas"); c.width = 360; c.height = 450; const g = c.getContext("2d");
      const k = Math.max(c.width / img.width, c.height / img.height), w = img.width * k, h = img.height * k;
      g.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
      if (canShare()) { shareCardPhoto(d, c); return; } // 모두에게 보이게
      const url = c.toDataURL("image/jpeg", 0.85);
      try { localStorage.setItem("uri-card-" + DEFS[d].n, url); } catch (e) { toast("저장 공간이 부족해서 이번 판에만 바뀌어요"); }
      PORTRAIT[d] = url; toast(`${DEFS[d].n} 카드 사진을 바꿨어요`); renderUI(); if (!$("cards").hidden) openCardMenu();
    };
    img.src = r.result;
  };
  r.readAsDataURL(file);
}
function showItem(id) {
  const it = ITEMS[id];
  let html = `<div class="txt">${itemTag(id)} ${it.d}`;
  if (it.comp) html += `<br><span class="guide">조합: ${COMP.map((c) => `+${c.n} → ${ITEMS[comboKey(id, c.id)].n}`).join(" · ")}</span>`;
  else html += `<br><span class="guide">재료: ${it.parts.map((p) => ITEMS[p].n).join(" + ")}</span>`;
  $("info").innerHTML = html + `<br><span class="guide">친구를 탭하면 장착돼요</span></div>`;
}
function updateMeter() {
  if (!S.battle || S.sel || (S.infoHold || 0) > performance.now() || !["combat", "result"].includes(S.phase)) return;
  const list = S.battle.f.filter((f) => f.team === 0 && !f.mon && !f.merged).sort((a, b) => (b.dmg || 0) - (a.dmg || 0)).slice(0, 6);
  if (!list.length) return;
  const mx = Math.max(1, ...list.map((f) => f.dmg || 0));
  $("info").innerHTML = `<div class="txt"><b>피해량</b>${list.map((f) => `<div class="dm"><span>${f.robot ? (f.mega ? "초합체로봇" : "합체로봇") : short(DEFS[f.d].n)}${"★".repeat(f.star)}</span><i style="width:${((f.dmg || 0) / mx) * 100}%"></i><em>${Math.round(f.dmg || 0)}</em></div>`).join("")}</div>`;
}
function showFighter(f) {
  S.infoHold = performance.now() + 3000;
  if (f.mon) { $("info").innerHTML = `<div class="txt"><b>${f.mon.summon ? (f.mon.giant ? "거대 이다연" : "이다연") : f.mon.mn}</b> ${f.mon.summon ? "소환수 (김예균이 불러냄)" : "몬스터"} · 체력 ${Math.round(f.hp)}/${Math.round(f.maxHp)} · 공격 ${Math.round(f.ad)}</div>`; return; }
  const def = DEFS[f.d];
  $("info").innerHTML = `<div class="txt"><b style="color:var(${COST_COLOR[def.c]})">${f.robot ? (f.mega ? "초합체로봇 (모두 ★3)" : ROBOT_NAME) : def.n}</b> ${"★".repeat(f.star)} ${f.team ? "<span style='color:var(--danger)'>상대</span>" : ""}<br>
    체력 ${Math.round(f.hp)}/${Math.round(f.maxHp)} · 공격 ${Math.round(f.ad)} · 공속 ${speedOf(f).toFixed(2)} · 마나 ${Math.round(f.mana)}/${f.mm}${!f.robot && WEAPONS[def.n] ? "<br>무기 " + WEAPONS[def.n].n : ""}${f.items.length ? "<br>" + f.items.map(itemTag).join(" ") : ""}</div>`;
}
function updateTimer() {
  let frac = 1;
  if (S.phase === "plan" || (S.phase === "carousel" && S.car && S.car.order[S.car.turn]?.human)) frac = Math.max(0, S.timer / S.timerMax);
  else if (S.phase === "combat" && S.battle) frac = Math.max(0, 1 - S.battle.t / 30);
  $("timerfill").style.width = (frac * 100).toFixed(1) + "%";
}
function renderUI() {
  const P = human();
  $("stage").textContent = `${S.stage}-${S.k}`;
  $("rtype").textContent = TYPE_LABEL[S.type] + (S.opp && S.phase !== "plan" ? ` · 상대 ${S.opp.name}${S.oppGhost ? "(복제)" : ""}` : S.scout != null ? ` · 정찰 ${S.players[S.scout].name}` : ""); $("rtype").className = "rtype " + S.type;
  $("hp").textContent = `♥ ${Math.max(0, P.hp)}`;
  $("gold").textContent = P.gold;
  const intr = Math.min(5, Math.floor(P.gold / 10)), st = P.streak;
  $("goldsub").innerHTML = `이자 ${[0, 1, 2, 3, 4].map((i) => `<i class="${i < intr ? "on" : ""}"></i>`).join("")}${Math.abs(st) >= 2 ? `<span class="stk ${st > 0 ? "win" : "lose"}">${Math.abs(st)}${st > 0 ? "연승" : "연패"}</span>` : ""}`;
  const maxK = S.stage === 1 ? 4 : 7;
  $("track").innerHTML = Array.from({ length: maxK }, (_, i) => `<i class="${roundType(S.stage, i + 1)}${i + 1 < S.k ? " done" : i + 1 === S.k ? " cur" : ""}" title="${S.stage}-${i + 1} ${TYPE_LABEL[roundType(S.stage, i + 1)]}"></i>`).join("");
  const need = XPNEED[P.level];
  $("lvl").textContent = P.level;
  $("xpwrap").style.setProperty("--p", need ? `${(P.xp / need) * 100}%` : "100%");
  $("xptxt").textContent = need ? `${P.xp}/${need} · 배치 ${boardCount(P)}/${P.level}` : `MAX · 배치 ${boardCount(P)}/${P.level}`;
  // 플레이어 목록
  const AVC = ["#c08a2a", "#3a6ea8", "#a83a4a", "#3a8a5a", "#7a4aa8", "#a8703a", "#2a8a8a", "#6a6a7a"];
  const list = S.players.slice().sort((a, b) => (b.alive - a.alive) || (b.hp - a.hp) || (a.place - b.place));
  $("players").innerHTML = list.map((p) => `<button class="pl${p.human ? " me" : ""}${p.remote ? " net" : ""}${p.alive ? "" : " dead"}${S.scout === p.i ? " scout" : ""}${S.opp === p ? " opp" : ""}" data-i="${p.i}" title="${esc(p.name)}">
    ${p.remote ? `<span class="nm">${esc(p.name)}</span>` : ""}<span class="av" style="--avc:${AVC[p.i]}">${p.human ? "나" : p.remote ? esc(p.name.slice(0, 2)) : p.name}</span><span class="hpn">${p.alive ? Math.max(0, p.hp) : p.place + "등"}</span></button>`).join("");
  $("players").querySelectorAll(".pl").forEach((el) => tapButton(el, () => {
    const i = +el.dataset.i;
    if (S.phase !== "plan" || i === 0 || !S.players[i].alive) return toast(i === 0 ? "내 반이에요" : "계획 단계에서만 정찰할 수 있어요");
    S.scout = S.scout === i ? null : i; renderUI();
  }));
  // 시너지
  const cnt = teamCounts(unitsOf(P).filter((x) => x.w === "b").map((x) => ({ spec: x.u })), P);
  const keys = Object.keys(cnt).sort((a, b) => traitLvl(b, cnt[b]) - traitLvl(a, cnt[a]) || cnt[b] - cnt[a]);
  $("traits").innerHTML = keys.length
    ? keys.map((k) => {
        const on = traitLvl(k, cnt[k]) > 0, th = TRAITS[k].t, next = th.find((x) => x > cnt[k]) ?? th.at(-1);
        const lv = traitLvl(k, cnt[k]), tier = lv === 0 ? "" : lv >= th.length && th.length > 1 ? " l3" : lv >= 2 ? " l2" : " l1";
        return `<button class="trait${tier}" data-t="${k}"><span class="hx">${cnt[k]}</span><span><b>${k}</b>${cnt[k]} / ${next}</span></button>`;
      }).join("")
    : "";
  $("traits").querySelectorAll("[data-t]").forEach((el) => tapButton(el, () => {
    const t = el.dataset.t;
    $("info").innerHTML = `<div class="txt"><b>${t}</b> (${TRAITS[t].t.join(" / ")})<br>${TRAITS[t].d}<br><span class="guide">${DEFS.filter((d) => d.t.includes(t)).map((d) => d.n).join(", ")}</span></div>`;
  }));
  // 상점
  const ownCount = {};
  unitsOf(P).forEach((x) => { if (x.u.star === 1) ownCount[x.u.d] = (ownCount[x.u.d] || 0) + 1; else ownCount[x.u.d] = ownCount[x.u.d] || 0.5; });
  $("shop").innerHTML = (P.shop.length ? P.shop : [null, null, null, null, null]).map((di, i) => {
    if (di == null) return `<div class="card empty"></div>`;
    const d = DEFS[di], oc = ownCount[di];
    return `<div class="card${oc ? (oc >= 2 ? " own two" : " own") : ""}${P.gold < d.c ? " poor" : ""}" data-i="${i}" style="--cc:var(${COST_COLOR[d.c]});${PORTRAIT[di] ? `background-image:url(${PORTRAIT[di]})` : ""}" role="button" tabindex="0">
      <span class="tr">${d.t.map((t) => `<span>${t}</span>`).join("")}</span><div class="bar"><span>${d.n}</span><span class="cost">● ${d.c}</span></div></div>`;
  }).join("");
  $("shop").querySelectorAll(".card[data-i]").forEach((el) => {
    const go = () => humanBuy(+el.dataset.i);
    tapButton(el, go);
    el.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
  });
  $("odds").innerHTML = ODDS[P.level].map((p, i) => `<span><i style="background:var(--c${i + 1})"></i>${p}%</span>`).join("");
  const open = shopOpen();
  $("reroll").disabled = !open; $("buyxp").disabled = !open || P.level >= 10;
  $("lock").classList.toggle("on", P.locked); $("lock").setAttribute("aria-pressed", P.locked ? "true" : "false"); $("lock").title = P.locked ? "상점 잠김 (탭해서 풀기)" : "상점 잠그기";
  $("ready").disabled = S.phase !== "plan";
  $("speed").textContent = `속도 ×${S.speed}`;
  $("mute").textContent = muted ? "소리 꺼짐" : "소리 켜짐";
  $("qual").textContent = HQ ? "화질 높음" : "화질 보통";
  // 정보창
  if (S.sel) {
    if (S.sel.w === "i" && P.items[S.sel.i]) return showItem(P.items[S.sel.i]);
    const u = S.sel.w !== "i" ? getAt(P, S.sel) : null;
    if (u) return showUnit(u, false);
    S.sel = null;
  }
  let guide;
  if (S.phase === "carousel") guide = "급식 줄: 체력이 낮은 반부터 하나씩 골라요. 내 차례가 오면 돌아가는 친구를 탭하세요. 친구는 아이템을 들고 있어요.";
  else if (S.phase === "plan") {
    const act = keys.filter((k) => traitLvl(k, cnt[k]) > 0).map((k) => TRAITS[k].d);
    guide = act.length ? "적용 중: " + act.join(" · ") : S.type === "pve" ? "몬스터 라운드! 이기면 골드 구슬이 떨어져요. 친구를 탭해서 고르고 놓을 칸을 탭하세요." : "다른 반 이름을 누르면 그 반 배치를 정찰할 수 있어요. 시간이 끝나면 자동으로 전투가 시작돼요.";
  } else if (S.phase === "wait") guide = "준비 완료! 다른 반이 준비를 마치면 전투가 시작돼요.";
  else guide = "전투 중… 친구를 탭하면 실시간 상태를 볼 수 있어요. 대기석 정리와 상점 구매는 지금도 할 수 있어요.";
  $("info").innerHTML = S.stage === 1 || S.phase === "carousel" ? `<div class="txt guide">${guide}</div>` : "";
}
function humanBuy(i) {
  const P = human();
  if (!shopOpen()) return;
  const di = P.shop[i]; if (di == null) return;
  if (P.gold < DEFS[di].c) return toast("골드가 부족해요");
  if (!buy(P, i)) return toast(S.phase === "plan" ? "대기석이 가득 찼어요" : "대기석이 가득 찼어요 (합성은 전투 후에)");
  sfx("buy"); renderUI();
}
tapButton($("reroll"), () => { const P = human(); if (!shopOpen()) return; if (!reroll(P)) return toast("골드가 부족해요"); sfx("buy"); renderUI(); });
tapButton($("buyxp"), () => { const P = human(); if (!shopOpen()) return; if (!buyXp(P)) return toast("골드가 부족해요"); sfx("place"); renderUI(); });
tapButton($("lock"), () => { const P = human(); P.locked = !P.locked; sfx("place"); toast(P.locked ? "상점 잠금: 다음 라운드에도 이 상점이 유지돼요" : "상점 잠금 해제"); renderUI(); });
tapButton($("ready"), () => startCombat());
$("bgfile").onchange = (e) => { pickBackdrop(e.target.files && e.target.files[0]); e.target.value = ""; $("menu").hidden = true; };
$("bgclear").onclick = () => {
  $("menu").hidden = true;
  let local = null; try { local = localStorage.getItem("uri-backdrop"); localStorage.removeItem("uri-backdrop"); } catch (e) {}
  if (!local && canShare() && SHARED.backdrop) return unshareBackdrop();
  applyBackdrop(null); toast("원래 배경으로 돌아왔어요");
  SHARED.shownBackdrop = undefined; if (SHARED.backdrop) applySharedPhotos(); // 공용 배경이 있으면 다시 보여요
};
$("gear").onclick = (e) => { e.stopPropagation(); const m = $("menu"); m.hidden = !m.hidden; $("gear").setAttribute("aria-expanded", String(!m.hidden)); };
document.addEventListener("pointerdown", (e) => { if (!e.target.closest || !e.target.closest(".mini")) { $("menu").hidden = true; $("gear").setAttribute("aria-expanded", "false"); } });
$("qual").onclick = () => { HQ = !HQ; try { localStorage.setItem("uri-hq", HQ ? "1" : "0"); } catch (e) {} resize(); renderUI(); toast(HQ ? "화질 높음: 빛 번짐·고해상도" : "화질 보통: 더 부드럽게 움직여요"); };
document.addEventListener("keydown", (e) => {
  if (!S || !$("ov").hidden || e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === "d") $("reroll").click();
  else if (k === "f") $("buyxp").click();
  else if (k === "e" && S.sel && S.sel.w !== "i" && getAt(human(), S.sel) && (S.sel.w === "n" ? shopOpen() : S.phase === "plan")) { sell(human(), S.sel); S.sel = null; sfx("sell"); renderUI(); }
  else if (k === " " && S.phase === "plan") { e.preventDefault(); startCombat(); }
});
$("speed").onclick = () => { S.speed = S.speed === 1 ? 2 : S.speed === 2 ? 3 : 1; renderUI(); };
$("mute").onclick = () => { muted = !muted; try { localStorage.setItem("uri-mute", muted ? "1" : "0"); } catch (e) {} renderUI(); };
$("start").onclick = () => {
  if (NET.joined) netLeave();
  NET.on = false; NET.done = true;
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  $("ov").hidden = true; newGame(); resize();
};
try { const b = +localStorage.getItem("uri-best-place") || 0; if (b) $("best").textContent = `최고 기록: ${b}등`; } catch (e) {}
window.addEventListener("resize", () => { resize(); });
$("rotok").onclick = () => { $("rotate").classList.add("dismissed"); resize(); };
if (HAS3D) { init3D(); makePortraits(); }
else $("info").innerHTML = `<div class="txt">3D 그래픽을 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.</div>`;
loadCustomCards();
photosInit();
// 친구와 같이 하기
$("online").onclick = () => { if (NET.ready) { netShowPanel(true); if (!$("netname").value) $("netname").focus(); } };
$("netjoin").onclick = netJoin;
$("netstart").onclick = netStartAsHost;
$("netback").onclick = netLeave;
for (const id of ["netname", "netcode"]) $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") netJoin(); });
netInit();
function openCardMenu() {
  $("menu").hidden = true;
  $("cardgrid").innerHTML = DEFS.map((d, i) => `<button data-d="${i}" style="--cc:var(${COST_COLOR[d.c]})"><img src="${PORTRAIT[i] || ""}" alt="">${d.n}${hasCustomCard(i) ? "<small>내 기기 사진</small>" : sharedCard(i) ? "<small>공유 사진</small>" : ""}</button>`).join("");
  $("cardgrid").querySelectorAll("button").forEach((el) => tapButton(el, () => { CARD_TARGET = +el.dataset.d; $("cardfile").click(); }));
  $("cards").hidden = false;
}
$("cardmenu").onclick = openCardMenu;
tapButton($("cardsclose"), () => { $("cards").hidden = true; });
$("cardfile").onchange = (e) => { pickCardPhoto(e.target.files && e.target.files[0]); e.target.value = ""; };
if (document.fonts) document.fonts.ready.then(() => { readTokens(); resize(); if (HAS3D) { if (chalk) repaint(chalk); Object.values(PAPER).forEach(repaint); } });
newGame();
resize();
requestAnimationFrame(loop);
