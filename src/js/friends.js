// ============================================================
//  friends.js — 친구들 정보 (이름 · 코스트 · 특성)
//  여기만 고치면 되는 것:
//   · 새 친구 추가: DEFS 에 한 줄 추가  { n: "이름", c: 코스트(1~5), k: "역할", t: ["특성", ...] }
//   · 특성(시너지) 효과 설명/숫자: TRAITS (실제 효과 계산은 battle.js 의 makeFighter)
//   · 역할별 기본 체력/공격/사거리: CLASS
//  새 친구를 넣으면 skills.js 에 스킬, weapons.js 에 무기도 같이 넣어 주세요.
// ============================================================
"use strict";
const DEFS = [
  // 1코스트
  { n: "이승찬", c: 1, k: "응원단", t: ["다 퍼줌", "운동광"] },
  { n: "이현",   c: 1, k: "돌격대", t: ["운동광", "지는 거 못 참음"] },
  { n: "최효민", c: 1, k: "저격수", t: ["운동광", "공부는 잘함", "지는 거 못 참음"] },
  { n: "전하율", c: 1, k: "저격수", t: ["지는 거 못 참음", "공부는 잘함"] },
  // 2코스트
  { n: "이준희", c: 2, k: "돌격대", t: ["운동광", "지는 거 못 참음"], s: "덩크슛" },
  { n: "김현우", c: 2, k: "수호자", t: ["지는 거 못 참음"] },
  { n: "이보경", c: 2, k: "수호자", t: ["축구부", "합체로봇"], s: "태클 수비" },
  { n: "윤동욱", c: 2, k: "돌격대", t: ["운동광", "지는 거 못 참음", "합체로봇"] },
  { n: "은혜린", c: 2, k: "응원단", t: ["다 퍼줌", "댄스부", "공부는 잘함"], s: "춤추기" },
  // 3코스트
  { n: "김민기", c: 3, k: "천재",   t: ["공부는 잘함", "다 퍼줌"] },
  { n: "임시온", c: 3, k: "수호자", t: ["축구부", "다 퍼줌"], s: "골문 사수" },
  { n: "박현호", c: 3, k: "응원단", t: ["공부는 잘함", "다 퍼줌"] },
  { n: "조하윤", c: 3, k: "저격수", t: ["공부는 잘함", "다 퍼줌", "프로게이머", "합체로봇"] },
  { n: "최윤서", c: 3, k: "수호자", t: ["지는 거 못 참음", "댄스부"], s: "그물 던지기" },
  // 4코스트
  { n: "박희찬", c: 4, k: "저격수", t: ["축구부", "공부는 잘함", "합체로봇"], s: "무회전 프리킥" },
  { n: "진성욱", c: 4, k: "돌격대", t: ["운동광", "지는 거 못 참음"] },
  { n: "박준서", c: 4, k: "천재",   t: ["수학왕", "공부는 잘함", "지는 거 못 참음"], s: "수학 문제 폭격" },
  { n: "손태민", c: 4, k: "천재",   t: ["공부는 잘함", "전교 1등", "다 퍼줌"] },
  // 5코스트
  { n: "정주환", c: 5, k: "신",     t: ["신", "다 퍼줌", "운동광"] },
  { n: "김예균", c: 5, k: "수호자", t: ["운동광", "다 퍼줌", "지는 거 못 참음", "축구부"] },
];
const TRAITS = {
  "운동광":   { t: [2, 4, 6], d: "운동광 체력 +20% / +40% / +50%" },
  "지는 거 못 참음":   { t: [2, 4, 6], d: "지는 거 못 참음 공격력 +20% / +45% / +60%, 치명타 20%" },
  "공부는 잘함":   { t: [2, 4, 6], d: "공부는 잘함 스킬 세기(피해·회복·보호막) +60% / +110% / +180%" },
  "다 퍼줌": { t: [2, 4],   d: "아군 전체에게 최대 체력 15% / 50% 만큼 보호막" },
  "축구부":   { t: [2, 3, 4], d: "축구부 공격 속도 +30% / +55% / +65%" },
  "수학왕":   { t: [1],       d: "박준서 마나 회복 +60%" },
  "댄스부":   { t: [2],       d: "은혜린·최윤서 둘 다 있으면: 댄스부 공격 속도 +25%, 은혜린 춤추기 무대가 1초 더 오래 가요" },
  "프로게이머": { t: [1],     d: "조하윤 공격 속도 +30%" },
  "전교 1등": { t: [1],      d: "손태민 스킬 피해 +40%" },
  "합체로봇": { t: [4],      d: "조하윤·박희찬·윤동욱·이보경 4명이 모두 보드에 있으면 전투 시작 때 4인 합체로봇으로 합체! 4명 모두 ★3이면 초합체로봇이 하늘에서 내려와 빛의 대검으로 전장 전체를 베어요" },
  "신":       { t: [1],       d: "신의 가호: 아군 전체 공격력·체력 +12%" },
};
// ---------- 옷 ----------
// type: uniform(교복) cardigan(카디건) vest(조끼+셔츠) track(체육복) hoodie(후드티) padding(패딩)
//       varsity(야구 점퍼) jersey(운동 유니폼·반바지) tank(민소매) tshirt(티셔츠) dobok(도복) robe(로브)
// top: 윗옷 색, bottom: 바지 색, accent: 포인트 색, num: 등번호, print: 가슴 글자, sleeve: "long"|"short"|"none"
const OUTFITS = {
  "이승찬": { type: "hoodie", top: 0xf08a3a, bottom: 0xcbb592, accent: 0xffffff },
  "이현": { type: "track", top: 0xc8323a, accent: 0xffffff },
  "최효민": { type: "jersey", top: 0xf4f4f4, bottom: 0x2f5fa8, accent: 0x2f5fa8, num: "7" },
  "전하율": { type: "padding", top: 0x1e2126, bottom: 0x3c5a86, accent: 0xe8402e },
  "이준희": { type: "tank", top: 0xf08a1a, bottom: 0xf08a1a, accent: 0x5a2a8a, num: "23" },
  "김현우": { type: "hoodie", top: 0x2a3550, bottom: 0x4a4e57, accent: 0xff7a3a },
  "이보경": { type: "jersey", top: 0x2f9a5a, bottom: 0xf4f4f4, accent: 0xf4f4f4, num: "4", socks: 0x2f9a5a },
  "은혜린": { type: "cardigan", top: 0xf4a6c4, bottom: 0xf4f0ea, accent: 0xffffff },
  "윤동욱": { type: "dobok", top: 0xf6f4ee, bottom: 0xf6f4ee, accent: 0x111111 },
  "김민기": { type: "tshirt", top: 0xf4f4f4, bottom: 0x3c5a86, accent: 0x7a5cd0, print: "✎" },
  "임시온": { type: "jersey", top: 0xd8e83a, bottom: 0x1e2126, accent: 0x1e2126, num: "1", sleeve: "long", socks: 0xd8e83a },
  "김예균": { type: "hoodie", top: 0x2a7a78, bottom: 0x2b303b, accent: 0x7ff0e0 },
  "최윤서": { type: "track", top: 0x2a8a6a, accent: 0xf4f4f4 },
  "박현호": { type: "varsity", top: 0xb8323a, bottom: 0x3c5a86, accent: 0xf2e6c8 },
  "조하윤": { type: "hoodie", top: 0x1a1a22, bottom: 0x1a1a22, accent: 0x3fd8ff },
  "박희찬": { type: "jersey", top: 0xc8102e, bottom: 0xf4f4f4, accent: 0xf4f4f4, num: "7", socks: 0xc8102e },
  "진성욱": { type: "tank", top: 0x5a5f66, bottom: 0x1e2126, accent: 0xe8402e, print: "GYM" },
  "박준서": { type: "vest", top: 0x7a2a3a, bottom: 0x4a4e57, accent: 0xf2f0ea },
  "손태민": { type: "uniform", top: 0x1f2a44, bottom: 0x343a44 },
  "정주환": { type: "robe", top: 0xf8f6f0, bottom: 0xf8f6f0, accent: 0xffcf4a },
};
// ---------- 생김새(스킨) ----------
// 친구마다 머리 모양·머리 색·체격·표정·장식을 따로 정해요. 특성에 어울리게 골랐어요.
// hair: bowl(바가지) spiky(뾰족) side(옆으로 넘김) buzz(반삭) pomp(올림머리) curtain(가르마) curly(곱슬) mushroom(버섯)
//       messy(부스스) mohawk(모히칸) slick(올백) flat(각진 스포츠) wavy(웨이브) long(긴 머리)
// hc: 머리 색, tip: 포인트 염색 색, skin: 0~3(피부 톤), tall·wide: 키·체격 배율, head: 머리 크기 배율
// eye: 눈 크기 배율, mouth: smile(미소) grin(활짝) flat(무표정) pout(꾹 다문 입), brow: 눈썹 굵기 배율
// acc: 장식 목록 — [종류, 색 또는 옵션...]
//   headband(머리띠, "tails"=뒤로 날리는 끈) sweatband(땀 밴드) cap(야구 모자, "back"=거꾸로) beanie(비니) beret(베레모)
//   glasses(안경: round·square·rimless·tint·sport) pencil(귀에 꽂은 연필) bandage(반창고: cheek·nose) blush(볼 터치)
//   scarf(목도리) towel(목 수건) whistle(호루라기) armband(완장) wristband(손목 밴드) sleeve(한쪽 팔 토시)
//   backpack(책가방) pendant(빛나는 목걸이) bowtie(나비넥타이) badge(가슴 배지 글자) backprint(등 글자) laurel(월계관) wings(날개)
const LOOKS = {
  "이승찬": { hair: "curly", hc: 0x6b4226, skin: 2, tall: 0.96, wide: 1.04, eye: 1.12, mouth: "grin", acc: [["scarf", 0xfff0c8], ["headband", 0xffd24a], ["backprint", "♥", 0xffffff]] },
  "이현": { hair: "spiky", hc: 0x16110e, tip: 0xc8323a, skin: 1, tall: 1.0, wide: 1.02, mouth: "pout", brow: 1.35, acc: [["headband", 0xe8402e, "tails"], ["bandage", "cheek"], ["wristband", 0xffffff]] },
  "최효민": { hair: "side", hc: 0x2a1d15, skin: 0, tall: 0.97, wide: 0.95, acc: [["cap", 0x2f5fa8, "back"], ["glasses", "sport", 0x2f5fa8], ["wristband", 0x2f5fa8]] },
  "전하율": { hair: "curtain", hc: 0x121212, skin: 2, tall: 1.02, wide: 0.96, mouth: "flat", brow: 1.2, acc: [["beanie", 0xc8323a], ["bandage", "nose"]] },
  "이준희": { hair: "flat", hc: 0x1c1612, skin: 3, tall: 1.09, wide: 1.03, mouth: "grin", acc: [["sweatband", 0x5a2a8a], ["sleeve", 0x1a1a1e], ["wristband", 0x5a2a8a]] },
  "김현우": { hair: "curtain", hc: 0x4a3324, skin: 0, tall: 1.02, wide: 1.06, mouth: "grin", brow: 1.15, acc: [["sweatband", 0xff7a3a], ["wristband", 0xff7a3a]] },
  "이보경": { hair: "buzz", hc: 0x1c1612, skin: 3, tall: 1.02, wide: 1.14, mouth: "pout", acc: [["armband", 0xffd24a], ["sweatband", 0xf4f4f4]] },
  "은혜린": { hair: "long", hc: 0x3a2418, skin: 1, tall: 0.96, wide: 0.93, mouth: "grin", acc: [["headband", 0xff7aa8], ["blush"], ["wristband", 0xff7aa8]] },
  "윤동욱": { hair: "mohawk", hc: 0x141414, skin: 1, tall: 1.0, wide: 1.06, mouth: "pout", brow: 1.3, acc: [["headband", 0xf6f4ee, "tails"], ["bandage", "cheek"]] },
  "김민기": { hair: "mushroom", hc: 0x3a291c, skin: 2, tall: 0.95, wide: 0.97, eye: 1.1, mouth: "smile", acc: [["beret", 0x7a5cd0], ["glasses", "round", 0x7a5cd0], ["pencil"], ["backpack", 0x7a5cd0]] },
  "임시온": { hair: "side", hc: 0x2a1d15, skin: 1, tall: 1.06, wide: 1.12, mouth: "smile", acc: [["cap", 0x2b303b, "", 0xd8e83a]] },
  "김예균": { hair: "messy", hc: 0x1a1a1a, tip: 0x3fd8c8, skin: 0, tall: 1.03, wide: 1.08, mouth: "smile", acc: [["sweatband", 0x7ff0e0], ["pendant", 0x7ff0e0], ["wristband", 0x7ff0e0], ["backprint", "✦", 0x7ff0e0]] },
  "최윤서": { hair: "wavy", hc: 0x1c1612, skin: 2, tall: 1.03, wide: 1.08, mouth: "pout", brow: 1.2, acc: [["sweatband", 0xf4f4f4], ["armband", 0x2a8a6a]] },
  "박현호": { hair: "side", hc: 0x3a291c, skin: 2, tall: 0.98, wide: 1.0, eye: 1.08, mouth: "grin", acc: [["whistle"]] },
  "조하윤": { hair: "bowl", hc: 0x101014, tip: 0x3fd8ff, skin: 0, tall: 0.97, wide: 0.92, mouth: "flat", acc: [["glasses", "tint", 0x3fd8ff], ["backprint", "GG", 0x3fd8ff]] },
  "박희찬": { hair: "wavy", hc: 0x2a1d15, skin: 1, tall: 1.03, wide: 0.99, mouth: "smile", acc: [["headband", 0x101010], ["glasses", "rimless", 0xcfd8e0], ["armband", 0xf4f4f4]] },
  "진성욱": { hair: "buzz", hc: 0x141414, skin: 3, tall: 1.07, wide: 1.24, mouth: "pout", brow: 1.4, acc: [["towel", 0xf4f4f4], ["wristband", 0xe8402e], ["bandage", "nose"]] },
  "박준서": { hair: "bowl", hc: 0x1c1612, skin: 0, tall: 0.94, wide: 0.95, eye: 1.05, mouth: "smile", acc: [["glasses", "square", 0x1d1d1d], ["bowtie", 0xffcf4a], ["badge", "π", "#ffffff", "#7a2a3a"], ["pencil"], ["backpack", 0x7a2a3a]] },
  "손태민": { hair: "slick", hc: 0x16110e, skin: 2, tall: 1.01, wide: 0.96, mouth: "flat", acc: [["glasses", "rimless", 0xd8b45a], ["armband", 0xc8323a], ["backpack", 0x1f2a44]] },
  "정주환": { hair: "slick", hc: 0xe8c25a, tip: 0xfff0b0, skin: 0, tall: 1.1, wide: 1.1, head: 1.0, mouth: "flat", brow: 1.2, acc: [["laurel"], ["wings"]] },
};
// ---------- 판타지 영웅 모습 (CHAMPS) ----------
// 학교 옷 대신 각자 스킬에 어울리는 판타지 영웅 차림이에요. 표에 있는 친구는 이 모습이 OUTFITS·LOOKS 보다 먼저 쓰여요.
// kit: guard(판금 기사) warrior(전사) ranger(사냥꾼) mage(마법사) bard(음유시인) god(신) monk(무도가) assassin(암살자) juggernaut(중갑 전사)
// head: helm(투구) horned(뿔 투구) hood(두건) circlet(머리띠 관) mask(복면) visor(빛나는 눈가리개) crown(왕관) band(머리 끈) none
// weapon: sword blades greataxe hammer bow crossbow rifle tome shield bo quill gauntlets horn astrolabe abyssorb spear crystalstaff sunstaff pizzabox(피자 상자) mawshield(포크 + 이빨 방패)
// metal: steel gold dark bronze, scar: 1 이면 볼에 흉터, paint: 얼굴 문양 색
const CHAMPS = {
  "이승찬": { title: "새벽빛 사제", kit: "bard", top: 0xd88a34, bottom: 0x5a3e26, accent: 0xfff0c0, metal: "gold", hair: "curly", hc: 0x6b4226, skin: 2, head: "circlet", weapon: "sunstaff", coat: 1 },
  "이현": { title: "진홍 질주검", kit: "warrior", top: 0xa82830, bottom: 0x2a1a1c, accent: 0xff6a3a, metal: "dark", hair: "spiky", hc: 0x16110e, tip: 0xc8323a, skin: 1, head: "band", weapon: "blades", paint: 0xc8323a },
  "최효민": { title: "폭풍 궁수", kit: "ranger", top: 0x2f5f98, bottom: 0x3a3a44, accent: 0xbfe0ff, metal: "steel", hair: "side", hc: 0x2a1d15, skin: 0, head: "hood", weapon: "bow" },
  "전하율": { title: "그림자 저격자", kit: "assassin", top: 0x1e2028, bottom: 0x1a1a20, accent: 0xe8402e, metal: "dark", hair: "curtain", hc: 0x121212, skin: 2, head: "mask", weapon: "crossbow", scar: 1 },
  "이준희": { title: "천둥 강타자", kit: "warrior", top: 0x5a2a8a, bottom: 0x2a2030, accent: 0xf0a020, metal: "bronze", hair: "flat", hc: 0x1c1612, skin: 3, head: "none", weapon: "hammer", paint: 0xf0a020 },
  "김현우": { title: "먹보 수문장", kit: "guard", top: 0x23305a, bottom: 0x2a2e3a, accent: 0xff7a3a, metal: "dark", hair: "curtain", hc: 0x4a3324, skin: 0, head: "horned", weapon: "mawshield" },
  "이보경": { title: "에메랄드 방패기사", kit: "guard", top: 0x2a7a4a, bottom: 0x2a3a30, accent: 0xe8c25a, metal: "steel", hair: "buzz", hc: 0x1c1612, skin: 3, head: "helm", weapon: "shield" },
  "은혜린": { title: "달빛 무희", kit: "bard", top: 0xe86a98, bottom: 0x3a2030, accent: 0xffd0e4, metal: "gold", hair: "long", hc: 0x3a2418, skin: 1, head: "circlet", weapon: "ribbon", coat: 1 },
  "윤동욱": { title: "음양 무도가", kit: "monk", top: 0xf0ece0, bottom: 0x1a1a1e, accent: 0x111111, metal: "bronze", hair: "mohawk", hc: 0x141414, skin: 1, head: "band", weapon: "bo" },
  "김민기": { title: "룬 필경사", kit: "mage", top: 0x5a3c9a, bottom: 0x2e2840, accent: 0xd8b0ff, metal: "gold", hair: "mushroom", hc: 0x3a291c, skin: 2, head: "hood", weapon: "quill", coat: 1 },
  "임시온": { title: "철문 수문장", kit: "juggernaut", top: 0x8a7a1a, bottom: 0x1e2126, accent: 0xf0e040, metal: "dark", hair: "side", hc: 0x2a1d15, skin: 1, head: "horned", weapon: "gauntlets" },
  "최윤서": { title: "그물 사냥꾼", kit: "ranger", top: 0x2a6a58, bottom: 0x2a2e2a, accent: 0xa8f0d0, metal: "bronze", hair: "wavy", hc: 0x1c1612, skin: 2, head: "hood", weapon: "net" },
  "박현호": { title: "피자 파티 기사", kit: "bard", top: 0x9a2a30, bottom: 0x2a3550, accent: 0xf2e6c8, metal: "gold", hair: "side", hc: 0x3a291c, skin: 2, head: "none", weapon: "pizzabox", coat: 1 },
  "조하윤": { title: "심연의 사수", kit: "assassin", top: 0x16161e, bottom: 0x101016, accent: 0x3fd8ff, metal: "dark", hair: "bowl", hc: 0x101014, tip: 0x3fd8ff, skin: 0, head: "visor", weapon: "rifle", coat: 1 },
  "박희찬": { title: "불꽃 창기병", kit: "ranger", top: 0xc8102e, bottom: 0xe8e8f0, accent: 0xffd36b, num: "7", metal: "steel", hair: "wavy", hc: 0x2a1d15, skin: 1, head: "circlet", weapon: "spear" },
  "진성욱": { title: "강철 파괴자", kit: "juggernaut", top: 0x4a4e56, bottom: 0x1e2126, accent: 0xe8402e, metal: "dark", hair: "buzz", hc: 0x141414, skin: 3, head: "helm", weapon: "greataxe", scar: 1 },
  "박준서": { title: "별자리 점성술사", kit: "mage", top: 0x6a2038, bottom: 0x2a2030, accent: 0xffd86b, metal: "gold", hair: "bowl", hc: 0x1c1612, skin: 0, head: "hood", weapon: "astrolabe", coat: 1 },
  "손태민": { title: "심연 마도사", kit: "mage", top: 0x1e1838, bottom: 0x14121e, accent: 0xb06aff, metal: "dark", hair: "slick", hc: 0x16110e, skin: 2, head: "crown", weapon: "abyssorb", coat: 1 },
  "정주환": { title: "천벌의 심판자", kit: "god", top: 0xf4ecd8, bottom: 0xe8e0c8, accent: 0xffd86b, metal: "gold", hair: "slick", hc: 0xe8c25a, tip: 0xfff0b0, skin: 0, head: "crown", weapon: "spear", acc: [["wings"]] },
  "김예균": { title: "심연의 마왕", kit: "guard", top: 0x3a0c16, bottom: 0x180a10, accent: 0xff3a4a, metal: "dark", hair: "messy", hc: 0x141014, tip: 0xc8202a, skin: 0, head: "circlet", weapon: "crystalstaff" },
};
// ---------- 밸런스 표 ----------
// 친구마다 체력(hp) · 공격력(ad) · 스킬 세기(sk)에 곱하는 숫자예요. 1 = 그대로, 1.1 = 10% 강하게, 0.9 = 10% 약하게.
// 같은 골드로 짠 무작위 팀끼리 수천 판 싸우게 해서, 승률이 50%에 가깝도록 맞춘 값이에요.
const TUNE = {
  "이승찬": { hp: 1.04, ad: 1.04, sk: 1.04 },
  "이현": { hp: 1.01, ad: 1.01, sk: 1.01 },
  "최효민": { hp: 0.86, ad: 0.86, sk: 0.86 },
  "전하율": { hp: 1.13, ad: 1.13, sk: 1.13 },
  "이준희": { hp: 0.92, ad: 0.92, sk: 0.92 },
  "김현우": { hp: 1.05, ad: 1.05, sk: 1.05 },
  "이보경": { hp: 0.96, ad: 0.96, sk: 0.96 },
  "윤동욱": { hp: 0.87, ad: 0.87, sk: 0.87 },
  "은혜린": { hp: 1.20, ad: 1.20, sk: 1.20 },
  "김민기": { hp: 1.20, ad: 1.20, sk: 1.20 },
  "임시온": { hp: 0.85, ad: 0.85, sk: 0.85 },
  "조하윤": { hp: 0.87, ad: 0.87, sk: 0.87 },
  "최윤서": { hp: 1.05, ad: 1.05, sk: 1.05 },
  "박현호": { hp: 1.60, ad: 1.60, sk: 1.60 },
  "김예균": { hp: 0.93, ad: 0.93, sk: 0.93 }, // 축구부를 얻어 강해진 만큼 낮춤
  "박희찬": { hp: 1.07, ad: 1.07, sk: 1.07 },
  "진성욱": { hp: 0.97, ad: 0.97, sk: 0.97 },
  "박준서": { hp: 0.88, ad: 0.88, sk: 0.88 },
  "손태민": { hp: 0.98, ad: 0.98, sk: 0.98 },
};
const tuneOf = (def) => TUNE[def.n] || { hp: 1, ad: 1, sk: 1 };
// 5코스트 ★3 = 전설. 만들기 아주 어려운 대신, 만들면 거의 무조건 이겨요 (체력·공격력·스킬에 곱하는 숫자)
const LEGEND = { hp: 5, ad: 3, sk: 5 };
// 친구마다 따로 정한 전설 배율. 김예균 ★3("세계를 가르는 참격")은 스킬이 아주 세서, 전설끼리 붙으면 정주환이 2%밖에 못 이겼어요
// → 스킬 배율만 낮춰서 정주환 약 58% (다른 팀 상대로는 김예균 ★3 도 그대로 100% 이겨요). 김예균 스킬을 바꾸면 다시 재 주세요
const LEGEND_FOR = { "김예균": { hp: 5, ad: 3, sk: 3.8 }, "정주환": { hp: 6, ad: 3, sk: 6 } }; // 정주환 ★3 은 김예균 ★3 을 1대1로 이겨요
const legendOf = (def, star) => (def.c === 5 && star >= 3 ? LEGEND_FOR[def.n] || LEGEND : { hp: 1, ad: 1, sk: 1 });
const MAIN_TRAITS = ["운동광", "지는 거 못 참음", "공부는 잘함", "다 퍼줌", "축구부"];
// rg = 육각 칸 사거리
const CLASS = {
  "수호자": { hp: 780, ad: 48, as: 0.6,  rg: 1, ar: 0.25, mm: 60, sk: "철벽 수비" },
  "돌격대": { hp: 660, ad: 62, as: 0.7,  rg: 1, ar: 0.1,  mm: 50, sk: "돌진 강타" },
  "저격수": { hp: 480, ad: 58, as: 0.75, rg: 4, ar: 0,    mm: 70, sk: "한 방 저격" },
  "천재":   { hp: 500, ad: 42, as: 0.65, rg: 3, ar: 0,    mm: 60, sk: "아이디어 폭발" },
  "응원단": { hp: 540, ad: 38, as: 0.65, rg: 3, ar: 0.05, mm: 70, sk: "힘내라!" },
  "신":     { hp: 1050,ad: 80, as: 0.8,  rg: 2, ar: 0.2,  mm: 80, sk: "천벌" },
};
