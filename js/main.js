// ===================== main.js =====================
// Wires the DOM (level-select menu, HUD, overlays) to a PW.Game instance.
// No game logic lives here — this file only reflects game state into the
// page and turns button clicks into calls on the Game object.
//
// Note on robustness: starting a level hides the menu and shows the game
// screen FIRST, before anything that could possibly throw (audio init,
// constructing the Game). That way a failure elsewhere can never leave
// the player stuck looking at a menu that won't go away.

(() => {
  const $ = (sel) => document.querySelector(sel);

  const menuScreen = $("#menu-screen");
  const gameScreen = $("#game-screen");
  const canvas = $("#game-canvas");
  const canvasWrap = $("#canvas-wrap");

  const els = {
    levelSelect: $("#level-select"),
    levelBlurb: $("#level-blurb"),
    startBtn: $("#start-btn"),
    soundToggle: $("#sound-toggle"),
    resetProgressBtn: $("#reset-progress-btn"),

    blizzardBanner: $("#blizzard-banner"),
    statTerritories: $("#stat-territories"),
    statTerritoriesTotal: $("#stat-territories-total"),
    statPopulation: $("#stat-population"),
    statTime: $("#stat-time"),
    muteBtn: $("#mute-btn"),
    pauseBtn: $("#pause-btn"),
    leaderboardList: $("#leaderboard-list"),
    optSendPercent: $("#opt-send-percent"),
    upgradeProductionBtn: $("#upgrade-production-btn"),
    upgradeStorageBtn: $("#upgrade-storage-btn"),
    upgradeDefenseBtn: $("#upgrade-defense-btn"),
    upgradeSpeedBtn: $("#upgrade-speed-btn"),

    pauseOverlay: $("#pause-overlay"),
    resumeBtn: $("#resume-btn"),
    quitBtn: $("#quit-btn"),

    gameoverOverlay: $("#gameover-overlay"),
    gameoverTitle: $("#gameover-title"),
    gameoverSubtitle: $("#gameover-subtitle"),
    gameoverStats: $("#gameover-stats"),
    nextLevelBtn: $("#next-level-btn"),
    playAgainBtn: $("#play-again-btn"),
    menuBtn: $("#menu-btn")
  };

  let game = null;
  let selectedLevelId = PW.levels.getUnlocked();

  // ---------------------------------------------------------- level select

  function renderLevelGrid() {
    els.levelSelect.innerHTML = "";
    PW.LEVELS.forEach(level => {
      const unlocked = PW.levels.isUnlocked(level.id);
      const completed = level.id < PW.levels.getUnlocked();
      const best = PW.levels.getBestTime(level.id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "level-card";
      btn.title = unlocked ? `${level.name} — ${level.blurb}` : "Locked — beat the previous level first";
      if (!unlocked) btn.classList.add("locked");
      if (completed) btn.classList.add("completed");
      if (level.id === selectedLevelId) btn.classList.add("active");
      btn.setAttribute("aria-pressed", String(level.id === selectedLevelId));
      const sub = !unlocked ? "🔒" : (best != null ? PW.utils.formatStopwatch(best) : "—");
      btn.innerHTML = `
        <span class="level-num">${level.id}</span>
        <span class="level-sub">${sub}</span>
      `;
      btn.addEventListener("click", () => {
        if (!unlocked) { PW.audio.click(); return; }
        selectedLevelId = level.id;
        PW.audio.select();
        renderLevelGrid();
        updateBlurb();
      });
      els.levelSelect.appendChild(btn);
    });
  }

  function updateBlurb() {
    const level = PW.levels.byId(selectedLevelId);
    if (!level) { els.levelBlurb.textContent = ""; return; }
    const weather = level.weatherOn ? "dynamic weather" : "calm skies";
    const best = PW.levels.getBestTime(level.id);
    const bestPart = best != null ? ` · best ${PW.utils.formatStopwatch(best)}` : "";
    els.levelBlurb.innerHTML =
      `<strong>${level.id}. ${level.name}</strong> — ${level.blurb}<br>` +
      `${level.aiCount} rival${level.aiCount === 1 ? "" : "s"} · ${level.territoryCount} territories · ${weather}${bestPart}`;
  }

  els.resetProgressBtn.addEventListener("click", () => {
    if (!window.confirm("Reset campaign progress and best times back to Level 1?")) return;
    PW.levels.resetProgress();
    selectedLevelId = 1;
    renderLevelGrid();
    updateBlurb();
  });

  renderLevelGrid();
  updateBlurb();

  // ---------------------------------------------------------- sound

  function syncSoundButtons() {
    const muted = PW.audio.isMuted();
    els.soundToggle.textContent = muted ? "🔇 Sound off" : "🔊 Sound on";
    els.soundToggle.setAttribute("aria-pressed", String(!muted));
    els.muteBtn.textContent = muted ? "🔇" : "🔊";
  }
  els.soundToggle.addEventListener("click", () => {
    PW.audio.unlock();
    PW.audio.toggleMuted();
    syncSoundButtons();
  });
  els.muteBtn.addEventListener("click", () => {
    PW.audio.toggleMuted();
    syncSoundButtons();
  });
  syncSoundButtons();

  // Browsers won't let audio start until a real user gesture happens, so
  // begin the menu theme on the very first interaction anywhere on the
  // page (only if we're still on the menu — if the player jumped straight
  // into a level somehow, startLevel() below will start battle music instead).
  function primeAudioOnFirstInteraction() {
    const handler = () => {
      PW.audio.unlock();
      if (!gameScreen.classList.contains("hidden")) return; // already in a level
      PW.audio.startMenuMusic();
    };
    document.addEventListener("pointerdown", handler, { once: true });
    document.addEventListener("keydown", handler, { once: true });
  }
  primeAudioOnFirstInteraction();

  // ---------------------------------------------------------- send % + upgrades

  function setActive(groupEl, value) {
    groupEl.querySelectorAll(".opt-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.value === String(value));
    });
  }

  els.optSendPercent.querySelectorAll(".opt-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const v = Number(btn.dataset.value);
      if (game) game.setSendPercent(v);
      setActive(els.optSendPercent, v);
    });
  });

  els.upgradeProductionBtn.addEventListener("click", () => { if (game) game.upgradeSelected("production"); });
  els.upgradeStorageBtn.addEventListener("click", () => { if (game) game.upgradeSelected("storage"); });
  els.upgradeDefenseBtn.addEventListener("click", () => { if (game) game.upgradeSelected("defense"); });
  els.upgradeSpeedBtn.addEventListener("click", () => { if (game) game.upgradeSelected("speed"); });

  // ---------------------------------------------------------- starting a level

  function goToMenu() {
    if (game) { game.destroy(); game = null; }
    els.pauseOverlay.classList.add("hidden");
    els.gameoverOverlay.classList.add("hidden");
    gameScreen.classList.add("hidden");
    menuScreen.classList.remove("hidden");
    renderLevelGrid();
    PW.audio.startMenuMusic();
  }

  function startLevel(levelId) {
    const level = PW.levels.byId(levelId);
    if (!level) return;

    // Transition the screen FIRST — everything after this is best-effort.
    menuScreen.classList.add("hidden");
    gameScreen.classList.remove("hidden");
    els.pauseOverlay.classList.add("hidden");
    els.gameoverOverlay.classList.add("hidden");
    els.blizzardBanner.classList.add("hidden");
    setActive(els.optSendPercent, 50);
    if (game) game.setSendPercent(50);

    PW.audio.unlock(); // already internally try/caught, kept here for the user gesture
    PW.audio.startBattleMusic();

    if (game) { game.destroy(); game = null; }

    try {
      game = new PW.Game(canvas, canvasWrap, { ...level });

      game.on("hud", (data) => {
        els.statTerritories.textContent = data.territories;
        els.statTerritoriesTotal.textContent = data.totalTerritories;
        els.statPopulation.textContent = PW.utils.formatNumber(data.population);
        els.statTime.textContent = PW.utils.formatStopwatch(data.time);
        renderLeaderboard(data.leaderboard);
        els.upgradeProductionBtn.disabled = !data.canUpgradeProduction;
        els.upgradeStorageBtn.disabled = !data.canUpgradeStorage;
        els.upgradeDefenseBtn.disabled = !data.canUpgradeDefense;
        els.upgradeSpeedBtn.disabled = !data.canUpgradeSpeed;
      });

      game.on("blizzard", (active) => {
        els.blizzardBanner.classList.toggle("hidden", !active);
        PW.audio.setMusicFilter(active);
      });

      game.on("sendPercentChanged", (v) => setActive(els.optSendPercent, v));
      game.on("requestTogglePause", () => togglePause());
      game.on("gameOver", ({ result, stats }) => showGameOver(result, stats, levelId));

      game.start();
    } catch (err) {
      console.error("Penguin Wars failed to start:", err);
      goToMenu();
      window.alert("Something went wrong starting that level. Please try again — see the browser console for details.");
    }
  }

  function renderLeaderboard(rows) {
    els.leaderboardList.innerHTML = "";
    rows.forEach(r => {
      const li = document.createElement("li");
      if (r.isYou) li.classList.add("is-you");
      if (r.territories === 0) li.classList.add("is-dead");
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.style.background = r.color;
      const name = document.createElement("span");
      name.className = "lb-name";
      name.textContent = r.name;
      const count = document.createElement("span");
      count.className = "lb-count";
      count.textContent = r.territories;
      li.append(dot, name, count);
      els.leaderboardList.appendChild(li);
    });
  }

  function togglePause() {
    if (!game || game.ended) return;
    const next = !game.paused;
    game.setPaused(next);
    els.pauseOverlay.classList.toggle("hidden", !next);
  }
  els.pauseBtn.addEventListener("click", togglePause);
  els.resumeBtn.addEventListener("click", togglePause);
  els.quitBtn.addEventListener("click", goToMenu);

  function showGameOver(result, stats, levelId) {
    PW.audio.startMenuMusic();
    const win = result === "victory";
    let timeRecord = null;
    if (win) {
      timeRecord = PW.levels.recordTime(levelId, stats.time);
      PW.levels.completeLevel(levelId);
    }

    const nextLevel = PW.levels.byId(levelId + 1);
    const showNext = win && nextLevel && PW.levels.isUnlocked(nextLevel.id);

    els.gameoverTitle.textContent = win ? "VICTORY!" : "DEFEAT";
    els.gameoverTitle.classList.toggle("is-defeat", !win);
    els.gameoverSubtitle.textContent = win
      ? (nextLevel
          ? "Your colony rules the ice. A new rival awaits."
          : "Your colony rules all of Antarctica. Campaign complete!")
      : "Your colony has been wiped from the ice.";
    els.gameoverStats.innerHTML = "";

    const lines = [];
    if (win) {
      const best = PW.levels.getBestTime(levelId);
      lines.push(timeRecord.isNewBest
        ? `🏆 New best time: ${PW.utils.formatStopwatch(stats.time)}!`
        : `Time: ${PW.utils.formatStopwatch(stats.time)}  (best: ${PW.utils.formatStopwatch(best)})`);
    } else {
      lines.push(`Time survived: ${PW.utils.formatStopwatch(stats.time)}`);
    }
    lines.push(`Territories captured: ${stats.captures}`);
    lines.push(`Territories lost: ${stats.lost}`);
    lines.push(`Peak territories held: ${stats.peakTerritories} / ${stats.totalTerritories}`);
    lines.forEach(t => {
      const li = document.createElement("li");
      li.textContent = t;
      els.gameoverStats.appendChild(li);
    });

    els.nextLevelBtn.classList.toggle("hidden", !showNext);
    els.gameoverOverlay.classList.remove("hidden");
  }

  els.nextLevelBtn.addEventListener("click", () => {
    const current = game ? game.options.id : selectedLevelId;
    const next = current + 1;
    selectedLevelId = next;
    els.gameoverOverlay.classList.add("hidden");
    startLevel(next);
  });
  els.playAgainBtn.addEventListener("click", () => {
    const current = game ? game.options.id : selectedLevelId;
    els.gameoverOverlay.classList.add("hidden");
    startLevel(current);
  });
  els.menuBtn.addEventListener("click", goToMenu);

  els.startBtn.addEventListener("click", () => startLevel(selectedLevelId));
})();
