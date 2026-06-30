// ===================== levels.js =====================
// A 50-level campaign, generated from a handful of smooth difficulty
// curves rather than hand-authored one by one. Level 1 is a simple 1-vs-1
// duel (one rival, one base each); level 50 throws dozens of rival
// empires and hundreds of territories onto a sprawling map.
//
// Each level fully determines its match (map shape/size, opponent count,
// AI skill mix, weather, and a couple of extra difficulty knobs) so the
// menu doesn't need separate map/difficulty pickers — picking a level
// *is* picking a difficulty.

PW.LEVELS = (() => {
  const TOTAL_LEVELS = 50;
  const MAP_TYPES = ["continent", "archipelago", "icebergs", "random"];

  // Antarctic-flavored name generator. 20x20 word combos via coprime
  // step sizes give 50 distinct-looking names without hand-writing them.
  const ADJ = ["Frozen", "Icy", "Howling", "Silent", "Cracked", "Deep", "Endless", "Bitter",
    "Glacial", "Polar", "Shattered", "Drifting", "Hollow", "Pale", "Restless", "Sunken",
    "Whispering", "Iron", "Ashen", "Last"];
  const NOUN = ["Frontier", "Coastline", "Wastes", "Strait", "Expanse", "Reach", "Tundra",
    "Horizon", "Drift", "Abyss", "Shoreline", "Crossing", "Hollow", "Watch", "Passage",
    "Plateau", "Trench", "Cape", "Ridge", "Throne"];

  function nameFor(id) {
    if (id === 1) return "First Colony";
    if (id === TOTAL_LEVELS) return "Grand Emperor's Wrath";
    return `${ADJ[(id * 7) % ADJ.length]} ${NOUN[(id * 13) % NOUN.length]}`;
  }

  function dominantTierLabel(weights) {
    const [name] = Object.entries(weights).sort((a, b) => b[1] - a[1])[0];
    return { rookie: "Rookie", veteran: "Veteran", commander: "Commander" }[name];
  }

  function blurbFor(aiCount, weights) {
    const tier = dominantTierLabel(weights);
    if (aiCount <= 1) return `A single ${tier}-tier rival. Learn the ice.`;
    if (aiCount <= 3) return `${aiCount} rivals, mostly ${tier}-tier opposition.`;
    if (aiCount <= 8) return `${aiCount} colonies vie for the ice — ${tier}-tier AI leads the pack.`;
    if (aiCount <= 16) return `${aiCount} rival empires, dominated by ${tier}-tier commanders.`;
    return `${aiCount} rival empires sprawl across the ice. Nearly all ${tier}-tier.`;
  }

  function sizeLabel(territoryCount) {
    if (territoryCount < 14) return "small";
    if (territoryCount < 40) return "medium";
    if (territoryCount < 90) return "large";
    if (territoryCount < 180) return "epic";
    return "massive";
  }

  const levels = [];
  for (let id = 1; id <= TOTAL_LEVELS; id++) {
    const t = (id - 1) / (TOTAL_LEVELS - 1); // 0 at level 1, 1 at level 50

    const aiCount = Math.max(1, Math.min(35, Math.round(1 + 34 * Math.pow(t, 1.3))));
    const territoryCount = Math.max(10, Math.round(10 + 290 * Math.pow(t, 1.15)));

    // World size grows with territory count so density (and travel feel)
    // stays roughly constant — a level-50 map is physically huge, not
    // just more crowded. The camera fits the whole map to the screen, so
    // it naturally reads as "zoomed out over a sprawling continent."
    const density = 41555; // world-units^2 per territory, tuned to match the old "medium" map
    const aspect = 1.62;
    const worldArea = territoryCount * density;
    const worldW = Math.round(Math.sqrt(worldArea * aspect));
    const worldH = Math.round(worldW / aspect);

    // AI skill mix: pure Rookie for the first couple of levels, Veteran
    // phases in by level 3, Commander starts appearing around level 10,
    // and by level 50 the field is almost entirely Commander-tier.
    const rookieWeight = Math.max(0.02, 1 - 1.6 * t);
    const veteranWeight = t < 0.04 ? 0 : Math.max(0.05, 1 - Math.abs(t - 0.5) * 1.6);
    const commanderWeight = t < 0.18 ? 0 : Math.max(0.02, (t - 0.18) / 0.82);
    const tierWeights = { rookie: rookieWeight, veteran: veteranWeight, commander: commanderWeight };

    const weatherOn = id >= 4;
    const neutralMultiplier = 1 + 0.45 * t;
    const botHeadstart = 1 + 0.4 * t;
    const mapType = MAP_TYPES[(id - 1) % MAP_TYPES.length];

    levels.push({
      id,
      name: nameFor(id),
      blurb: blurbFor(aiCount, tierWeights),
      mapType,
      mapSize: sizeLabel(territoryCount), // display label only; generation uses explicit dims below
      territoryCount,
      worldW,
      worldH,
      aiCount,
      weatherOn,
      tierWeights,
      neutralMultiplier,
      botHeadstart
    });
  }
  return levels;
})();

PW.levels = (() => {
  const STORAGE_KEY = "penguinwars_unlocked_level";
  const TIMES_KEY = "penguinwars_besttimes";

  function safeGet() {
    try {
      const v = parseInt(window.localStorage.getItem(STORAGE_KEY), 10);
      return Number.isFinite(v) && v >= 1 ? v : 1;
    } catch (e) {
      return 1; // localStorage unavailable (privacy mode, etc) — default to level 1 only
    }
  }

  function safeSet(v) {
    try { window.localStorage.setItem(STORAGE_KEY, String(v)); } catch (e) { /* ignore */ }
  }

  function safeGetTimes() {
    try {
      const raw = window.localStorage.getItem(TIMES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function safeSetTimes(obj) {
    try { window.localStorage.setItem(TIMES_KEY, JSON.stringify(obj)); } catch (e) { /* ignore */ }
  }

  let unlocked = safeGet();
  let bestTimes = safeGetTimes();

  function getUnlocked() { return unlocked; }
  function isUnlocked(id) { return id <= unlocked; }

  function completeLevel(id) {
    if (id >= unlocked && id < PW.LEVELS.length) {
      unlocked = id + 1;
      safeSet(unlocked);
    }
  }

  function getBestTime(id) {
    const v = bestTimes[id];
    return typeof v === "number" && isFinite(v) ? v : null;
  }

  // Records a completion time for a level. Only keeps it if it beats (or
  // is the first) recorded time. Returns { isNewBest, previous }.
  function recordTime(id, seconds) {
    const previous = getBestTime(id);
    if (previous === null || seconds < previous) {
      bestTimes[id] = seconds;
      safeSetTimes(bestTimes);
      return { isNewBest: true, previous };
    }
    return { isNewBest: false, previous };
  }

  function resetProgress() {
    unlocked = 1;
    bestTimes = {};
    safeSet(unlocked);
    safeSetTimes(bestTimes);
  }

  function byId(id) { return PW.LEVELS.find(l => l.id === id); }

  return { getUnlocked, isUnlocked, completeLevel, getBestTime, recordTime, resetProgress, byId };
})();
