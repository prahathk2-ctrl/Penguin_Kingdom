// ===================== ai.js =====================
// Decision-making for computer-controlled colonies. Three difficulty
// tiers (Rookie / Veteran / Commander) trade off how often a bot thinks,
// how cautious its attacks are, and whether it reinforces threatened
// borders. "Mixed" difficulty just hands out a random tier per bot.

PW.ai = (() => {
  const { dist, randInt, rand } = PW.utils;

  const TIERS = {
    rookie: {
      label: "Rookie",
      thinkInterval: 3.0,
      attackMargin: 0.85,     // will sometimes attack at a slight disadvantage
      gambleChance: 0.30,     // chance to ignore the strength check entirely
      sendFraction: 0.6,
      sourcesPerThink: 1,
      reinforceChance: 0.0,
      neutralBias: 0.85
    },
    veteran: {
      label: "Veteran",
      thinkInterval: 1.9,
      attackMargin: 1.12,
      gambleChance: 0.06,
      sendFraction: 0.55,
      sourcesPerThink: 1,
      reinforceChance: 0.5,
      neutralBias: 0.7
    },
    commander: {
      label: "Commander",
      thinkInterval: 1.1,
      attackMargin: 1.22,
      gambleChance: 0.02,
      sendFraction: 0.6,
      sourcesPerThink: 2,
      reinforceChance: 1.0,
      neutralBias: 0.55
    }
  };

  PW.AI_TIERS = TIERS;

  class AIController {
    constructor(botId, tierName, color) {
      this.botId = botId;
      this.tierName = tierName;
      this.tier = TIERS[tierName] || TIERS.veteran;
      this.color = color;
      this.timer = rand(0.3, this.tier.thinkInterval);
    }

    update(dt, game) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = this.tier.thinkInterval * rand(0.75, 1.25);
        this.think(game);
      }
    }

    myTerritories(game) {
      return game.territories.filter(t => t.owner === this.botId);
    }

    think(game) {
      const mine = this.myTerritories(game);
      if (mine.length === 0) return; // eliminated, nothing to do

      if (this.tier.reinforceChance > 0 && Math.random() < this.tier.reinforceChance) {
        this.tryReinforce(game, mine);
      }

      const sources = mine
        .filter(t => t.population > 6)
        .sort((a, b) => b.population - a.population)
        .slice(0, this.tier.sourcesPerThink);

      for (const source of sources) {
        const target = this.pickTarget(game, source);
        if (!target) continue;
        const amount = Math.floor(source.population * this.tier.sendFraction);
        if (amount < 1) continue;
        game.requestSend(source.id, target.id, amount, this.botId, this.color);
      }
    }

    pickTarget(game, source) {
      const candidates = game.territories.filter(t => t.owner !== this.botId);
      if (candidates.length === 0) return null;

      const earlyGame = game.elapsed < 50;
      let best = null, bestScore = Infinity;

      for (const t of candidates) {
        const d = dist(source.x, source.y, t.x, t.y);
        const required = t.population * this.tier.attackMargin + 1;
        const available = source.population * this.tier.sendFraction;

        const canWinCleanly = available >= required;
        const gamble = !canWinCleanly && Math.random() < this.tier.gambleChance;
        if (!canWinCleanly && !gamble) continue;

        let score = d * (t.population + 5);
        if (t.isNeutral()) score *= this.tier.neutralBias;
        if (earlyGame && t.isNeutral()) score *= 0.7;
        // Commander-tier bots are a little more willing to press the human player.
        if (t.owner === "player" && this.tierName === "commander") score *= 0.92;

        if (score < bestScore) { bestScore = score; best = t; }
      }
      return best;
    }

    // Look for incoming attacks this bot can't survive, and try to rush
    // reinforcements in from a nearby owned territory.
    tryReinforce(game, mine) {
      const threatened = new Map(); // territoryId -> total incoming hostile amount

      for (const f of game.flocks) {
        if (f.owner === this.botId) continue;
        const target = game.territoryById(f.toId);
        if (!target || target.owner !== this.botId) continue;
        threatened.set(target.id, (threatened.get(target.id) || 0) + f.amount);
      }

      threatened.forEach((incoming, territoryId) => {
        const target = game.territoryById(territoryId);
        if (!target) return;
        const deficit = incoming - target.population;
        if (deficit <= 0) return; // already safe

        let helper = null, helperDist = Infinity;
        for (const t of mine) {
          if (t.id === territoryId) continue;
          if (t.population < 10) continue;
          const d = dist(t.x, t.y, target.x, target.y);
          if (d < helperDist) { helperDist = d; helper = t; }
        }
        if (!helper) return;
        const amount = Math.min(Math.floor(helper.population * 0.6), Math.ceil(deficit + 5));
        if (amount >= 1) {
          game.requestSend(helper.id, target.id, amount, this.botId, this.color);
        }
      });
    }
  }

  function randomTier() {
    const names = Object.keys(TIERS);
    return names[randInt(0, names.length - 1)];
  }

  // Pick a tier name given a weights object like {rookie: 0.5, veteran: 0.5}.
  // Falls back to "rookie" if weights are missing or all zero.
  function weightedTier(weights) {
    if (!weights) return "rookie";
    const entries = Object.entries(weights).filter(([, w]) => w > 0);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    if (total <= 0) return "rookie";
    let r = rand(0, total);
    for (const [name, w] of entries) {
      if (r < w) return name;
      r -= w;
    }
    return entries[entries.length - 1][0];
  }

  return { AIController, TIERS, randomTier, weightedTier };
})();
