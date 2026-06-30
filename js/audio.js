// ===================== audio.js =====================
// Tiny chiptune-style audio using only the WebAudio API — no external
// sound or music files, which keeps the project self-contained and
// offline-friendly. Two layers:
//   1. One-shot SFX (click, capture, victory fanfare, etc.)
//   2. A tiny step-sequencer that loops a procedurally-defined chiptune
//      track — a cheerful one for the menu, a tenser driving one for
//      battle — with weather able to muffle it during a blizzard.

PW.audio = (() => {
  let ctx = null;
  let muted = false;
  let masterGain = null;
  let musicGain = null;
  let musicFilter = null;
  let noiseBuffer = null;

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.35;
      masterGain.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return true;
  }

  function ensureMusicBus() {
    if (!ensureCtx()) return false;
    if (!musicGain) {
      musicGain = ctx.createGain();
      musicFilter = ctx.createBiquadFilter();
      musicFilter.type = "lowpass";
      musicFilter.frequency.value = 12000; // wide open = effectively no filtering
      musicGain.gain.value = muted ? 0 : 0.42;
      musicGain.connect(musicFilter);
      musicFilter.connect(masterGain);
    }
    return true;
  }

  function ensureNoiseBuffer() {
    if (noiseBuffer) return noiseBuffer;
    const len = Math.floor(ctx.sampleRate * 0.25);
    noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return noiseBuffer;
  }

  // ---------------------------------------------------------------- SFX

  // Play one short beep. type: oscillator waveform.
  function tone(freq, duration, { type = "square", delay = 0, gain = 1, slideTo = null } = {}) {
    if (muted) return;
    try {
      if (!ensureCtx()) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      if (slideTo) {
        osc.frequency.linearRampToValueAtTime(slideTo, ctx.currentTime + delay + duration);
      }
      g.gain.value = 0;
      osc.connect(g);
      g.connect(masterGain);

      const t0 = ctx.currentTime + delay;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);

      osc.start(t0);
      osc.stop(t0 + duration + 0.02);
    } catch (e) {
      // Audio is purely decorative — never let it break gameplay.
      console.warn("Penguin Wars: audio playback failed", e);
    }
  }

  function sequence(notes) {
    // notes: [{freq, duration, delay, type, gain, slideTo}, ...]
    notes.forEach(n => tone(n.freq, n.duration, n));
  }

  // ---------------------------------------------------------------- music engine
  //
  // Patterns are tiny step-sequencer scores: a fixed-length loop of 16th
  // notes, with one or more "voices" (melody/bass/percussion) each made
  // of sparse {step, freq, dur, gain} events. Mute is handled by ramping
  // musicGain rather than skipping note scheduling, so it takes effect
  // instantly even on notes already queued ahead of time.

  // Natural-note frequency table (Hz) — both tracks stick to white-key
  // notes (C major for the menu, A natural minor for battle uses the
  // exact same pitches, just a different tonal center/rhythm/register).
  const N = {
    C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.00, A2: 110.00, B2: 123.47,
    C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77
  };

  const MENU_PATTERN = {
    name: "menu",
    bpm: 100,
    steps: 32,
    voices: [
      {
        type: "tone", waveType: "triangle", gain: 0.42,
        events: [
          { step: 0, freq: N.C3, dur: 3 }, { step: 4, freq: N.C3, dur: 3 },
          { step: 8, freq: N.G3, dur: 3 }, { step: 12, freq: N.G3, dur: 3 },
          { step: 16, freq: N.A3, dur: 3 }, { step: 20, freq: N.A3, dur: 3 },
          { step: 24, freq: N.F3, dur: 3 }, { step: 28, freq: N.F3, dur: 3 }
        ]
      },
      {
        type: "tone", waveType: "square", gain: 0.22,
        events: [
          { step: 0, freq: N.E4, dur: 2 }, { step: 2, freq: N.G4, dur: 2 },
          { step: 4, freq: N.E4, dur: 2 }, { step: 6, freq: N.C4, dur: 2 },
          { step: 8, freq: N.D4, dur: 2 }, { step: 10, freq: N.G4, dur: 2 },
          { step: 12, freq: N.B4, dur: 2 }, { step: 14, freq: N.G4, dur: 2 },
          { step: 16, freq: N.C5, dur: 3 }, { step: 19, freq: N.A4, dur: 2 },
          { step: 22, freq: N.E4, dur: 2 },
          { step: 24, freq: N.F4, dur: 2 }, { step: 26, freq: N.A4, dur: 2 },
          { step: 28, freq: N.G4, dur: 2 }, { step: 30, freq: N.F4, dur: 2 }
        ]
      },
      {
        // sparse high "icy shimmer" accents
        type: "tone", waveType: "sine", gain: 0.09,
        events: [
          { step: 1, freq: N.C5, dur: 6 },
          { step: 9, freq: N.E5, dur: 6 },
          { step: 17, freq: N.G5, dur: 6 },
          { step: 25, freq: N.D5, dur: 6 }
        ]
      }
    ]
  };

  const BATTLE_PATTERN = {
    name: "battle",
    bpm: 128,
    steps: 32,
    voices: [
      {
        // driving eighth-note bass pulse, Am - G - F - E
        type: "tone", waveType: "triangle", gain: 0.46,
        events: (() => {
          const roots = [N.A3, N.G3, N.F3, N.E3];
          const out = [];
          roots.forEach((freq, block) => {
            [0, 2, 4, 6].forEach(offset => out.push({ step: block * 8 + offset, freq, dur: 1 }));
          });
          return out;
        })()
      },
      {
        type: "tone", waveType: "square", gain: 0.24,
        events: [
          { step: 0, freq: N.A4, dur: 1 }, { step: 2, freq: N.C5, dur: 1 },
          { step: 4, freq: N.E5, dur: 2 }, { step: 7, freq: N.C5, dur: 1 },
          { step: 8, freq: N.G4, dur: 1 }, { step: 10, freq: N.B4, dur: 1 },
          { step: 12, freq: N.D5, dur: 2 }, { step: 15, freq: N.B4, dur: 1 },
          { step: 16, freq: N.F4, dur: 1 }, { step: 18, freq: N.A4, dur: 1 },
          { step: 20, freq: N.C5, dur: 2 }, { step: 23, freq: N.A4, dur: 1 },
          { step: 24, freq: N.E4, dur: 1 }, { step: 26, freq: N.G4, dur: 1 },
          { step: 28, freq: N.B4, dur: 2 }, { step: 31, freq: N.G4, dur: 1 }
        ]
      },
      {
        // chiptune percussion: noise-burst pulse, accented downbeats
        type: "noise", gain: 0.3,
        events: (() => {
          const out = [];
          for (let s = 0; s < 32; s += 4) out.push({ step: s, dur: 1, gain: (s % 8 === 0) ? 0.4 : 0.22 });
          return out;
        })()
      }
    ]
  };

  function scheduleMusicNote(time, freq, dur, waveType, gain) {
    try {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = waveType;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, time);
      g.gain.linearRampToValueAtTime(gain, time + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0008, time + dur);
      osc.connect(g);
      g.connect(musicGain);
      osc.start(time);
      osc.stop(time + dur + 0.02);
    } catch (e) { /* music is decorative; ignore */ }
  }

  function scheduleMusicNoise(time, dur, gain) {
    try {
      const src = ctx.createBufferSource();
      src.buffer = ensureNoiseBuffer();
      const g = ctx.createGain();
      const filt = ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = 1800;
      g.gain.setValueAtTime(gain, time);
      g.gain.exponentialRampToValueAtTime(0.0008, time + dur);
      src.connect(filt);
      filt.connect(g);
      g.connect(musicGain);
      src.start(time);
      src.stop(time + dur + 0.02);
    } catch (e) { /* music is decorative; ignore */ }
  }

  const musicState = { pattern: null, timerId: null };

  function stepDuration(bpm) { return (60 / bpm) / 4; }

  function scheduleLoop(pattern, startTime) {
    const stepDur = stepDuration(pattern.bpm);
    pattern.voices.forEach(voice => {
      voice.events.forEach(ev => {
        const t = startTime + ev.step * stepDur;
        const dur = (ev.dur || 1) * stepDur * 0.92;
        const gain = ev.gain != null ? ev.gain : voice.gain;
        if (voice.type === "noise") scheduleMusicNoise(t, dur, gain);
        else scheduleMusicNote(t, ev.freq, dur, voice.waveType, gain);
      });
    });
    return startTime + pattern.steps * stepDur;
  }

  function playLoop(pattern, startTime) {
    const endTime = scheduleLoop(pattern, startTime);
    const leadMs = Math.max(0, (endTime - ctx.currentTime - 0.15)) * 1000;
    musicState.timerId = setTimeout(() => {
      if (musicState.pattern === pattern) playLoop(pattern, endTime);
    }, leadMs);
  }

  function stopMusic() {
    if (musicState.timerId) clearTimeout(musicState.timerId);
    musicState.timerId = null;
    musicState.pattern = null;
  }

  function startPattern(pattern) {
    if (musicState.pattern === pattern) return; // already playing this track
    try {
      if (!ensureMusicBus()) return;
      stopMusic();
      musicState.pattern = pattern;
      playLoop(pattern, ctx.currentTime + 0.05);
    } catch (e) {
      console.warn("Penguin Wars: music failed to start", e);
    }
  }

  function applyMuteToMusic() {
    if (musicGain) musicGain.gain.linearRampToValueAtTime(muted ? 0 : 0.42, (ctx ? ctx.currentTime : 0) + 0.05);
  }

  return {
    unlock() { try { ensureCtx(); } catch (e) { console.warn("Penguin Wars: audio unlock failed", e); } },

    setMuted(v) { muted = v; applyMuteToMusic(); },
    isMuted() { return muted; },
    toggleMuted() { muted = !muted; applyMuteToMusic(); return muted; },

    startMenuMusic() { startPattern(MENU_PATTERN); },
    startBattleMusic() { startPattern(BATTLE_PATTERN); },
    stopMusic,
    // Smoothly muffles the music (blizzard "howling wind" effect) and restores it.
    setMusicFilter(muffled) {
      if (!musicFilter || !ctx) return;
      musicFilter.frequency.linearRampToValueAtTime(muffled ? 900 : 12000, ctx.currentTime + 1.2);
    },

    click() {
      tone(520, 0.05, { type: "square", gain: 0.5 });
    },
    select() {
      tone(700, 0.04, { type: "square", gain: 0.35 });
    },
    sendFlock() {
      sequence([
        { freq: 420, duration: 0.06, type: "square", gain: 0.45 },
        { freq: 620, duration: 0.08, delay: 0.05, type: "square", gain: 0.45 }
      ]);
    },
    capture() {
      sequence([
        { freq: 300, duration: 0.07, type: "triangle", gain: 0.5 },
        { freq: 500, duration: 0.07, delay: 0.06, type: "triangle", gain: 0.5 },
        { freq: 760, duration: 0.12, delay: 0.12, type: "triangle", gain: 0.55 }
      ]);
    },
    upgrade() {
      sequence([
        { freq: 440, duration: 0.06, type: "triangle", gain: 0.4 },
        { freq: 660, duration: 0.10, delay: 0.07, type: "triangle", gain: 0.45 }
      ]);
    },
    lostTerritory() {
      sequence([
        { freq: 300, duration: 0.12, type: "sawtooth", gain: 0.4, slideTo: 160 }
      ]);
    },
    blizzardStart() {
      tone(220, 0.5, { type: "sine", gain: 0.3, slideTo: 140 });
    },
    victory() {
      sequence([
        { freq: 523, duration: 0.12, delay: 0.00, type: "square", gain: 0.5 },
        { freq: 659, duration: 0.12, delay: 0.12, type: "square", gain: 0.5 },
        { freq: 784, duration: 0.12, delay: 0.24, type: "square", gain: 0.5 },
        { freq: 1047, duration: 0.30, delay: 0.36, type: "square", gain: 0.55 }
      ]);
    },
    defeat() {
      sequence([
        { freq: 392, duration: 0.18, delay: 0.00, type: "sawtooth", gain: 0.45 },
        { freq: 330, duration: 0.18, delay: 0.18, type: "sawtooth", gain: 0.45 },
        { freq: 220, duration: 0.40, delay: 0.36, type: "sawtooth", gain: 0.5 }
      ]);
    }
  };
})();
