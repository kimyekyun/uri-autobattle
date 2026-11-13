// ============================================================
//  photos.js — 올린 사진(친구 카드 · 배경)을 다른 계정에서도 보이게
//  · 게임 페이지(claude.ai 아티팩트)를 고칠 수 있는 사람이 사진을 올리면
//    사진 파일은 페이지의 공용 저장소(assets)에, 어느 친구 사진인지는 공용 데이터(db)의
//    "photos/shared" 문서에 적어요. 그러면 링크를 연 다른 사람에게도 같은 사진이 보여요.
//  · 고칠 수 없는 사람(친구들)은 예전처럼 자기 기기에만 저장돼요. 자기 기기 사진이 있으면 그게 먼저 보여요.
//  · index.html 을 그냥 열면(claude.ai 밖) 공용 기능은 꺼지고 예전처럼 동작해요.
// ============================================================
"use strict";
const SHARED = { db: null, assets: null, ref: null, cards: {}, backdrop: null, shownBackdrop: null };
const blobUrl = (id) => "/_blob/" + id;
// 이 사람이 올리면 모두에게 보이나요? (페이지를 고칠 수 있는 사람만)
const canShare = () => !!(SHARED.assets && SHARED.ref);
// 페이지에 미리 넣어 둔 친구 카드 사진 (공용 저장소 assets 의 id). 게임에서 따로 올린 사진이 있으면 그게 먼저예요
const BUILTIN_CARDS = {
  "진성욱": "264e6bd68a2c650b492c1dc6323e184d", "이현": "c084b0de9c9b195fee549e8f97d9ea18", "박희찬": "6aee6c7bd14f060b99cc998ca9189a6d", "이보경": "563237f2f1a3547d18a32898c1374476",
  "최효민": "f09797c0e85c00dbe8e414d9760a7d35", "임시온": "a36ad8d9c7b6ba8c8c3bc27873c13506", "이준희": "5222d38967af0784aef52d443ef0df91", "김현우": "3bff9474594a6588873ad9bfe078e3de",
  "전하율": "3bf362f3a07f7dbe065481282e4c0d9c", "박준서": "4149220f3f8d1008942372463b05ec31", "손태민": "9095b56b47d55663c996ac30108f7e12", "윤동욱": "7d50b9e62657f7d2e5b0873b190bfc11",
};
// 이 친구들은 미리 넣어 둔 사진이 게임에서 예전에 올린 공용 사진보다 먼저예요 (본인 요청)
const BUILTIN_FIRST = new Set(["윤동욱"]);
const sharedCard = (d) => { const n = DEFS[d].n, b = window.claude ? BUILTIN_CARDS[n] : null; return (BUILTIN_FIRST.has(n) && b) || SHARED.cards[n] || b || null; };

function photosInit() {
  if (window.claude) DEFS.forEach((def, d) => { const id = BUILTIN_CARDS[def.n]; if (id && !hasCustomCard(d)) PORTRAIT[d] = blobUrl(id); }); // 미리 넣어 둔 사진부터 보여요
  if (!window.claude || !window.claude.use) return;
  Promise.all([window.claude.use("db"), window.claude.use("assets")]).then(([db, assets]) => {
    if (!db) return;
    SHARED.db = db; SHARED.assets = assets;
    SHARED.ref = db.doc("photos/shared");
    SHARED.ref.onSnapshot((snap) => {
      const d = (snap.exists && snap.data()) || {};
      SHARED.cards = d.cards && typeof d.cards === "object" ? { ...d.cards } : {};
      SHARED.backdrop = typeof d.backdrop === "string" ? d.backdrop : null;
      applySharedPhotos();
    }, () => {});
    if (canShare()) $("cardguide").textContent = "바꿀 친구를 고르면 사진첩이 열려요. 올린 사진은 이 게임을 여는 모두에게 보여요.";
  }).catch(() => {});
}
// 공용 사진을 화면에 반영해요 (내 기기에 따로 넣은 사진이 있으면 그게 먼저)
function applySharedPhotos() {
  DEFS.forEach((def, d) => {
    if (hasCustomCard(d)) return;
    const id = sharedCard(d);
    PORTRAIT[d] = id && /^[0-9a-f]{32}$/.test(id) ? blobUrl(id) : BASE_PORTRAIT[d];
  });
  let local = null; try { local = localStorage.getItem("uri-backdrop"); } catch (e) {}
  const id = SHARED.backdrop && /^[0-9a-f]{32}$/.test(SHARED.backdrop) ? SHARED.backdrop : null;
  if (!local && id !== SHARED.shownBackdrop) {
    SHARED.shownBackdrop = id;
    if (!id) applyBackdrop(null);
    else { const img = new Image(); img.onload = () => { if (SHARED.shownBackdrop === id) applyBackdrop(img); }; img.src = blobUrl(id); }
  }
  if (S) renderUI();
  if (!$("cards").hidden) openCardMenu();
}
const toBlob = (canvas, q = 0.85) => new Promise((res) => canvas.toBlob(res, "image/jpeg", q));
// 문서 한 칸만 바꿔서 저장 (없으면 새로 만들어요)
async function saveShared(patch) {
  const snap = await SHARED.ref.get();
  const cur = (snap.exists && snap.data()) || {};
  const next = { cards: { ...(cur.cards || {}) }, backdrop: cur.backdrop || null };
  if (patch.cards) for (const [k, v] of Object.entries(patch.cards)) { if (v) next.cards[k] = v; else delete next.cards[k]; }
  if ("backdrop" in patch) next.backdrop = patch.backdrop;
  await SHARED.ref.set(next);
}
const shareFail = (e) => toast(e && e.code === "too_large" ? "사진이 너무 커요" : e && e.code === "quota_or_state" ? "저장 공간이 가득 찼어요" : "공유하지 못했어요. 잠시 뒤 다시 해 주세요");
// 카드 사진 올리기: 모두에게 보이게 (성공하면 true)
async function shareCardPhoto(d, canvas) {
  if (!canShare()) return false;
  const name = DEFS[d].n, old = SHARED.cards[name];
  try {
    const blob = await toBlob(canvas);
    const up = await SHARED.assets.upload(blob, { type: "image/jpeg" });
    await saveShared({ cards: { [name]: up.id } });
    try { localStorage.removeItem("uri-card-" + name); } catch (e) {}
    if (old && old !== up.id) SHARED.assets.delete(old).catch(() => {});
    SHARED.cards[name] = up.id; PORTRAIT[d] = up.url;
    toast(`${name} 카드 사진을 모두에게 보이게 올렸어요`); renderUI(); if (!$("cards").hidden) openCardMenu();
  } catch (e) { shareFail(e); }
  return true;
}
async function unshareCardPhoto(d) {
  const name = DEFS[d].n, old = SHARED.cards[name];
  if (!canShare() || !old) return false;
  try {
    await saveShared({ cards: { [name]: null } });
    SHARED.assets.delete(old).catch(() => {});
    delete SHARED.cards[name]; PORTRAIT[d] = BASE_PORTRAIT[d];
    toast("원래 카드 사진으로 돌아왔어요 (모두에게)"); renderUI(); if (!$("cards").hidden) openCardMenu();
  } catch (e) { shareFail(e); }
  return true;
}
// 배경 사진 올리기 · 빼기
async function shareBackdrop(canvas) {
  if (!canShare()) return false;
  const old = SHARED.backdrop;
  try {
    const up = await SHARED.assets.upload(await toBlob(canvas), { type: "image/jpeg" });
    await saveShared({ backdrop: up.id });
    try { localStorage.removeItem("uri-backdrop"); } catch (e) {}
    if (old && old !== up.id) SHARED.assets.delete(old).catch(() => {});
    SHARED.backdrop = up.id; SHARED.shownBackdrop = up.id;
    const img = new Image(); img.onload = () => applyBackdrop(img); img.src = up.url;
    toast("배경 사진을 모두에게 보이게 올렸어요");
  } catch (e) { shareFail(e); }
  return true;
}
async function unshareBackdrop() {
  const old = SHARED.backdrop;
  if (!canShare() || !old) return false;
  try {
    await saveShared({ backdrop: null });
    SHARED.assets.delete(old).catch(() => {});
    SHARED.backdrop = null; SHARED.shownBackdrop = null; applyBackdrop(null);
    toast("원래 배경으로 돌아왔어요 (모두에게)");
  } catch (e) { shareFail(e); }
  return true;
}
