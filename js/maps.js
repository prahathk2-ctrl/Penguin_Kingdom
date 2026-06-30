// ===================== maps.js =====================
// Procedural map generation. Produces a list of Territory instances laid
// out according to the chosen map type, plus assigns starting colonies
// for the player and every AI bot, spread fairly across the map.

PW.maps = (() => {
  const { rand, randInt, dist, placePoints } = PW.utils;

  const WORLD_DIMS = {
    small:  { w: 900,  h: 560 },
    medium: { w: 1100, h: 680 },
    large:  { w: 1300, h: 800 }
  };

  const BASE_COUNT = { small: 10, medium: 18, large: 28 };

  const SIZE_WEIGHTS = {
    continent:   { outpost: 0.30, village: 0.45, city: 0.25 },
    archipelago: { outpost: 0.45, village: 0.40, city: 0.15 },
    icebergs:    { outpost: 0.60, village: 0.30, city: 0.10 },
    random:      { outpost: 0.40, village: 0.40, city: 0.20 }
  };

  function weightedSize(mapType) {
    const w = SIZE_WEIGHTS[mapType] || SIZE_WEIGHTS.random;
    const r = Math.random();
    if (r < w.outpost) return "outpost";
    if (r < w.outpost + w.village) return "village";
    return "city";
  }

  function pointsForType(mapType, count, w, h) {
    const margin = 60;
    switch (mapType) {
      case "continent": {
        const cx = w / 2, cy = h / 2;
        const rx = w * 0.40, ry = h * 0.38;
        const minDist = Math.max(46, Math.min(w, h) / Math.sqrt(count) * 0.85);
        return placePoints(count, minDist, () => {
          const a = rand(0, Math.PI * 2);
          const r = Math.sqrt(Math.random());
          return { x: cx + Math.cos(a) * rx * r, y: cy + Math.sin(a) * ry * r };
        });
      }
      case "archipelago": {
        const clusterCount = Math.max(3, Math.ceil(count / 3));
        const clusterMinDist = Math.min(w, h) / Math.sqrt(clusterCount) * 0.9;
        const clusters = placePoints(clusterCount, clusterMinDist, () => ({
          x: rand(margin + 40, w - margin - 40),
          y: rand(margin + 40, h - margin - 40)
        }));
        const minDist = 42;
        const pts = [];
        let ci = 0;
        let guard = 0;
        while (pts.length < count && guard < count * 60) {
          guard++;
          const c = clusters[ci % clusters.length];
          ci++;
          const a = rand(0, Math.PI * 2);
          const r = rand(0, 55);
          const p = { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
          if (p.x < margin || p.x > w - margin || p.y < margin || p.y > h - margin) continue;
          let ok = true;
          for (const q of pts) if (dist(p.x, p.y, q.x, q.y) < minDist) { ok = false; break; }
          if (ok) pts.push(p);
        }
        return pts;
      }
      case "icebergs": {
        const minDist = Math.max(38, Math.min(w, h) / Math.sqrt(count) * 0.62);
        return placePoints(count, minDist, () => ({
          x: rand(margin, w - margin),
          y: rand(margin, h - margin)
        }));
      }
      default: { // random
        const minDist = Math.max(44, Math.min(w, h) / Math.sqrt(count) * 0.78);
        return placePoints(count, minDist, () => ({
          x: rand(margin, w - margin),
          y: rand(margin, h - margin)
        }));
      }
    }
  }

  function startingPopulation(size) {
    const cfg = PW.SIZE_CONFIG[size];
    return Math.round(cfg.maxPop * 0.35);
  }

  function neutralPopulation(size, neutralMultiplier) {
    let base;
    if (size === "outpost") base = randInt(8, 26);
    else if (size === "village") base = randInt(20, 55);
    else base = randInt(45, 90); // city
    return Math.round(base * (neutralMultiplier || 1));
  }

  /**
   * @param {object} opts
   * @param {'continent'|'archipelago'|'icebergs'|'random'} opts.mapType
   * @param {'small'|'medium'|'large'} [opts.mapSize] fallback size lookup, ignored if territoryCount/worldW/worldH given
   * @param {number} opts.aiCount
   * @param {string[]} opts.botColors  colors for each bot, length === aiCount
   * @param {number} [opts.neutralMultiplier] scales neutral garrison size (level difficulty knob)
   * @param {number} [opts.botHeadstart] scales bot (not player) starting population (level difficulty knob)
   * @param {number} [opts.territoryCount] explicit total territory count, overrides mapSize lookup
   * @param {number} [opts.worldW] explicit world width, overrides mapSize lookup
   * @param {number} [opts.worldH] explicit world height, overrides mapSize lookup
   */
  function generateMap({
    mapType, mapSize, aiCount, botColors,
    neutralMultiplier = 1, botHeadstart = 1,
    territoryCount, worldW, worldH
  }) {
    const fallbackDims = WORLD_DIMS[mapSize] || WORLD_DIMS.medium;
    const dims = {
      w: worldW || fallbackDims.w,
      h: worldH || fallbackDims.h
    };
    const minNeeded = aiCount + 1 + 3; // player + bots + a few neutrals
    const count = Math.max(territoryCount || BASE_COUNT[mapSize] || 18, minNeeded);

    let points = pointsForType(mapType, count, dims.w, dims.h);
    // Rejection sampling can occasionally fall short on tight maps — pad
    // with simple uniform points so we never end up with too few colonies.
    let guard = 0;
    while (points.length < minNeeded && guard < 2000) {
      guard++;
      const p = { x: rand(60, dims.w - 60), y: rand(60, dims.h - 60) };
      let ok = true;
      for (const q of points) if (dist(p.x, p.y, q.x, q.y) < 36) { ok = false; break; }
      if (ok) points.push(p);
    }

    // Greedy farthest-point selection so the player + every bot start
    // spread out fairly across the map instead of clumping together.
    const starts = [];
    const firstIdx = randInt(0, points.length - 1);
    starts.push(points[firstIdx]);
    const used = new Set([firstIdx]);
    while (starts.length < aiCount + 1) {
      let bestIdx = -1, bestScore = -1;
      for (let i = 0; i < points.length; i++) {
        if (used.has(i)) continue;
        let minD = Infinity;
        for (const s of starts) minD = Math.min(minD, dist(points[i].x, points[i].y, s.x, s.y));
        if (minD > bestScore) { bestScore = minD; bestIdx = i; }
      }
      if (bestIdx === -1) break;
      used.add(bestIdx);
      starts.push(points[bestIdx]);
    }

    const territories = [];
    let tIdx = 0;
    const startSet = new Set(starts);

    points.forEach((p) => {
      const id = `t${tIdx++}`;
      const isStart = startSet.has(p);
      let size = weightedSize(mapType);
      if (isStart && size === "outpost") size = "village"; // give every base a fair size

      const population = neutralPopulation(size, neutralMultiplier);
      territories.push(new PW.Territory({ id, x: p.x, y: p.y, size, owner: null, population }));
    });

    // Assign player + bot ownership to the chosen start territories by
    // matching coordinates back to the created Territory objects.
    const findTerritoryAt = (pt) => territories.find(t => t.x === pt.x && t.y === pt.y);

    const playerStart = findTerritoryAt(starts[0]);
    playerStart.owner = "player";
    playerStart.population = startingPopulation(playerStart.size);

    const botStarts = [];
    for (let i = 0; i < aiCount; i++) {
      const t = findTerritoryAt(starts[i + 1]);
      const botId = `bot${i}`;
      t.owner = botId;
      t.population = Math.round(startingPopulation(t.size) * botHeadstart);
      botStarts.push({ id: botId, color: botColors[i % botColors.length], homeTerritoryId: t.id });
    }

    return {
      worldW: dims.w,
      worldH: dims.h,
      mapType,
      mapSize,
      territories,
      botStarts
    };
  }

  return { generateMap };
})();
