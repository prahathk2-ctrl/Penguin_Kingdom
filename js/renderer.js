// ===================== renderer.js =====================
// All canvas drawing lives here. Everything is built from flat-filled
// rectangles (no anti-aliased arcs) to keep the chunky 8-bit look, and
// colors always come from the shared PALETTE / per-owner color map.

PW.renderer = (() => {
  const { PALETTE } = PW.utils;

  // 7x9 bitmap: 0 empty, 1 body, 2 belly, 3 beak/feet.
  const PENGUIN_BITMAP = [
    [0,0,1,1,1,0,0],
    [0,1,1,1,1,1,0],
    [1,1,2,2,2,1,1],
    [1,1,2,2,2,1,1],
    [1,1,2,2,2,1,1],
    [1,1,2,2,2,1,1],
    [0,1,1,1,1,1,0],
    [0,0,1,3,1,0,0],
    [0,1,0,0,0,1,0]
  ];

  function drawPenguinSprite(ctx, cx, cy, px, bodyColor) {
    const w = PENGUIN_BITMAP[0].length;
    const h = PENGUIN_BITMAP.length;
    const ox = cx - (w * px) / 2;
    const oy = cy - (h * px) / 2;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const v = PENGUIN_BITMAP[r][c];
        if (v === 0) continue;
        ctx.fillStyle = v === 1 ? bodyColor : v === 2 ? PALETTE.snow : "#ffb84d";
        ctx.fillRect(Math.round(ox + c * px), Math.round(oy + r * px), px, px);
      }
    }
  }

  // Chunky quantized circle so colonies read as pixel-art blobs, not
  // smooth vector arcs.
  function drawPixelBlob(ctx, cx, cy, radius, px, fillColor) {
    ctx.fillStyle = fillColor;
    for (let y = -radius; y <= radius; y += px) {
      for (let x = -radius; x <= radius; x += px) {
        if (x * x + y * y <= radius * radius) {
          ctx.fillRect(Math.round(cx + x), Math.round(cy + y), px, px);
        }
      }
    }
  }

  function createIcePattern(ctx) {
    const size = 48;
    const off = document.createElement("canvas");
    off.width = size; off.height = size;
    const octx = off.getContext("2d");
    octx.fillStyle = "#0d2238";
    octx.fillRect(0, 0, size, size);
    const speckle = ["#16314e", "#0a1c30", "#193a5c"];
    for (let i = 0; i < 70; i++) {
      octx.fillStyle = speckle[i % speckle.length];
      const s = (i % 5 === 0) ? 3 : 2;
      octx.fillRect(
        Math.floor(Math.random() * size / 2) * 2,
        Math.floor(Math.random() * size / 2) * 2,
        s, s
      );
    }
    return ctx.createPattern(off, "repeat");
  }

  function drawBackground(ctx, worldW, worldH, pattern) {
    ctx.fillStyle = pattern || PALETTE.polarNight;
    ctx.fillRect(0, 0, worldW, worldH);
    const grad = ctx.createRadialGradient(
      worldW / 2, worldH / 2, Math.min(worldW, worldH) * 0.15,
      worldW / 2, worldH / 2, Math.max(worldW, worldH) * 0.75
    );
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, worldW, worldH);
  }

  function drawAurora(ctx, worldW, worldH, t) {
    const bands = [
      { color: "82,255,181", speed: 9,  amp: 22, base: worldH * 0.08 },
      { color: "176,123,255", speed: -6, amp: 16, base: worldH * 0.14 },
      { color: "94,200,240", speed: 5,  amp: 26, base: worldH * 0.04 }
    ];
    ctx.save();
    ctx.globalAlpha = 0.16;
    bands.forEach((b, bi) => {
      ctx.beginPath();
      ctx.moveTo(0, b.base);
      for (let x = 0; x <= worldW; x += 24) {
        const y = b.base + Math.sin((x / 90) + t * (b.speed / 10) + bi) * b.amp;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(worldW, 0);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fillStyle = `rgba(${b.color},1)`;
      ctx.fill();
    });
    ctx.restore();
  }

  function ownerFillColor(owner, colorOf) {
    if (owner === null) return PALETTE.neutral;
    return colorOf(owner);
  }

  function drawTerritory(ctx, t, now, colorOf, isSelected, isHoverTarget) {
    const baseColor = ownerFillColor(t.owner, colorOf);
    const px = t.size === "city" ? 4 : t.size === "village" ? 3 : 3;

    // soft ground shadow
    ctx.globalAlpha = 0.35;
    drawPixelBlob(ctx, t.x + 3, t.y + 4, t.radius, px, "#000000");
    ctx.globalAlpha = 1;

    drawPixelBlob(ctx, t.x, t.y, t.radius, px, baseColor);

    // ring border (darker outline ring for definition)
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.radius + 1, 0, Math.PI * 2);
    ctx.stroke();

    // combat flash
    if (t.flashUntil > now) {
      const remain = (t.flashUntil - now) / 260;
      ctx.globalAlpha = Math.max(0, remain) * 0.65;
      drawPixelBlob(ctx, t.x, t.y, t.radius, px, "#ffffff");
      ctx.globalAlpha = 1;
    }

    drawPenguinSprite(ctx, t.x, t.y - t.radius * 0.18, Math.max(2, Math.round(t.radius / 9)), "#1c2230");

    // population label
    ctx.font = `bold ${t.radius > 24 ? 13 : 11}px "VT323", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#000000";
    ctx.fillText(Math.floor(t.population), t.x + 1, t.y + t.radius * 0.62 + 1);
    ctx.fillStyle = PALETTE.snow;
    ctx.fillText(Math.floor(t.population), t.x, t.y + t.radius * 0.62);

    // upgrade pips: two tracks per row, color-coded
    // above: Production (green), Storage (sky blue)
    // below: Defense (gold), Speed (orange)
    if (t.owner !== null) {
      const pipSize = 3, gap = 2, groupGap = 5;
      const drawPipRow = (counts, y) => {
        const totalPips = counts.reduce((s, c) => s + c.level, 0);
        if (totalPips === 0) return;
        const totalW = counts.reduce((s, c) => s + (c.level > 0 ? c.level * pipSize + (c.level - 1) * gap : 0), 0)
          + groupGap * (counts.filter(c => c.level > 0).length - 1);
        let x = t.x - totalW / 2;
        counts.forEach(c => {
          if (c.level <= 0) return;
          ctx.fillStyle = c.color;
          for (let i = 0; i < c.level; i++) {
            ctx.fillRect(Math.round(x), Math.round(y), pipSize, pipSize);
            x += pipSize + gap;
          }
          x += groupGap - gap;
        });
      };
      drawPipRow(
        [
          { level: t.productionLevel, color: PALETTE.auroraGreen },
          { level: t.storageLevel, color: "#9be8ff" }
        ],
        t.y - t.radius - 9
      );
      drawPipRow(
        [
          { level: t.defenseLevel, color: PALETTE.crystalGold },
          { level: t.speedLevel, color: "#ff9f4d" }
        ],
        t.y + t.radius + 6
      );
    }

    // selection ring
    if (isSelected) {
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = PALETTE.crystalGold;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (isHoverTarget) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = PALETTE.snow;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // floating +/- delta text
    if (t.lastDeltaAt) {
      const age = now - t.lastDeltaAt;
      if (age < 900) {
        const a = 1 - age / 900;
        const dy = -age / 30;
        ctx.globalAlpha = Math.max(0, a);
        ctx.font = `bold 13px "VT323", monospace`;
        ctx.fillStyle = t.lastDelta >= 0 ? PALETTE.auroraGreen : PALETTE.crimsonFoe;
        const txt = (t.lastDelta >= 0 ? "+" : "") + t.lastDelta;
        ctx.fillText(txt, t.x, t.y - t.radius - 10 + dy);
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawFlock(ctx, f, now, colorOf) {
    const pos = f.position();
    const color = colorOf(f.owner);

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(f.startX, f.startY);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    const jitter = (n) => {
      const h = (f.id.charCodeAt(f.id.length - 1) + n * 17) % 7;
      return (h - 3);
    };
    const count = f.amount > 60 ? 3 : f.amount > 20 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      drawPenguinSprite(ctx, pos.x + jitter(i), pos.y + jitter(i + 1) * 0.6, 2, color);
    }

    ctx.font = `bold 11px "VT323", monospace`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#000000";
    ctx.fillText(Math.floor(f.amount), pos.x + 1, pos.y - 9 + 1);
    ctx.fillStyle = PALETTE.snow;
    ctx.fillText(Math.floor(f.amount), pos.x, pos.y - 9);
  }

  function drawDragBox(ctx, box) {
    if (!box) return;
    const x = Math.min(box.x1, box.x2);
    const y = Math.min(box.y1, box.y2);
    const w = Math.abs(box.x2 - box.x1);
    const h = Math.abs(box.y2 - box.y1);
    ctx.save();
    ctx.fillStyle = "rgba(255,209,102,0.12)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = PALETTE.crystalGold;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  function drawHoverLines(ctx, sources, hx, hy) {
    if (!sources || sources.length === 0 || hx == null) return;
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = PALETTE.crystalGold;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 5]);
    sources.forEach(s => {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(hx, hy);
      ctx.stroke();
    });
    ctx.restore();
    ctx.setLineDash([]);
  }

  function drawSnow(ctx, particles, worldW, worldH) {
    ctx.save();
    particles.forEach(p => {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = PALETTE.snow;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    });
    ctx.restore();
  }

  return {
    drawBackground, drawAurora, drawTerritory, drawFlock,
    drawDragBox, drawHoverLines, drawSnow, createIcePattern
  };
})();
