// ===================== flock.js =====================
// A Flock represents penguins in transit from one territory to another.
// Travels in a straight line at constant speed; resolved on arrival.

PW.BASE_FLOCK_SPEED = 70; // world units per second

PW.Flock = class Flock {
  constructor({ id, owner, fromTerritory, toTerritory, amount, color, speedMultiplier = 1 }) {
    this.id = id;
    this.owner = owner;
    this.fromId = fromTerritory.id;
    this.toId = toTerritory.id;
    this.amount = amount;
    this.color = color;
    this.speedMultiplier = speedMultiplier;

    this.startX = fromTerritory.x;
    this.startY = fromTerritory.y;
    this.endX = toTerritory.x;
    this.endY = toTerritory.y;

    const d = PW.utils.dist(this.startX, this.startY, this.endX, this.endY);
    this.totalDist = Math.max(1, d);
    this.traveled = 0;
    this.arrived = false;
  }

  // weatherMultiplier lets weather (blizzards) slow flocks down on top of
  // whatever speed bonus the launching territory's Speed upgrade gave it.
  update(dt, weatherMultiplier = 1) {
    this.traveled += PW.BASE_FLOCK_SPEED * this.speedMultiplier * weatherMultiplier * dt;
    if (this.traveled >= this.totalDist) {
      this.traveled = this.totalDist;
      this.arrived = true;
    }
  }

  progress() { return this.traveled / this.totalDist; }

  position() {
    const t = this.progress();
    return {
      x: PW.utils.lerp(this.startX, this.endX, t),
      y: PW.utils.lerp(this.startY, this.endY, t)
    };
  }

  angle() {
    return Math.atan2(this.endY - this.startY, this.endX - this.startX);
  }
};
