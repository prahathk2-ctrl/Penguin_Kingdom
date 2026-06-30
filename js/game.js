// ===================== game.js =====================
// The Game class owns the simulation (territories, flocks, bots, weather)
// and the canvas render loop. It exposes a small set of `callbacks` that
// main.js hooks up to the surrounding DOM/HUD.

PW.COLONY_NAMES = [
  "Icefin Colony", "Frostbeak Clan", "Glacier Watch", "Blizzard Horde",
  "Frozen Talon", "Snowdrift Legion", "Permafrost Guard", "Aurora Pack"
];

PW.Game = class Game {
  constructor(canvas, wrapEl, options) {
    this.canvas = canvas;
    this.wrapEl = wrapEl;
    this.ctx = canvas.getContext("2d");
    this.options = options;
    this.callbacks = {};

    this.reducedMotion = window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.sendPercent = 50;
    this.selection = new Set();
    this.hover = { x: null, y: null };
    this.hoverTargetId = null;

    this.isPointerDown = false;
    this.dragActive = false;
    this.dragBox = null;
    this.pointerDownWorldPos = null;
    this.pointerDownClient = null;
    this.shiftAtDown = false;

    this.elapsed = 0;
    this.ended = false;
    this.paused = false;
    this.running = false;
    this.lastTs = null;
    this._hudAccum = 0;
    this.flockSeq = 0;
    this.flocks = [];

    this.stats = { captures: 0, lost: 0, peakTerritories: 1 };

    this.blizzardEnabled = options.weatherOn;
    this.blizzard = {
      active: false,
      endAt: 0,
      nextAt: PW.utils.rand(28, 55)
    };

    this._setupMap();
    this._setupBots();
    this._initSnow();
    this.bgPattern = PW.renderer.createIcePattern(this.ctx);

    this.colorOf = this.colorOf.bind(this);
    this.loop = this.loop.bind(this);

    this._bindInput();
    this._resizeCanvas();
    this._resizeHandler = () => this._resizeCanvas();
    window.addEventListener("resize", this._resizeHandler);

    // Convenience: start with the player's home colony selected.
    const home = this.territories.find(t => t.owner === "player");
    if (home) this.selection.add(home.id);
  }

  on(name, fn) { this.callbacks[name] = fn; }
  _emit(name, payload) { if (this.callbacks[name]) this.callbacks[name](payload); }

  // ---------------------------------------------------------------- setup

  _setupMap() {
    const result = PW.maps.generateMap({
      mapType: this.options.mapType,
      mapSize: this.options.mapSize,
      aiCount: this.options.aiCount,
      botColors: PW.utils.generateBotColors(this.options.aiCount),
      neutralMultiplier: this.options.neutralMultiplier || 1,
      botHeadstart: this.options.botHeadstart || 1,
      territoryCount: this.options.territoryCount,
      worldW: this.options.worldW,
      worldH: this.options.worldH
    });
    this.worldW = result.worldW;
    this.worldH = result.worldH;
    this.territories = result.territories;
    this.botStarts = result.botStarts;
    this.tMap = new Map(this.territories.map(t => [t.id, t]));
  }

  _setupBots() {
    const tierWeights = this.options.tierWeights || { rookie: 0.34, veteran: 0.33, commander: 0.33 };
    this.botMeta = new Map();
    this.bots = this.botStarts.map((b, i) => {
      const tier = PW.ai.weightedTier(tierWeights);
      this.botMeta.set(b.id, {
        color: b.color,
        name: PW.COLONY_NAMES[i % PW.COLONY_NAMES.length],
        tierLabel: PW.ai.TIERS[tier].label
      });
      return new PW.ai.AIController(b.id, tier, b.color);
    });
  }

  _initSnow() {
    const count = this.reducedMotion ? 18 : 70;
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: PW.utils.rand(0, this.worldW),
        y: PW.utils.rand(0, this.worldH),
        size: PW.utils.choice([1, 1, 2]),
        speed: this.reducedMotion ? 0 : PW.utils.rand(8, 26),
        alpha: PW.utils.rand(0.25, 0.7)
      });
    }
  }

  colorOf(owner) {
    if (owner === "player") return PW.utils.PALETTE.iceBlue;
    if (owner === null) return PW.utils.PALETTE.neutral;
    const meta = this.botMeta.get(owner);
    return meta ? meta.color : PW.utils.PALETTE.neutral;
  }

  territoryById(id) { return this.tMap.get(id); }

  // ---------------------------------------------------------------- input

  _resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.wrapEl.getBoundingClientRect();
    const w = Math.max(200, Math.round(rect.width * dpr));
    const h = Math.max(200, Math.round(rect.height * dpr));
    this.canvas.width = w;
    this.canvas.height = h;
    this._computeCamera(w, h);
  }

  _computeCamera(w, h) {
    const scale = Math.min(w / this.worldW, h / this.worldH);
    const offsetX = (w - this.worldW * scale) / 2;
    const offsetY = (h - this.worldH * scale) / 2;
    this.camera = { scale, offsetX, offsetY };
  }

  _getCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * this.canvas.width;
    const cy = ((e.clientY - rect.top) / rect.height) * this.canvas.height;
    return { cx, cy };
  }

  _screenToWorld(cx, cy) {
    const { scale, offsetX, offsetY } = this.camera;
    return { x: (cx - offsetX) / scale, y: (cy - offsetY) / scale };
  }

  findTerritoryAtWorld(pos) {
    let best = null, bestDist = Infinity;
    const zoomMargin = Math.max(7, 11 / (this.camera.scale || 1));
    for (const t of this.territories) {
      const d = PW.utils.dist(pos.x, pos.y, t.x, t.y);
      const hitR = t.radius + zoomMargin;
      if (d <= hitR && d < bestDist) { best = t; bestDist = d; }
    }
    return best;
  }

  _bindInput() {
    const canvas = this.canvas;

    const down = (e) => {
      if (this.paused || this.ended) return;
      const { cx, cy } = this._getCanvasPos(e);
      const pos = this._screenToWorld(cx, cy);
      this.isPointerDown = true;
      this.dragActive = false;
      this.pointerDownWorldPos = pos;
      this.pointerDownClient = { x: e.clientX, y: e.clientY };
      this.shiftAtDown = !!e.shiftKey;
      this.dragBox = { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y };
      e.preventDefault();
    };

    const move = (e) => {
      const { cx, cy } = this._getCanvasPos(e);
      const pos = this._screenToWorld(cx, cy);
      this.hover = pos;
      const hoverT = this.findTerritoryAtWorld(pos);
      this.hoverTargetId = hoverT ? hoverT.id : null;

      if (!this.isPointerDown) return;
      this.dragBox.x2 = pos.x;
      this.dragBox.y2 = pos.y;
      const dx = e.clientX - this.pointerDownClient.x;
      const dy = e.clientY - this.pointerDownClient.y;
      if (Math.sqrt(dx * dx + dy * dy) > 6) this.dragActive = true;
    };

    const up = (e) => {
      if (!this.isPointerDown) return;
      this.isPointerDown = false;
      if (this.paused || this.ended) { this.dragActive = false; this.dragBox = null; return; }

      if (this.dragActive) {
        const box = this.dragBox;
        const x1 = Math.min(box.x1, box.x2), x2 = Math.max(box.x1, box.x2);
        const y1 = Math.min(box.y1, box.y2), y2 = Math.max(box.y1, box.y2);
        const matches = this.territories.filter(t =>
          t.owner === "player" && t.x >= x1 && t.x <= x2 && t.y >= y1 && t.y <= y2
        );
        if (matches.length > 0) {
          if (this.shiftAtDown) matches.forEach(t => this.selection.add(t.id));
          else this.selection = new Set(matches.map(t => t.id));
          PW.audio.select();
        } else if (!this.shiftAtDown) {
          this.selection.clear();
        }
      } else {
        const hit = this.findTerritoryAtWorld(this.pointerDownWorldPos);
        if (!hit) {
          if (!this.shiftAtDown) this.selection.clear();
        } else if (this.selection.size === 0) {
          if (hit.owner === "player") {
            this.selection.add(hit.id);
            PW.audio.select();
          }
        } else if (this.shiftAtDown && hit.owner === "player") {
          if (this.selection.has(hit.id)) this.selection.delete(hit.id);
          else this.selection.add(hit.id);
        } else {
          const sent = this.sendFromSelection(hit.id);
          if (sent) PW.audio.sendFlock();
        }
      }
      this.dragActive = false;
      this.dragBox = null;
    };

    canvas.addEventListener("mousedown", down);
    canvas.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);

    canvas.addEventListener("touchstart", (e) => { down(e.touches[0]); }, { passive: false });
    canvas.addEventListener("touchmove", (e) => { move(e.touches[0]); e.preventDefault(); }, { passive: false });
    canvas.addEventListener("touchend", (e) => {
      const t = e.changedTouches[0];
      up({ clientX: t.clientX, clientY: t.clientY });
    });

    this._keyHandler = (e) => {
      if (this.ended) return;
      const key = e.key.toLowerCase();
      if (e.key === "Escape") { this.selection.clear(); }
      else if (key === "a") {
        this.territories.forEach(t => { if (t.owner === "player") this.selection.add(t.id); });
      } else if (["1", "2", "3", "4"].includes(e.key)) {
        const map = { "1": 25, "2": 50, "3": 75, "4": 100 };
        this.setSendPercent(map[e.key]);
      } else if (key === "g") {
        this.upgradeSelected("production");
      } else if (key === "s") {
        this.upgradeSelected("storage");
      } else if (key === "d") {
        this.upgradeSelected("defense");
      } else if (key === "r") {
        this.upgradeSelected("speed");
      } else if (e.key === " ") {
        e.preventDefault();
        this._emit("requestTogglePause");
      }
    };
    window.addEventListener("keydown", this._keyHandler);
  }

  setSendPercent(p) {
    this.sendPercent = p;
    this._emit("sendPercentChanged", p);
  }

  // track: 'production' | 'storage' | 'defense' | 'speed'
  upgradeSelected(track) {
    let any = false;
    this.selection.forEach(id => {
      const t = this.territoryById(id);
      if (t && t.owner === "player" && t.tryUpgrade(track)) any = true;
    });
    if (any) PW.audio.upgrade();
    return any;
  }

  sendFromSelection(targetId) {
    let sentAny = false;
    this.selection.forEach(id => {
      if (id === targetId) return;
      const source = this.territoryById(id);
      if (!source || source.owner !== "player") return;
      const amount = Math.floor(source.population * (this.sendPercent / 100));
      if (amount < 1) return;
      if (this.requestSend(id, targetId, amount, "player", this.colorOf("player"))) sentAny = true;
    });
    return sentAny;
  }

  requestSend(sourceId, targetId, amount, ownerId, color) {
    const source = this.territoryById(sourceId);
    const target = this.territoryById(targetId);
    if (!source || !target || source.owner !== ownerId) return false;
    amount = Math.min(Math.floor(amount), Math.floor(source.population));
    if (amount < 1) return false;
    source.population -= amount;
    const flock = new PW.Flock({
      id: PW.utils.uid("flock"),
      owner: ownerId,
      fromTerritory: source,
      toTerritory: target,
      amount,
      color,
      speedMultiplier: source.speedMultiplier()
    });
    this.flocks.push(flock);
    return true;
  }

  // ---------------------------------------------------------------- sim

  start() {
    this.running = true;
    requestAnimationFrame(this.loop);
  }

  destroy() {
    this.running = false;
    window.removeEventListener("resize", this._resizeHandler);
    window.removeEventListener("keydown", this._keyHandler);
  }

  setPaused(v) { this.paused = v; }

  loop(ts) {
    if (!this.running) return;
    if (this.lastTs == null) this.lastTs = ts;
    let dt = (ts - this.lastTs) / 1000;
    this.lastTs = ts;
    dt = Math.min(dt, 0.05);

    if (!this.paused) this.update(dt);
    this.render(ts);

    if (this.ended) { this.running = false; return; }
    requestAnimationFrame(this.loop);
  }

  update(dt) {
    this.elapsed += dt;

    this._updateWeather(dt);
    const speedMul = this.blizzard.active ? 0.5 : 1;

    this.territories.forEach(t => t.update(dt));

    const arrived = [];
    this.flocks.forEach(f => {
      f.update(dt, speedMul);
      if (f.arrived) arrived.push(f);
    });
    if (arrived.length) {
      arrived.forEach(f => this._resolveFlock(f));
      this.flocks = this.flocks.filter(f => !f.arrived);
    }

    this.bots.forEach(b => b.update(dt, this));

    this.particles.forEach(p => {
      p.y += p.speed * dt;
      if (p.y > this.worldH) { p.y = -4; p.x = PW.utils.rand(0, this.worldW); }
    });

    this._checkWinCondition();

    this._hudAccum += dt;
    if (this._hudAccum > 0.15) {
      this._hudAccum = 0;
      this._emitHud();
    }
  }

  _updateWeather(dt) {
    if (!this.blizzardEnabled) return;
    if (!this.blizzard.active && this.elapsed >= this.blizzard.nextAt) {
      this.blizzard.active = true;
      this.blizzard.endAt = this.elapsed + PW.utils.rand(10, 16);
      PW.audio.blizzardStart();
      this._emit("blizzard", true);
    } else if (this.blizzard.active && this.elapsed >= this.blizzard.endAt) {
      this.blizzard.active = false;
      this.blizzard.nextAt = this.elapsed + PW.utils.rand(50, 85);
      this._emit("blizzard", false);
    }
  }

  _resolveFlock(f) {
    const target = this.territoryById(f.toId);
    if (!target) return;
    const now = performance.now();

    if (target.owner === f.owner) {
      target.reinforce(f.amount);
      return;
    }

    const previousOwner = target.owner;
    const captured = target.resolveAttack(f.owner, f.amount, now);

    if (captured) {
      if (f.owner === "player") { this.stats.captures++; PW.audio.capture(); }
      else if (previousOwner === "player") { this.stats.lost++; PW.audio.lostTerritory(); }
    }
  }

  _checkWinCondition() {
    if (this.ended) return;
    const alive = new Set();
    this.territories.forEach(t => { if (t.owner) alive.add(t.owner); });
    this.flocks.forEach(f => alive.add(f.owner));

    const playerTerritories = this.territories.filter(t => t.owner === "player").length;
    this.stats.peakTerritories = Math.max(this.stats.peakTerritories, playerTerritories);

    if (!alive.has("player")) {
      this._endGame("defeat");
    } else if (alive.size === 1) {
      this._endGame("victory");
    }
  }

  _endGame(result) {
    this.ended = true;
    if (result === "victory") PW.audio.victory();
    else PW.audio.defeat();
    this._emit("gameOver", {
      result,
      stats: {
        time: this.elapsed,
        captures: this.stats.captures,
        lost: this.stats.lost,
        peakTerritories: this.stats.peakTerritories,
        totalTerritories: this.territories.length
      }
    });
  }

  getLeaderboard() {
    const counts = new Map();
    this.territories.forEach(t => {
      if (!t.owner) return;
      counts.set(t.owner, (counts.get(t.owner) || 0) + 1);
    });
    const rows = [{
      id: "player",
      name: "Your Colony",
      color: this.colorOf("player"),
      territories: counts.get("player") || 0,
      isYou: true
    }];
    this.bots.forEach(b => {
      const meta = this.botMeta.get(b.botId);
      rows.push({
        id: b.botId,
        name: meta.name,
        color: meta.color,
        territories: counts.get(b.botId) || 0,
        isYou: false
      });
    });
    rows.sort((a, b) => b.territories - a.territories);
    return rows;
  }

  _emitHud() {
    const mine = this.territories.filter(t => t.owner === "player");
    const totalPop = mine.reduce((s, t) => s + t.population, 0);
    const selected = Array.from(this.selection).map(id => this.territoryById(id)).filter(t => t && t.owner === "player");
    this._emit("hud", {
      territories: mine.length,
      totalTerritories: this.territories.length,
      population: totalPop,
      time: this.elapsed,
      leaderboard: this.getLeaderboard(),
      canUpgradeProduction: selected.some(t => t.canUpgrade("production")),
      canUpgradeStorage: selected.some(t => t.canUpgrade("storage")),
      canUpgradeDefense: selected.some(t => t.canUpgrade("defense")),
      canUpgradeSpeed: selected.some(t => t.canUpgrade("speed")),
      hasSelection: selected.length > 0
    });
  }

  // ---------------------------------------------------------------- render

  render(ts) {
    const ctx = this.ctx;
    const { scale, offsetX, offsetY } = this.camera;
    ctx.imageSmoothingEnabled = false;

    ctx.fillStyle = PW.utils.PALETTE.polarNight;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    PW.renderer.drawBackground(ctx, this.worldW, this.worldH, this.bgPattern);
    PW.renderer.drawAurora(ctx, this.worldW, this.worldH, this.elapsed);
    PW.renderer.drawSnow(ctx, this.particles, this.worldW, this.worldH);

    this.territories.forEach(t => {
      PW.renderer.drawTerritory(
        ctx, t, ts, this.colorOf,
        this.selection.has(t.id),
        this.hoverTargetId === t.id && this.selection.size > 0
      );
    });
    this.flocks.forEach(f => PW.renderer.drawFlock(ctx, f, ts, this.colorOf));

    if (this.selection.size > 0 && !this.dragActive && this.hover.x != null) {
      const sources = Array.from(this.selection).map(id => this.territoryById(id)).filter(Boolean);
      PW.renderer.drawHoverLines(ctx, sources, this.hover.x, this.hover.y);
    }
    if (this.dragActive && this.dragBox) PW.renderer.drawDragBox(ctx, this.dragBox);

    ctx.restore();

    if (this.blizzard.active) {
      ctx.save();
      ctx.fillStyle = "rgba(230,240,255,0.10)";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.restore();
    }
  }
};
