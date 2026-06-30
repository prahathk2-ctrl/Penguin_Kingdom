// ===================== territory.js =====================
// A Territory is a single colony/outpost on the map. Owned territories
// continuously produce penguins; neutral ones sit static until captured.
//
// Each owned territory can independently invest its own population into
// four upgrade tracks (no separate currency — everything costs penguins):
//   Production — faster growth rate
//   Storage    — higher population cap
//   Defense    — harder to conquer, smaller losses on a repelled attack
//   Speed      — flocks launched from here travel faster

PW.SIZE_CONFIG = {
  outpost: { radius: 16, maxPop: 90,  growth: 2.2, upgradeBaseCost: 16 },
  village: { radius: 22, maxPop: 200, growth: 4.2, upgradeBaseCost: 28 },
  city:    { radius: 29, maxPop: 380, growth: 7.0, upgradeBaseCost: 44 }
};

PW.MAX_UPGRADE_LEVEL = 3;
PW.UPGRADE_TRACKS = ["production", "storage", "defense", "speed"];

PW.Territory = class Territory {
  /**
   * @param {object} opts
   * @param {string} opts.id
   * @param {number} opts.x world-space x
   * @param {number} opts.y world-space y
   * @param {'outpost'|'village'|'city'} opts.size
   * @param {string|null} opts.owner  null = neutral, 'player', or bot id
   * @param {number} opts.population starting population
   */
  constructor({ id, x, y, size, owner = null, population = 0 }) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.size = size;
    this.owner = owner;
    this.population = population;

    const cfg = PW.SIZE_CONFIG[size];
    this.radius = cfg.radius;
    this.baseMaxPop = cfg.maxPop;
    this.baseGrowth = cfg.growth;
    this.upgradeBaseCost = cfg.upgradeBaseCost;

    this.productionLevel = 0;
    this.storageLevel = 0;
    this.defenseLevel = 0;
    this.speedLevel = 0;

    // Visual/animation state, not gameplay-relevant.
    this.pulse = Math.random() * Math.PI * 2;
    this.flashUntil = 0;      // ms timestamp; territory flashes white briefly on combat
    this.lastDelta = 0;       // last population swing, for floating +/- text
    this.lastDeltaAt = 0;
  }

  isNeutral() { return this.owner === null; }

  maxPopEffective() { return Math.round(this.baseMaxPop * (1 + 0.25 * this.storageLevel)); }
  growthEffective() { return this.baseGrowth * (1 + 0.3 * this.productionLevel); }
  defenseFactor() { return 1 + 0.2 * this.defenseLevel; }
  speedMultiplier() { return 1 + 0.15 * this.speedLevel; }

  update(dt) {
    this.pulse += dt;
    if (this.owner !== null && this.population < this.maxPopEffective()) {
      this.population = Math.min(this.maxPopEffective(), this.population + this.growthEffective() * dt);
    }
  }

  // Garrison reinforcement from a friendly flock.
  reinforce(amount) {
    this.population += amount;
    this.lastDelta = Math.round(amount);
    this.lastDeltaAt = performance.now();
  }

  upgradeCost(level) {
    return Math.round(this.upgradeBaseCost * (level + 1));
  }

  canUpgrade(track) {
    const level = this[`${track}Level`];
    return level < PW.MAX_UPGRADE_LEVEL && this.population >= this.upgradeCost(level);
  }

  // Returns true if the upgrade was applied (cost deducted, level raised).
  tryUpgrade(track) {
    if (!this.canUpgrade(track)) return false;
    const key = `${track}Level`;
    this.population -= this.upgradeCost(this[key]);
    this[key]++;
    return true;
  }

  canUpgradeProduction() { return this.canUpgrade("production"); }
  canUpgradeStorage() { return this.canUpgrade("storage"); }
  canUpgradeDefense() { return this.canUpgrade("defense"); }
  canUpgradeSpeed() { return this.canUpgrade("speed"); }
  tryUpgradeProduction() { return this.tryUpgrade("production"); }
  tryUpgradeStorage() { return this.tryUpgrade("storage"); }
  tryUpgradeDefense() { return this.tryUpgrade("defense"); }
  tryUpgradeSpeed() { return this.tryUpgrade("speed"); }

  // Returns true if the territory changed owner as a result of the attack.
  // Defense level multiplies effective defending strength; a successful
  // defense also reduces real losses proportionally to that same factor.
  resolveAttack(attackerOwner, attackerAmount, now) {
    this.flashUntil = now + 260;
    const factor = this.defenseFactor();
    const effectiveDefense = this.population * factor;

    if (attackerAmount > effectiveDefense) {
      const survivors = attackerAmount - effectiveDefense;
      this.owner = attackerOwner;
      this.population = survivors;
      // Captured infrastructure is lost / needs rebuilding under new management.
      this.productionLevel = 0;
      this.storageLevel = 0;
      this.defenseLevel = 0;
      this.speedLevel = 0;
      this.lastDelta = Math.round(survivors);
      this.lastDeltaAt = now;
      return true;
    } else {
      this.population = Math.max(0, this.population - attackerAmount / factor);
      this.lastDelta = -Math.round(attackerAmount / factor);
      this.lastDeltaAt = now;
      return false;
    }
  }
};
