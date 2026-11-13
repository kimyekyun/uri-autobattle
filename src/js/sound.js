// ============================================================
//  sound.js — 효과음
// ============================================================
"use strict";
// =============== 소리 ===============
let AC = null, muted = false, lastHit = 0, noiseSeed = 12345;
try { muted = localStorage.getItem("uri-mute") === "1"; } catch (e) {}
function sfx(name) {
  if (muted || !AC) return;
  const now = AC.currentTime;
  const tone = (f, d, type = "square", v = 0.04, f2 = null, delay = 0) => {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f, now + delay);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, now + delay + d);
    g.gain.setValueAtTime(v, now + delay); g.gain.exponentialRampToValueAtTime(0.0001, now + delay + d);
    o.connect(g).connect(AC.destination); o.start(now + delay); o.stop(now + delay + d + 0.02);
  };
  switch (name) {
    case "buy": tone(660, 0.07, "square", 0.03); tone(990, 0.08, "square", 0.03, null, 0.05); break;
    case "sell": tone(440, 0.12, "triangle", 0.05, 220); break;
    case "place": tone(520, 0.05, "triangle", 0.04); break;
    case "level": [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, "square", 0.03, null, i * 0.08)); break;
    case "merge": [784, 988, 1319].forEach((f, i) => tone(f, 0.15, "triangle", 0.06, null, i * 0.07)); break;
    case "hit": if (performance.now() - lastHit < 70) return; lastHit = performance.now(); tone(180, 0.05, "square", 0.012, 90); break;
    case "cast": tone(300, 0.25, "sawtooth", 0.025, 900); break;
    case "boom": tone(120, 0.45, "sawtooth", 0.06, 40); break;
    case "transform": [0, 0.07, 0.14, 0.21].forEach((d, i) => tone(220 + i * 140, 0.06, "square", 0.03, 520 + i * 160, d)); tone(160, 0.3, "sawtooth", 0.025, 640, 0.05); break; // 변신: 위잉-착착
    case "clank": tone(1250, 0.05, "square", 0.03, 700); tone(140, 0.12, "triangle", 0.06, 70, 0.01); break; // 부품이 철컥 끼워질 때
    case "start": tone(392, 0.1, "square", 0.03); tone(587, 0.15, "square", 0.03, null, 0.1); break;
    case "win": [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, "triangle", 0.05, null, i * 0.1)); break;
    case "lose": [392, 330, 262].forEach((f, i) => tone(f, 0.25, "triangle", 0.05, null, i * 0.14)); break;
    case "crit": tone(900, 0.06, "square", 0.035, 1500); tone(240, 0.12, "sawtooth", 0.04, 90, 0.02); break;
    case "ko": tone(520, 0.1, "triangle", 0.05, 180); tone(140, 0.25, "sine", 0.06, 50, 0.05); break;
    case "kick": tone(220, 0.08, "square", 0.06, 90); tone(900, 0.18, "sawtooth", 0.02, 300, 0.03); break;
    case "charge": tone(80, 0.7, "sawtooth", 0.04, 640); tone(1200, 0.5, "square", 0.012, 3000, 0.15); break;
    case "thunder": { // 지지직 + 우르릉 (잡음)
      const len = 0.6, buf = AC.createBuffer(1, AC.sampleRate * len, AC.sampleRate), d = buf.getChannelData(0);
      // 잡음은 따로 만든 난수로 (Math.random 을 쓰면 온라인 전투의 난수 순서가 소리 켠 사람만 달라져요)
      for (let i = 0; i < d.length; i++) { const k = i / d.length; noiseSeed = (noiseSeed * 1664525 + 1013904223) >>> 0; d[i] = (noiseSeed / 2147483648 - 1) * Math.pow(1 - k, 2.2) * (k < 0.05 ? 1 : 0.6); }
      const src = AC.createBufferSource(), lp = AC.createBiquadFilter(), g = AC.createGain();
      src.buffer = buf; lp.type = "lowpass"; lp.frequency.setValueAtTime(5000, now); lp.frequency.exponentialRampToValueAtTime(200, now + len);
      g.gain.value = 0.12; src.connect(lp).connect(g).connect(AC.destination); src.start(now);
      break;
    }
    case "item": tone(880, 0.06, "sine", 0.05); tone(1320, 0.1, "sine", 0.05, null, 0.05); break;
  }
}
