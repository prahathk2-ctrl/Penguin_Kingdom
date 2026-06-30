# Penguin Wars 🐧

A single-player real-time strategy browser game set in Antarctica. Build up
a penguin colony, expand across icy territories, and wipe out every rival
colony before they wipe you out — all in a chunky retro 8-bit pixel-art
style. No build step, no installs: it's plain HTML/CSS/JS.

## Run it

Just open `index.html` in a browser. That's it.

For the smoothest experience (and to avoid any browser quirks with local
files), you can optionally serve it instead of double-clicking it:

```bash
cd penguin-wars
python3 -m http.server 8000
# then open http://localhost:8000
```

In VS Code, the **Live Server** extension also works great — right-click
`index.html` → "Open with Live Server".

## The campaign

There's no map/difficulty menu — instead there are **50 levels**, generated
from a handful of smooth difficulty curves rather than hand-tuned one by
one. Level 1 is about as simple as it gets: one rival, one base each, calm
skies. By level 50 you're facing **dozens of rival empires** (35, to be
exact) spread across a sprawling map of **hundreds of territories** —
physically about 30x the area of level 1's map, with the camera fitting
the whole thing on screen so it genuinely reads as zoomed out over a vast
continent.

Along the way, smoothly and continuously rather than in big jumps:
- **More rivals** — 1 at level 1 up to 35 at level 50.
- **More territory** — 10 up to ~300, with the world itself growing to match.
- **Smarter AI** — pure Rookie early on, Veteran mixed in from level 3,
  Commander-tier opponents appearing around level 10 and dominating the
  field by the late game.
- **Weather** — blizzards kick in from level 4 onward.
- **Tougher neutrals and bot head-starts** — both scale up gradually so
  the late game isn't just "more of the same," it's genuinely harder per
  fight too.

Beat a level to unlock the next one. Progress is saved in your browser
(`localStorage`), with a "Reset progress" link in the menu if you want to
start the campaign over. The level grid in the menu shows 🔒 for locked
levels and ✅ for ones you've already beaten — hover any tile for its name
and a one-line description.

Heads up: levels in the high 40s throw a *lot* of territories and bots on
screen at once. It's been built to stay performant, but if it chugs on an
older device, that's the tradeoff of "hundreds of bases" — try a mid-range
level instead.

## The stopwatch

Every level is timed. A pixel-font stopwatch runs in the top right of the
HUD from the moment you start, pausing along with the game. Win, and your
time is compared against your personal best for that level — beat it and
you'll see a "New best time!" banner. Best times are saved per level
(`localStorage`) and shown right on the level tile in the menu, so you can
see at a glance which levels you've already got a fast clear on and which
ones are still worth a rematch.

## How to play

- **Select** your colonies by clicking one, or click-and-drag a box over
  several at once.
- **Send penguins** by clicking any other territory (yours, a rival's, or
  neutral ice) while you have colonies selected. A flock travels there and
  either reinforces it (if it's yours) or attacks it.
- **Upgrade** a selected colony by spending some of its own penguins —
  no separate currency, it all comes out of that colony's own population.
  Four independent tracks, each with 3 levels, shown as little color-coded
  pips above/below the colony:
  - **Production** (▲, green) — faster growth rate
  - **Storage** (📦, sky blue) — higher population cap
  - **Defense** (🛡, gold) — much harder to conquer, and softens the
    losses from any attack it survives
  - **Speed** (🚀, orange) — flocks launched from here travel faster

  Capturing an enemy colony resets all of its upgrades — you inherit the
  dirt, not the infrastructure.
- Captured territories keep producing penguins for you — the more you
  hold, the faster your empire grows.
- Last colony standing wins.

**Controls**

| Action | Input |
|---|---|
| Select a colony | Click it |
| Select several | Click-drag a box |
| Add/remove from selection | Shift+click |
| Send flock | Click a target while colonies are selected |
| Set send % | `1`/`2`/`3`/`4` keys or the buttons at the bottom (25/50/75/All) |
| Upgrade production | `G` or the ▲ Prod button |
| Upgrade storage | `S` or the 📦 Cap button |
| Upgrade defense | `D` or the 🛡 Def button |
| Upgrade speed | `R` or the 🚀 Spd button |
| Select everything you own | `A` |
| Clear selection | `Esc` or click empty ice |
| Pause | `Space` or the ⏸ button |

## Project structure

```
penguin-wars/
├── index.html          # page structure: menu, HUD, canvas, overlays
├── css/
│   └── style.css       # retro pixel-art styling (8-bit dialog-box look)
├── js/
│   ├── utils.js          # math/random helpers, shared color palette
│   ├── audio.js            # WebAudio chiptune sound effects (no audio files)
│   ├── levels.js              # the 50-level campaign + localStorage progress/times
│   ├── territory.js             # Territory model: growth, upgrades, combat
│   ├── flock.js                   # penguins-in-transit between territories
│   ├── maps.js                       # procedural map generation per map type
│   ├── ai.js                            # bot decision-making (3 difficulty tiers)
│   ├── renderer.js                         # all canvas drawing (sprites, FX)
│   ├── game.js                                # simulation loop + input handling
│   └── main.js                                  # DOM wiring (menu, HUD, overlays)
└── test/
    └── headless_test.js  # a Node-based smoke test for the simulation
```

Scripts are loaded as plain `<script src="...">` tags (no bundler, no ES
modules) so the project runs by just opening the HTML file — everything
shares one global `PW` namespace object.

## What's included vs. simplified from the original brief

This focuses on a tight, fully working core loop rather than every system
in the original wishlist:

- ✅ Real-time territory conquest, continuous penguin production, an
  8-level campaign with escalating AI count/skill/map size, a two-track
  upgrade system (production, storage, defense & speed), dynamic weather (blizzards), retro
  pixel-art rendering, chiptune SFX, full menu/HUD/pause/game-over flow,
  saved campaign progress.
- ✂️ Simplified out for scope: the full building system (Fishing
  Village/Ice Fortress/Research Igloo/etc. as separate structures), the
  full resource set (fish/crystals/snow/energy — upgrades just cost
  penguins directly), named unit types, the tech tree, and diplomacy/
  alliances (this is single-player vs. AI only). Territory *size*
  (Outpost/Village/City) plus the new growth/defense upgrade tracks stand
  in for the building-tier system.

## Testing

`test/headless_test.js` loads the real game source into a minimal
simulated DOM (Node's `vm` module) and:
- runs unit checks on the level-unlock logic, the campaign's difficulty
  curves (level 1 vs. level 50), the bot color generator, the AI's
  weighted tier selection, the upgrade cost/cap rules, and the
  defense-factor combat math, then
- runs full simulations of levels 1, 25, and 50 (thousands of ticks each)
  checking for crashes, invalid population/upgrade values, and that the
  win/loss condition eventually fires — including the 35-bot, 300-territory
  level 50 case.

Run it with:

```bash
node test/headless_test.js
```
# Penguin_Kingdom
