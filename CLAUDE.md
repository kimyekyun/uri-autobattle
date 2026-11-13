# 우리반 오토배틀 — 작업 안내 (Claude Code 용)

반 친구들을 캐릭터로 만든 롤토체스(TFT) 스타일 오토배틀 게임. three.js r128 로 그리는 3D 게임이고, 빌드 도구 없이 순수 JS 파일(전역 함수·`"use strict"` 스크립트)로 돼 있어요.

## 두 가지 버전
| | 어디서 | 친구와 같이 하기 | 카드 사진 |
|---|---|---|---|
| **아티팩트 원본** (`src/`) | claude.ai 아티팩트 `https://claude.ai/artifact/GvQxrfNwby1qCz7pudz6CE` (공동작업자와 같이 고침) | Claude `room` 기능 | 아티팩트 저장소(`_blob/...`, `photos.js` 의 `BUILTIN_CARDS`) |
| **웹 버전** (`index.html`) | GitHub Pages (이 저장소 루트) | `web/mqttroom.js` (공개 MQTT 웹소켓 중계) | `cards/c00~c11.jpg` |

- **고칠 곳은 항상 `src/`** 예요. 루트 `index.html` 은 `node build/build-site.js` 가 만드는 결과물이라 손으로 고치지 않아요.
- 아티팩트를 공동작업자가 고쳤을 수 있어요. 작업 전에 아티팩트 최신 파일을 받아 `src/` 와 비교하고 합친 다음 고쳐요.

## 파일 지도 (`src/js`, `index.html` 의 불러오는 순서)
- `friends.js` 친구 데이터: `DEFS`(코스트·특성), `TRAITS`, `LOOKS`, `CHAMPS`(판타지 영웅 디자인: kit·무기·색), `LEGEND`
- `skills.js` 친구별 스킬(`SK[이름].run`), 지속 효과는 `B.zones` 에 `step` 함수로 (예: 김예균 `stepRend`, 정주환 `smite`)
- `augments.js` 증강 · `constants.js` 상수·`hexDist`·몬스터 · `game.js` 라운드 흐름(`startPlan`, `startCombatNow`, `finishCombat`, `afterResult`)
- `battle.js` 전투 계산(`makeBattle`, 고정 1/60초 스텝, 투사체 `B.projs`)
- `robot.js` 합체로봇 · `weapons.js` 학생 무기 · `sound.js` 효과음
- `online.js` 온라인 대전(방 presence 로 상태 공유, 시드 난수 `withRng`)
- `photos.js` 카드 사진(공용 사진 + `BUILTIN_CARDS`)
- `figure.js` (공동작업자) 만화 음영 재질 `toonMat`, 외곽선, `bakeFigure`(부품을 묶음마다 합침, 꼭짓점 색 `color` 속성을 곱함)
- `hero.js` 영웅 조각 도구: `slab`/`blade`/`plate`(모서리 깎은 판), `lathe`(회전체), `cloth`(주름 천), 직업별 갑옷 `armor`, 무기 `weapon`, 5코스트 신 `divine`(정주환=천사, 김예균=악마)
- `render3d.js` 3D 장면·캐릭터 조립(`buildStudent`)·공격 동작(`CANIM`, `CH_ANIM`)·이펙트(`drawFx`, `ZDRAW` 스킬 연출, 2D 겹침 그림)
- `ui.js` 화면·상점·카드 · `practice.js` 연습장(규칙 함수를 감싸서 `S.practice` 일 때만 다르게)

## 꼭 지킬 것
- **전투 결과는 모두에게 똑같아야 해요(온라인 대전).** 전투 계산(`battle.js`, `skills.js` 의 run/step)에는 `Math.random` 대신 전투용 난수, 보이는 것만 바꿀 땐 데이터 필드만 추가. 그림·이펙트는 `render3d.js` 에서.
- **디자인은 원작 복제 금지.** 롤/롤토체스 챔피언·맵·스킨, 다른 작품 캐릭터를 그대로 베끼지 않고 느낌만 참고한 새 디자인으로.
- **친구 사진·실명:** 저장소가 공개예요. 사진은 본인들이 동의한 것만 `cards/` 에 넣어요.
- 아티팩트에 올릴 땐 공동작업자의 새 버전을 덮어쓰지 않게 먼저 합쳐요.

## 확인하는 법 (Playwright + 간이 렌더러)
진짜 three.js 대신 `tools/mini-three.js`(WebGL2 간이 렌더러)를 끼워서 화면을 찍어요. 외곽선·빛번짐은 안 나와요.
- `node tools/combat.js src` — 전투 몇 판 돌리고 오류 확인
- `node tools/view.js src out game` — 게임 화면 캡처
- `node tools/hero.js src out.png 진성욱,이현` — 영웅 앞·옆·뒤 (끝에 `cull` 을 붙이면 면 방향 검사)
- `node tools/anim.js src out.png "이현,최효민"` — 공격 동작 6장
- `node tools/prac.js src pr` / `node tools/rend2.js src rr team` — 연습장, 김예균 궁 연출
- `node tools/mqtest.js web/mqttroom.js` — 가짜 브로커로 웹 버전 방 연결 시험
(도구들은 처음 만든 환경 기준이라 경로를 조금 손봐야 할 수 있어요.)

## 웹 버전 올리기
1. `node build/build-site.js` → 루트 `index.html` 갱신
2. 커밋·푸시하면 GitHub Pages 가 1~2분 뒤 반영 (`sw.js` 는 같은 사이트 파일을 늘 새 버전 먼저 받아요)
- 앱 설치(PWA): `manifest.webmanifest`, `sw.js`, `icon-*.png`, `apple-touch-icon.png`
- MQTT 중계 서버: `wss://broker.emqx.io:8084` → `broker-cn.emqx.io` → `test.mosquitto.org:8081` → `broker.hivemq.com:8884` 차례로. 호텔·학교 와이파이가 이 포트를 막으면 휴대폰 데이터로.
