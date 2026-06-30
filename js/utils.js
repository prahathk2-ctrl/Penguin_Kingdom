// ===================== utils.js =====================
// Small shared helpers. Attached to a global PW (Penguin Wars) namespace
// so every other plain <script> file can use them without modules/bundlers.

const PW = window.PW || {};
window.PW = PW;

PW.utils = (() => {

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
  }

  function choice(arr) {
    return arr[randInt(0, arr.length - 1)];
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function dist(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function uid(prefix) {
    return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
  }

  // Format a population number for compact HUD display (1234 -> "1.2k")
  function formatNumber(n) {
    n = Math.floor(n);
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return String(n);
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  }

  // Precise M:SS.t format (tenths of a second) for the in-game stopwatch
  // and best-time displays, so close races are distinguishable.
  function formatStopwatch(seconds) {
    seconds = Math.max(0, seconds);
    const m = Math.floor(seconds / 60);
    const rem = seconds - m * 60;
    const s = Math.floor(rem);
    const tenths = Math.floor((rem - s) * 10);
    return `${m}:${s < 10 ? "0" : ""}${s}.${tenths}`;
  }

  // Rejection-sampling point placement: tries to place `count` points inside
  // a sampling function's region, keeping at least `minDist` apart.
  function placePoints(count, minDist, sampleFn, maxAttempts = 4000) {
    const pts = [];
    let attempts = 0;
    while (pts.length < count && attempts < maxAttempts) {
      attempts++;
      const p = sampleFn();
      let ok = true;
      for (const q of pts) {
        if (dist(p.x, p.y, q.x, q.y) < minDist) { ok = false; break; }
      }
      if (ok) pts.push(p);
    }
    return pts;
  }

  // Named palette — also used by renderer/CSS-adjacent JS draw code.
  const PALETTE = {
    polarNight: "#0b1320",
    iceDeep: "#122a44",
    iceMid: "#1c4366",
    iceBlue: "#5ec8f0",
    snow: "#f1f7fb",
    auroraGreen: "#52ffb5",
    auroraViolet: "#b07bff",
    crimsonFoe: "#ff5d6c",
    crystalGold: "#ffd166",
    neutral: "#7b95ab"
  };

  // Distinct colors handed out to AI bots, in order. Generated on the fly
  // (rather than a fixed short list) since the campaign scales up to
  // dozens of simultaneous opponents at high levels. Hues are spread
  // evenly around the wheel, skipping a band near the player's ice-blue
  // so bots never get confused for the player.
  function generateBotColors(n) {
    const colors = [];
    const excludeStart = 188, excludeEnd = 228; // band around ice-blue (~205)
    const arc = 360 - (excludeEnd - excludeStart);
    for (let i = 0; i < n; i++) {
      const hue = (excludeEnd + (i / Math.max(1, n)) * arc) % 360;
      const light = 55 + ((i * 7) % 3) * 6; // tiny lightness jitter so repeating hues (large n) stay distinguishable
      colors.push(`hsl(${Math.round(hue)}, 72%, ${light}%)`);
    }
    return colors;
  }

  // A short curated fallback list, kept for any code that wants a fixed palette.
  const BOT_COLORS = [
    "#ff5d6c", "#ffb84d", "#b07bff", "#7fffd4", "#ff8fd6", "#ffe066", "#9aff7a"
  ];

  return {
    rand, randInt, choice, clamp, lerp, dist, uid,
    formatNumber, formatTime, formatStopwatch, placePoints,
    PALETTE, BOT_COLORS, generateBotColors
  };
})();
