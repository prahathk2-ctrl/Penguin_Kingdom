// Headless smoke test for Penguin Wars. Loads the actual game source
// files into a minimal vm sandbox (stubbed DOM/canvas/audio/localStorage)
// and runs many simulated ticks to catch runtime errors, plus targeted
// unit checks for the level system and the upgrade mechanics.
const vm = require("vm");
const fs = require("fs");
const path = require("path");

function makeCtxStub() {
  return {
    fillRect(){}, strokeRect(){}, clearRect(){},
    beginPath(){}, moveTo(){}, lineTo(){}, closePath(){},
    fill(){}, stroke(){}, arc(){}, setLineDash(){},
    save(){}, restore(){}, translate(){}, scale(){},
    fillText(){}, measureText(){ return { width: 10 }; },
    createPattern(){ return "pattern-stub"; },
    createRadialGradient(){ return { addColorStop(){} }; },
    drawImage(){}
  };
}

function makeCanvasStub() {
  const ctx = makeCtxStub();
  return {
    width: 1000, height: 650,
    style: {},
    getContext() { return ctx; },
    getBoundingClientRect() { return { width: 1000, height: 650, left: 0, top: 0 }; },
    addEventListener() {}, removeEventListener() {}
  };
}

function makeLocalStorageStub() {
  const store = new Map();
  return {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); }
  };
}

const sandbox = {};
sandbox.window = sandbox;
sandbox.console = console;
sandbox.performance = { now: () => Date.now() };
sandbox.Math = Math;
sandbox.matchMedia = () => ({ matches: false });
sandbox.window.matchMedia = sandbox.matchMedia;
sandbox.window.addEventListener = () => {};
sandbox.window.removeEventListener = () => {};
sandbox.window.localStorage = makeLocalStorageStub();
sandbox.devicePixelRatio = 1;
sandbox.requestAnimationFrame = (fn) => setTimeout(fn, 0);
sandbox.document = {
  createElement(tag) {
    if (tag === "canvas") return makeCanvasStub();
    return { style: {}, getContext(){ return makeCtxStub(); } };
  }
};

vm.createContext(sandbox);

const files = ["utils.js", "audio.js", "levels.js", "territory.js", "flock.js", "maps.js", "ai.js", "renderer.js", "game.js"];
const src = files.map(f => fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8")).join("\n;\n");
vm.runInContext(src, sandbox, { filename: "bundle.js" });

const PW = sandbox.PW;
PW.audio.setMuted(true);

let failures = 0;
function check(name, cond) {
  if (cond) { console.log(`  ok  - ${name}`); }
  else { console.error(`  FAIL - ${name}`); failures++; }
}

// ---------------------------------------------------------------- unit: levels
console.log("\n--- Level / progress unit checks ---");
PW.levels.resetProgress();
check("level 1 starts unlocked", PW.levels.isUnlocked(1));
check("level 2 starts locked", !PW.levels.isUnlocked(2));
PW.levels.completeLevel(1);
check("completing level 1 unlocks level 2", PW.levels.isUnlocked(2));
check("level 3 still locked after only completing 1", !PW.levels.isUnlocked(3));
check("there are 50 levels", PW.LEVELS.length === 50);
PW.levels.resetProgress();
check("reset goes back to only level 1 unlocked", PW.levels.isUnlocked(1) && !PW.levels.isUnlocked(2));

console.log("\n--- Best-time tracking unit checks ---");
PW.levels.resetProgress();
check("no best time recorded initially", PW.levels.getBestTime(1) === null);
let rec = PW.levels.recordTime(1, 90.4);
check("first recorded time is a new best", rec.isNewBest === true && PW.levels.getBestTime(1) === 90.4);
rec = PW.levels.recordTime(1, 120);
check("a slower time is not a new best and doesn't overwrite", rec.isNewBest === false && PW.levels.getBestTime(1) === 90.4);
rec = PW.levels.recordTime(1, 75.2);
check("a faster time becomes the new best", rec.isNewBest === true && PW.levels.getBestTime(1) === 75.2);
PW.levels.resetProgress();
check("resetProgress clears best times too", PW.levels.getBestTime(1) === null);

// ---------------------------------------------------------------- unit: campaign scaling
console.log("\n--- Campaign scaling checks (level 1 -> level 50) ---");
{
  const l1 = PW.levels.byId(1);
  const l50 = PW.levels.byId(50);
  console.log(`  level 1:  aiCount=${l1.aiCount} territories=${l1.territoryCount} world=${l1.worldW}x${l1.worldH} weather=${l1.weatherOn}`);
  console.log(`  level 50: aiCount=${l50.aiCount} territories=${l50.territoryCount} world=${l50.worldW}x${l50.worldH} weather=${l50.weatherOn}`);
  check("level 1 has exactly one rival", l1.aiCount === 1);
  check("level 1 has no weather", l1.weatherOn === false);
  check("level 50 has dozens of rivals (>=24)", l50.aiCount >= 24);
  check("level 50 has hundreds of territories (>=200)", l50.territoryCount >= 200);
  check("level 50's map is physically bigger than level 1's", l50.worldW > l1.worldW * 3);
  check("aiCount is non-decreasing across the whole campaign", PW.LEVELS.every((lv, i) => i === 0 || lv.aiCount >= PW.LEVELS[i - 1].aiCount));
  check("territoryCount is non-decreasing across the whole campaign", PW.LEVELS.every((lv, i) => i === 0 || lv.territoryCount >= PW.LEVELS[i - 1].territoryCount));
  check("level 50 is dominated by Commander-tier weighting", l50.tierWeights.commander > l50.tierWeights.rookie);
}

console.log("\n--- Bot color generation checks ---");
{
  const colors35 = PW.utils.generateBotColors(35);
  check("generateBotColors returns the requested count", colors35.length === 35);
  check("generateBotColors(35) produces mostly-distinct hues", new Set(colors35).size >= 30);
  const colors1 = PW.utils.generateBotColors(1);
  check("generateBotColors handles a single bot", colors1.length === 1);
}
console.log("\n--- AI weightedTier distribution check (2000 samples) ---");
{
  const weights = { rookie: 0.2, veteran: 0.3, commander: 0.5 };
  const counts = { rookie: 0, veteran: 0, commander: 0 };
  for (let i = 0; i < 2000; i++) counts[PW.ai.weightedTier(weights)]++;
  const pCommander = counts.commander / 2000;
  console.log("  distribution:", counts);
  check("commander tier roughly ~50% (within 10pts)", Math.abs(pCommander - 0.5) < 0.1);
  check("weightedTier() with all-zero weights falls back safely", PW.ai.weightedTier({ rookie: 0, veteran: 0, commander: 0 }) === "rookie");
}

// ---------------------------------------------------------------- unit: territory upgrades
console.log("\n--- Territory upgrade unit checks ---");
{
  const t = new PW.Territory({ id: "x1", x: 0, y: 0, size: "village", owner: "player", population: 1000 });
  const baseGrowth = t.growthEffective();
  const popBefore = t.population;
  const cost0 = t.upgradeCost(0);
  const ok1 = t.tryUpgradeProduction();
  check("first production upgrade succeeds when affordable", ok1 === true);
  check("production upgrade deducts the right cost", Math.abs((popBefore - cost0) - t.population) < 1e-6);
  check("production upgrade increases effective growth rate", t.growthEffective() > baseGrowth);

  for (let i = 0; i < 10; i++) t.tryUpgradeProduction(); // try to overshoot the cap
  check(`production level caps at ${PW.MAX_UPGRADE_LEVEL}`, t.productionLevel === PW.MAX_UPGRADE_LEVEL);
  check("cannot upgrade production further once capped", t.tryUpgradeProduction() === false);

  const baseMaxPop = t.maxPopEffective();
  t.tryUpgradeStorage();
  check("storage upgrade increases the population cap", t.maxPopEffective() > baseMaxPop);

  const baseSpeed = t.speedMultiplier();
  t.tryUpgradeSpeed();
  check("speed upgrade increases the speed multiplier", t.speedMultiplier() > baseSpeed);

  const poor = new PW.Territory({ id: "x2", x: 0, y: 0, size: "outpost", owner: "player", population: 2 });
  check("upgrade fails when population can't afford the cost", poor.tryUpgradeDefense() === false);
}

console.log("\n--- Defense factor combat unit checks ---");
{
  const now = 1000;
  const defended = new PW.Territory({ id: "d1", x: 0, y: 0, size: "village", owner: "bot0", population: 100 });
  defended.defenseLevel = 3; // factor = 1.6, effective defense = 160
  const capturedByWeakAttack = defended.resolveAttack("player", 150, now);
  check("an attack weaker than boosted defense fails to capture", capturedByWeakAttack === false);
  check("a failed attack still costs the defender population", defended.population < 100);

  const undefended = new PW.Territory({ id: "d2", x: 0, y: 0, size: "village", owner: "bot0", population: 100 });
  const capturedByWeakAttack2 = undefended.resolveAttack("player", 150, now);
  check("the same attack succeeds against an undefended territory", capturedByWeakAttack2 === true);

  const fortified = new PW.Territory({ id: "d3", x: 0, y: 0, size: "village", owner: "bot0", population: 50 });
  fortified.productionLevel = 2;
  fortified.defenseLevel = 2;
  const captured = fortified.resolveAttack("player", 1000, now);
  check("a strong enough attack still captures a fortified territory", captured === true);
  check("capturing a territory resets its production level", fortified.productionLevel === 0);
  check("capturing a territory resets its defense level", fortified.defenseLevel === 0);
}

// ---------------------------------------------------------------- full sim runs using real level configs
console.log("\n--- Full simulation runs (using real PW.LEVELS configs) ---");
const levelIdsToTest = [1, 25, 50];
levelIdsToTest.forEach((id) => {
  const cfg = PW.levels.byId(id);
  console.log(`\n--- Level ${id}: ${cfg.name} (${JSON.stringify({ mapType: cfg.mapType, mapSize: cfg.mapSize, aiCount: cfg.aiCount, weatherOn: cfg.weatherOn })}) ---`);
  try {
    const canvas = makeCanvasStub();
    const wrap = { getBoundingClientRect() { return { width: 1000, height: 650 }; } };
    const game = new PW.Game(canvas, wrap, { ...cfg });

    console.log(`territories: ${game.territories.length}, bots: ${game.bots.length}`);
    if (game.territories.length < cfg.aiCount + 1) {
      console.error("FAIL: not enough territories for all factions");
      failures++;
    }

    let hudCalls = 0, gameOverResult = null;
    game.on("hud", () => hudCalls++);
    game.on("gameOver", (payload) => { gameOverResult = payload; });

    // Exercise player upgrade controls early, like a real (if passive) player would.
    const playerStart = game.territories.find(t => t.owner === "player");
    game.selection = new Set([playerStart.id]);

    const dt = 0.1;
    let ticks = 0;
    const maxTicks = 12000; // 1200 simulated seconds
    while (!game.ended && ticks < maxTicks) {
      game.update(dt);
      if (ticks === 50) {
        const grew = game.upgradeSelected("production");
        console.log(`manual upgradeSelected('production') at t=5s -> ${grew}`);
      }
      if (ticks % 5 === 0) game.render(performance.now());
      for (const t of game.territories) {
        if (!(t.population >= -0.001)) throw new Error(`Negative population on ${t.id}: ${t.population}`);
        if (!isFinite(t.population)) throw new Error(`Non-finite population on ${t.id}`);
        for (const track of PW.UPGRADE_TRACKS) {
          const lvl = t[`${track}Level`];
          if (lvl < 0 || lvl > PW.MAX_UPGRADE_LEVEL) throw new Error(`Bad ${track}Level on ${t.id}`);
        }
      }
      ticks++;
    }

    console.log(`ticks: ${ticks}, ended: ${game.ended}, hudCalls: ${hudCalls}`);
    if (gameOverResult) {
      console.log(`result: ${gameOverResult.result}, stats: ${JSON.stringify(gameOverResult.stats)}`);
      if (gameOverResult.result === "victory") {
        PW.levels.completeLevel(id);
        console.log(`level ${id} completed -> unlocked now ${PW.levels.getUnlocked()}`);
      }
    } else {
      console.log("WARN: game did not end within simulated time (may be okay for large maps)");
    }
  } catch (err) {
    console.error("FAIL:", err.stack);
    failures++;
  }
});

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
