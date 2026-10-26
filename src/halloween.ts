// Halloween theme for Keychron Dash: art for the haunted city, re-skinned
// obstacles (same hitboxes as the PAX art, so difficulty is unchanged),
// candy, pumpkin keycaps, power-ups and the "haunted stretch" effects.
// Game rules for power-ups and haunted stretches live in Game.tsx.

declare const __THEME__: string;

export type Theme = "pax" | "halloween";

// Build-time default (build.mjs, GAME_THEME), overridable with ?theme=pax|halloween
function pickTheme(): Theme {
  const fromUrl =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("theme") : null;
  const chosen = fromUrl ?? (typeof __THEME__ !== "undefined" ? __THEME__ : "pax");
  return chosen === "halloween" ? "halloween" : "pax";
}

export const THEME: Theme = pickTheme();
export const HALLOWEEN = THEME === "halloween";

const WORLD_WIDTH = 1280;
const WORLD_HEIGHT = 720;
const GROUND_Y = 570;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export const SPOOKY = {
  ink: "#15121c",
  pumpkin: "#ff7a1a",
  pumpkinDark: "#d4560b",
  pumpkinLight: "#ffa64d",
  stem: "#4f7a2b",
  purple: "#7b3fbf",
  purpleDark: "#3b1d63",
  purpleLight: "#b98af0",
  slime: "#7ee04a",
  slimeDark: "#3f9a1d",
  bone: "#f1ead6",
  boneShade: "#cfc4a6",
  ghost: "#f4f1ff",
  ghostShade: "#cfc8ec",
  candle: "#ffd36b",
  stone: "#8a8798",
  stoneDark: "#5c5a6b",
};

// ---------------------------------------------------------------------------
// Power-ups
// ---------------------------------------------------------------------------

export type PowerUpKind = "broom" | "shield" | "magnet" | "ghost";

export type PowerUpItem = {
  id: number;
  kind: PowerUpKind;
  x: number;
  y: number;
  size: number;
  phase: number;
  collected: boolean;
};

export type ActivePower = { kind: Exclude<PowerUpKind, "shield">; timer: number; duration: number };

export const POWER_UP_INFO: Record<PowerUpKind, { name: string; seconds: number; color: string; blurb: string }> = {
  broom: { name: "BROOM", seconds: 6, color: "#ffb347", blurb: "Fly over everything" },
  shield: { name: "PUMPKIN SHIELD", seconds: 20, color: SPOOKY.pumpkin, blurb: "Blocks one hit" },
  magnet: { name: "CANDY MAGNET", seconds: 8, color: "#ff5fa2", blurb: "Pulls candy to you" },
  ghost: { name: "GHOST MODE", seconds: 5, color: "#b8f0ff", blurb: "Pass through obstacles" },
};

/** Small icon for a power-up, centred on (0,0), about `s` px wide. */
export function drawPowerUpIcon(ctx: CanvasRenderingContext2D, kind: PowerUpKind, s: number) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (kind === "broom") {
    ctx.rotate(-0.55);
    ctx.strokeStyle = "#8a5a2b";
    ctx.lineWidth = s * 0.1;
    ctx.beginPath();
    ctx.moveTo(-s * 0.42, 0);
    ctx.lineTo(s * 0.2, 0);
    ctx.stroke();
    ctx.fillStyle = "#e8b24a";
    ctx.beginPath();
    ctx.moveTo(s * 0.16, -s * 0.06);
    ctx.lineTo(s * 0.46, -s * 0.2);
    ctx.lineTo(s * 0.5, s * 0.2);
    ctx.lineTo(s * 0.16, s * 0.06);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#a3741f";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = SPOOKY.purple;
    ctx.fillRect(s * 0.12, -s * 0.08, s * 0.07, s * 0.16);
  } else if (kind === "shield") {
    drawPumpkin(ctx, -s * 0.38, -s * 0.34, s * 0.76, s * 0.68, true, 0);
  } else if (kind === "magnet") {
    ctx.strokeStyle = "#e23b5a";
    ctx.lineWidth = s * 0.17;
    ctx.beginPath();
    ctx.arc(0, -s * 0.02, s * 0.24, Math.PI, 0);
    ctx.lineTo(s * 0.24, s * 0.26);
    ctx.moveTo(-s * 0.24, -s * 0.02);
    ctx.lineTo(-s * 0.24, s * 0.26);
    ctx.stroke();
    ctx.strokeStyle = "#f1f1f1";
    ctx.beginPath();
    ctx.moveTo(-s * 0.24, s * 0.16);
    ctx.lineTo(-s * 0.24, s * 0.3);
    ctx.moveTo(s * 0.24, s * 0.16);
    ctx.lineTo(s * 0.24, s * 0.3);
    ctx.stroke();
  } else {
    drawGhostShape(ctx, 0, 0, s * 0.62, 0);
  }
  ctx.restore();
}

export function drawPowerUpItem(ctx: CanvasRenderingContext2D, item: PowerUpItem, elapsed: number) {
  const bob = Math.sin(elapsed * 4 + item.phase) * 7;
  const cx = item.x + item.size / 2;
  const cy = item.y + item.size / 2 + bob;
  const info = POWER_UP_INFO[item.kind];
  const pulse = 0.5 + Math.sin(elapsed * 6 + item.phase) * 0.25;
  ctx.save();
  // Soft glow ring
  ctx.fillStyle = hexAlpha(info.color, 0.18 + pulse * 0.15);
  ctx.beginPath();
  ctx.arc(cx, cy, item.size * 0.72, 0, Math.PI * 2);
  ctx.fill();
  // Bubble
  ctx.fillStyle = "rgba(21,18,28,.82)";
  ctx.beginPath();
  ctx.arc(cx, cy, item.size * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = info.color;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.translate(cx, cy);
  drawPowerUpIcon(ctx, item.kind, item.size * 0.7);
  ctx.restore();
  // Sparkles
  for (let k = 0; k < 3; k += 1) {
    const a = elapsed * 2.4 + item.phase + (k * Math.PI * 2) / 3;
    ctx.fillStyle = hexAlpha("#ffffff", 0.75);
    ctx.fillRect(cx + Math.cos(a) * item.size * 0.62 - 2, cy + Math.sin(a) * item.size * 0.62 - 2, 4, 4);
  }
}

/** Power-up status pills under the score panel. */
export function drawPowerUpHud(
  ctx: CanvasRenderingContext2D,
  active: ActivePower | null,
  shieldSeconds: number,
) {
  let x = 28;
  const y = 112;
  const pill = (kind: PowerUpKind, label: string, fraction: number) => {
    const w = 210;
    ctx.fillStyle = "rgba(21,18,28,.86)";
    roundedRect(ctx, x, y, w, 40, 14);
    ctx.fill();
    ctx.save();
    ctx.translate(x + 22, y + 20);
    drawPowerUpIcon(ctx, kind, 26);
    ctx.restore();
    ctx.fillStyle = POWER_UP_INFO[kind].color;
    ctx.font = "900 13px 'Courier New', monospace";
    ctx.fillText(label, x + 42, y + 17);
    ctx.fillStyle = "rgba(255,255,255,.18)";
    roundedRect(ctx, x + 42, y + 24, w - 56, 7, 3.5);
    ctx.fill();
    ctx.fillStyle = POWER_UP_INFO[kind].color;
    roundedRect(ctx, x + 42, y + 24, Math.max(7, (w - 56) * clamp(fraction, 0, 1)), 7, 3.5);
    ctx.fill();
    x += w + 10;
  };
  if (active) pill(active.kind, POWER_UP_INFO[active.kind].name, active.timer / active.duration);
  if (shieldSeconds > 0) pill("shield", "PUMPKIN SHIELD", shieldSeconds / POWER_UP_INFO.shield.seconds);
}

/** Effects drawn around the rider (player-local coordinates, rider box 150 x height). */
export function drawPlayerAura(
  ctx: CanvasRenderingContext2D,
  opts: { width: number; height: number; elapsed: number; broomLift: number; shieldSeconds: number; magnet: boolean; ghost: boolean },
) {
  const { width, height, elapsed } = opts;
  if (opts.magnet) {
    // Pink rings pulsing outwards
    for (let k = 0; k < 2; k += 1) {
      const t = (elapsed * 1.2 + k * 0.5) % 1;
      ctx.strokeStyle = `rgba(255,95,162,${0.45 * (1 - t)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(width / 2, height / 2, 60 + t * 120, 50 + t * 90, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  if (opts.shieldSeconds > 0) {
    // A little jack-o'-lantern orbiting the rider
    const a = elapsed * 2.6;
    const px = width / 2 + Math.cos(a) * 78 - 14;
    const py = height * 0.45 + Math.sin(a) * 30 - 13;
    drawPumpkin(ctx, px, py, 28, 26, true, elapsed);
  }
}

/**
 * The broom the rider stands on instead of the skateboard while the broom
 * power-up lasts (board-local coordinates: deck centre at 0,0, feet just above).
 */
export function drawBroomRide(ctx: CanvasRenderingContext2D, elapsed: number) {
  const y = 4;
  ctx.save();
  ctx.lineCap = "round";
  // Handle: dark edge, then wood
  ctx.strokeStyle = "#2a160a";
  ctx.lineWidth = 13;
  ctx.beginPath();
  ctx.moveTo(-70, y);
  ctx.lineTo(96, y - 4);
  ctx.stroke();
  ctx.strokeStyle = "#9a6230";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(-70, y);
  ctx.lineTo(96, y - 4);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,220,170,.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-60, y - 3);
  ctx.lineTo(90, y - 7);
  ctx.stroke();
  // Bristles at the back, fluttering in the wind
  ctx.fillStyle = "#f2c056";
  ctx.beginPath();
  ctx.moveTo(-64, y - 10);
  ctx.lineTo(-124, y - 26 + Math.sin(elapsed * 18) * 5);
  ctx.lineTo(-132, y);
  ctx.lineTo(-124, y + 26 + Math.sin(elapsed * 18 + 1) * 5);
  ctx.lineTo(-64, y + 10);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#8a5a12";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.strokeStyle = "rgba(138,90,18,.6)";
  ctx.lineWidth = 1.5;
  for (const dy of [-12, -4, 4, 12]) {
    ctx.beginPath();
    ctx.moveTo(-70, y + dy * 0.5);
    ctx.lineTo(-124, y + dy * 1.7);
    ctx.stroke();
  }
  ctx.fillStyle = SPOOKY.purple;
  ctx.fillRect(-72, y - 10, 11, 20);
  // Sparkle trail behind the bristles
  for (let k = 0; k < 8; k += 1) {
    const t = (elapsed * 2 + k / 8) % 1;
    ctx.fillStyle = `rgba(255,214,107,${0.85 * (1 - t)})`;
    ctx.fillRect(-138 - t * 160, y - 4 + Math.sin(k * 2.1 + elapsed * 5) * 16, 6, 6);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Background: haunted Melbourne at night
// ---------------------------------------------------------------------------

export type SpookyScene = {
  scroll: number;
  elapsed: number;
  haunted: number; // seconds left in a haunted stretch (0 = none)
  lightningAge: number; // seconds since the last strike (Infinity = none)
  lightningX: number; // where the bolt comes down
  lightningSeed: number; // shape of the bolt
};

export function drawHalloweenBackground(
  ctx: CanvasRenderingContext2D,
  scene: SpookyScene,
  keychronLogo?: HTMLImageElement,
) {
  const { scroll, elapsed } = scene;
  const hauntedMix = clamp(scene.haunted > 0 ? Math.min(1, scene.haunted * 2, (10 - scene.haunted) * 2 + 0.4) : 0, 0, 1);

  // Sky: deep purple to a warm orange glow at the horizon
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, hauntedMix > 0 ? mix("#1d1236", "#0d0818", hauntedMix) : "#1d1236");
  sky.addColorStop(0.55, hauntedMix > 0 ? mix("#4a2470", "#2a1240", hauntedMix) : "#4a2470");
  sky.addColorStop(1, hauntedMix > 0 ? mix("#d9692b", "#7a2f4a", hauntedMix) : "#d9692b");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  // Stars
  for (let index = 0; index < 46; index += 1) {
    const starX = (index * 137.5 + 40) % WORLD_WIDTH;
    const starY = (index * 71.3) % (GROUND_Y - 260);
    const twinkle = 0.45 + Math.sin(elapsed * 2.6 + index * 1.7) * 0.35;
    ctx.fillStyle = `rgba(255,244,214,${clamp(twinkle, 0, 1)})`;
    ctx.fillRect(starX, starY, index % 5 === 0 ? 3 : 2, index % 5 === 0 ? 3 : 2);
  }

  // Big full moon
  const moonX = 980 - ((scroll * 0.02) % 60);
  const moonY = 140;
  const glow = ctx.createRadialGradient(moonX, moonY, 40, moonX, moonY, 170);
  glow.addColorStop(0, "rgba(255,236,190,.35)");
  glow.addColorStop(1, "rgba(255,236,190,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(moonX, moonY, 170, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff1c9";
  ctx.beginPath();
  ctx.arc(moonX, moonY, 72, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(214,190,140,.55)";
  for (const [dx, dy, r] of [[-24, -16, 14], [20, 10, 18], [-6, 30, 9], [30, -28, 8], [-34, 22, 7]] as const) {
    ctx.beginPath();
    ctx.arc(moonX + dx, moonY + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bats crossing the sky
  for (let k = 0; k < 5; k += 1) {
    const period = 9 + k * 2.3;
    const t = ((elapsed + k * 3.7) % period) / period;
    const bx = WORLD_WIDTH + 80 - t * (WORLD_WIDTH + 200);
    const by = 70 + k * 34 + Math.sin(elapsed * 2 + k) * 18;
    drawBat(ctx, bx, by, 0.7 + (k % 3) * 0.25, elapsed * 14 + k, "#120c1c");
  }

  // Lightning bolt, behind the skyline so buildings hide where it lands
  const strike = lightningStrength(scene.lightningAge);
  if (strike > 0) drawLightningBolt(ctx, scene.lightningX, scene.lightningSeed, strike);

  // Far skyline: dark purple towers with orange and purple windows
  const skylineOffset = (scroll * 0.22) % 980;
  for (let repeat = -1; repeat < 3; repeat += 1) {
    const origin = repeat * 980 - skylineOffset;
    const buildings = [
      { x: 0, w: 140, h: 190 },
      { x: 148, w: 118, h: 244 },
      { x: 274, w: 182, h: 165 },
      { x: 464, w: 132, h: 218 },
      { x: 604, w: 190, h: 184 },
      { x: 802, w: 150, h: 258 },
    ];
    buildings.forEach((b, index) => {
      const top = GROUND_Y - 76 - b.h;
      ctx.fillStyle = index % 2 ? "#271a3d" : "#2f2048";
      ctx.fillRect(origin + b.x, top, b.w, b.h);
      for (let wx = 18; wx < b.w - 12; wx += 34) {
        for (let wy = 22; wy < b.h - 14; wy += 42) {
          const seed = (wx * 7 + wy * 13 + index * 31) % 11;
          if (seed > 5) continue;
          const flicker = hauntedMix > 0 && seed === 1 && Math.sin(elapsed * 9 + wx) > 0.6 ? 0.25 : 1;
          ctx.fillStyle = seed % 3 === 0 ? `rgba(185,138,240,${0.75 * flicker})` : `rgba(255,170,70,${0.85 * flicker})`;
          ctx.fillRect(origin + b.x + wx, top + wy, 13, 18);
        }
      }
    });
    // Eureka-style spire and a haunted house on the skyline
    drawSpire(ctx, origin + 330, GROUND_Y - 76);
    drawHauntedHouse(ctx, origin + 640, GROUND_Y - 76, elapsed);
  }

  // Shop fronts: a candy store and a Keychron store, both lit for Halloween
  const shopOffset = (scroll * 0.55) % 1560;
  for (let repeat = -1; repeat < 2; repeat += 1) {
    const shopX = 140 + repeat * 1560 - shopOffset;
    drawCandyStore(ctx, shopX, elapsed);
    drawKeychronStore(ctx, shopX + 780, elapsed, keychronLogo);
  }

  // Sidewalk with jack-o'-lanterns and gravestones along the kerb
  ctx.fillStyle = "#5b4a6e";
  ctx.fillRect(0, 494, WORLD_WIDTH, 76);
  ctx.fillStyle = "#6c5a80";
  for (let x = -((scroll * 0.8) % 94); x < WORLD_WIDTH; x += 94) {
    ctx.fillRect(x, 510, 56, 7);
  }
  // Kept small and dim so they read as scenery, not as obstacles to jump
  const decorOffset = (scroll * 0.8) % 470;
  ctx.save();
  ctx.globalAlpha = 0.5;
  for (let x = -decorOffset; x < WORLD_WIDTH + 100; x += 470) {
    drawPumpkin(ctx, x + 40, 474, 28, 24, true, elapsed);
    drawPumpkin(ctx, x + 300, 478, 22, 19, false, elapsed);
    drawTinyGrave(ctx, x + 180, 478);
  }
  ctx.restore();

  // Road
  ctx.fillStyle = "#24202e";
  ctx.fillRect(0, GROUND_Y, WORLD_WIDTH, WORLD_HEIGHT - GROUND_Y);
  ctx.fillStyle = "#332d41";
  ctx.fillRect(0, GROUND_Y + 12, WORLD_WIDTH, 6);
  ctx.fillStyle = SPOOKY.pumpkin;
  for (let x = -((scroll * 2) % 170); x < WORLD_WIDTH; x += 170) {
    ctx.fillRect(x, GROUND_Y + 96, 100, 8);
  }

  // Low fog drifting along the street
  for (let k = 0; k < 7; k += 1) {
    const fx = ((k * 260 - scroll * (0.9 + (k % 3) * 0.15)) % (WORLD_WIDTH + 400) + WORLD_WIDTH + 400) % (WORLD_WIDTH + 400) - 200;
    const fy = 520 + (k % 3) * 18 + Math.sin(elapsed * 0.8 + k) * 6;
    ctx.fillStyle = `rgba(214,200,240,${0.1 + (k % 2) * 0.05})`;
    ctx.beginPath();
    ctx.ellipse(fx, fy, 170, 26, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Haunted stretch: darker, with ghosts drifting behind the action
  if (hauntedMix > 0) {
    ctx.fillStyle = `rgba(12,4,24,${0.32 * hauntedMix})`;
    ctx.fillRect(0, 0, WORLD_WIDTH, GROUND_Y + 40);
    for (let k = 0; k < 4; k += 1) {
      const gx = ((k * 340 - elapsed * 60 - scroll * 0.3) % (WORLD_WIDTH + 200) + WORLD_WIDTH + 200) % (WORLD_WIDTH + 200) - 100;
      // Kept faint, small and high in the sky so they don't look like the ghost obstacles
      const gy = 120 + k * 42 + Math.sin(elapsed * 1.6 + k) * 16;
      ctx.save();
      ctx.globalAlpha = 0.18 * hauntedMix;
      drawGhostShape(ctx, gx, gy, 38, elapsed + k);
      ctx.restore();
    }
  }
  if (strike > 0) {
    // Sky lights up with the bolt
    ctx.fillStyle = `rgba(230,220,255,${0.3 * strike})`;
    ctx.fillRect(0, 0, WORLD_WIDTH, GROUND_Y);
  }
}

/**
 * Brightness of a lightning strike over time: a bright flash, a short dark
 * gap, a second flash, then a fade. Strikes are 2+ seconds apart, so this
 * stays well under 3 flashes per second (not a strobe).
 */
export function lightningStrength(age: number) {
  if (!(age >= 0) || age > 0.55) return 0;
  if (age < 0.07) return 1;
  if (age < 0.13) return 0.15;
  if (age < 0.2) return 0.85;
  return 0.85 * (1 - (age - 0.2) / 0.35);
}

function drawLightningBolt(ctx: CanvasRenderingContext2D, startX: number, seed: number, strength: number) {
  // Seeded random so the bolt keeps its shape while it flickers
  let state = Math.floor(seed) % 2147483647 || 1;
  const rand = () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
  const bottom = GROUND_Y - 200; // rooftops; the skyline covers the rest
  const buildPath = (x0: number, y0: number, y1: number, jitter: number) => {
    const points: [number, number][] = [[x0, y0]];
    let x = x0;
    let y = y0;
    while (y < y1) {
      y += 22 + rand() * 26;
      x += (rand() - 0.5) * jitter;
      points.push([x, Math.min(y, y1)]);
    }
    return points;
  };
  const main = buildPath(startX, 0, bottom, 70);
  const branches: [number, number][][] = [];
  for (let b = 0; b < 3; b += 1) {
    const from = main[2 + Math.floor(rand() * Math.max(1, main.length - 4))];
    if (!from) continue;
    const dir = rand() > 0.5 ? 1 : -1;
    const pts: [number, number][] = [from];
    let [x, y] = from;
    const len = 3 + Math.floor(rand() * 4);
    for (let k = 0; k < len; k += 1) {
      x += dir * (14 + rand() * 26);
      y += 16 + rand() * 22;
      pts.push([x, y]);
    }
    branches.push(pts);
  }
  const stroke = (points: [number, number][], width: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    points.forEach(([px, py], index) => (index === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.stroke();
  };
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Purple glow, white-hot core; branches thinner
  stroke(main, 24, `rgba(185,138,240,${0.32 * strength})`);
  stroke(main, 10, `rgba(225,205,255,${0.75 * strength})`);
  stroke(main, 4.5, `rgba(255,255,255,${strength})`);
  for (const branch of branches) {
    stroke(branch, 12, `rgba(185,138,240,${0.28 * strength})`);
    stroke(branch, 3, `rgba(245,235,255,${0.9 * strength})`);
  }
  // Glow where it hits the rooftops
  const [hx, hy] = main[main.length - 1];
  const hit = ctx.createRadialGradient(hx, hy, 4, hx, hy, 90);
  hit.addColorStop(0, `rgba(240,230,255,${0.6 * strength})`);
  hit.addColorStop(1, "rgba(240,230,255,0)");
  ctx.fillStyle = hit;
  ctx.beginPath();
  ctx.arc(hx, hy, 90, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSpire(ctx: CanvasRenderingContext2D, x: number, groundY: number) {
  ctx.fillStyle = "#1a1229";
  ctx.fillRect(x, groundY - 300, 46, 300);
  ctx.beginPath();
  ctx.moveTo(x - 4, groundY - 300);
  ctx.lineTo(x + 23, groundY - 352);
  ctx.lineTo(x + 50, groundY - 300);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffb347";
  for (let y = groundY - 280; y < groundY - 20; y += 26) ctx.fillRect(x + 10, y, 8, 10);
  ctx.fillStyle = "#e23b5a";
  ctx.fillRect(x + 21, groundY - 362, 4, 12);
}

function drawHauntedHouse(ctx: CanvasRenderingContext2D, x: number, groundY: number, elapsed: number) {
  ctx.fillStyle = "#170f24";
  ctx.fillRect(x, groundY - 150, 170, 150);
  ctx.beginPath();
  ctx.moveTo(x - 14, groundY - 150);
  ctx.lineTo(x + 85, groundY - 232);
  ctx.lineTo(x + 184, groundY - 150);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(x + 122, groundY - 236, 26, 60); // chimney
  ctx.fillRect(x + 20, groundY - 210, 34, 70); // tower
  ctx.beginPath();
  ctx.moveTo(x + 14, groundY - 210);
  ctx.lineTo(x + 37, groundY - 248);
  ctx.lineTo(x + 60, groundY - 210);
  ctx.closePath();
  ctx.fill();
  const lit = 0.75 + Math.sin(elapsed * 3) * 0.2;
  ctx.fillStyle = `rgba(255,190,80,${lit})`;
  ctx.fillRect(x + 30, groundY - 196, 14, 18);
  ctx.fillRect(x + 76, groundY - 116, 20, 26);
  ctx.fillRect(x + 122, groundY - 116, 20, 26);
  ctx.fillStyle = "#0d0817";
  ctx.fillRect(x + 85, groundY - 116, 2, 26);
  ctx.fillRect(x + 76, groundY - 104, 20, 2);
  ctx.fillRect(x + 131, groundY - 116, 2, 26);
  ctx.fillRect(x + 122, groundY - 104, 20, 2);
}

function drawCandyStore(ctx: CanvasRenderingContext2D, x: number, elapsed: number) {
  ctx.fillStyle = "#2a1d3a";
  ctx.fillRect(x, 352, 264, 142);
  ctx.fillStyle = "rgba(255,122,26,.22)";
  ctx.fillRect(x - 8, 344, 280, 62);
  ctx.fillStyle = SPOOKY.pumpkin;
  ctx.fillRect(x, 352, 264, 46);
  // Scalloped awning
  ctx.fillStyle = SPOOKY.purple;
  for (let k = 0; k < 11; k += 1) {
    ctx.beginPath();
    ctx.arc(x + 12 + k * 24, 398, 12, 0, Math.PI);
    ctx.fill();
  }
  ctx.fillStyle = "#1b1220";
  ctx.font = "900 20px Arial";
  ctx.fillText("TRICK OR TREAT", x + 46, 383);
  ctx.fillStyle = "rgba(255,210,110,.25)";
  ctx.fillRect(x + 20, 418, 228, 64);
  ctx.fillStyle = "#ffe0a0";
  ctx.fillRect(x + 28, 424, 58, 70);
  ctx.fillStyle = "#fff0c8";
  ctx.fillRect(x + 122, 423, 110, 48);
  // Candy jars in the window
  for (let k = 0; k < 3; k += 1) {
    const jx = x + 132 + k * 34;
    ctx.fillStyle = "rgba(255,255,255,.65)";
    roundedRect(ctx, jx, 432, 24, 32, 6);
    ctx.fill();
    ctx.fillStyle = [SPOOKY.pumpkin, SPOOKY.purple, SPOOKY.slime][k];
    roundedRect(ctx, jx + 3, 446, 18, 15, 4);
    ctx.fill();
  }
  drawPumpkin(ctx, x + 36, 452, 40, 36, true, elapsed);
}

function drawKeychronStore(ctx: CanvasRenderingContext2D, x: number, elapsed: number, logo?: HTMLImageElement) {
  ctx.fillStyle = "#1e2230";
  ctx.fillRect(x, 352, 264, 142);
  ctx.fillStyle = "rgba(185,138,240,.22)";
  ctx.fillRect(x - 8, 344, 280, 62);
  ctx.fillStyle = "#171b1f";
  ctx.fillRect(x, 352, 264, 46);
  ctx.fillStyle = SPOOKY.purple;
  ctx.fillRect(x, 398, 264, 8);
  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, x + 12, 357, 34, 34, 17);
  ctx.fill();
  if (logo && logo.complete && logo.naturalWidth > 0) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(logo, x + 16, 361, 26, 26);
    ctx.restore();
  }
  ctx.fillStyle = "#ffd9a6";
  ctx.font = "900 19px Arial";
  ctx.fillText("KEYCHRON", x + 55, 383);
  ctx.fillStyle = "#ffe08a";
  ctx.fillRect(x + 25, 424, 62, 70);
  ctx.fillStyle = "#2a1d3a";
  ctx.fillRect(x + 112, 421, 124, 52);
  // Halloween keyboard in the window: orange and black keycaps
  ctx.fillStyle = "#15191c";
  roundedRect(ctx, x + 132, 439, 84, 17, 3);
  ctx.fill();
  for (let key = 0; key < 8; key += 1) {
    ctx.fillStyle = key % 3 === 0 ? SPOOKY.pumpkin : "#e8e2f2";
    ctx.fillRect(x + 137 + key * 9, 443, 6, 4);
    ctx.fillStyle = key % 3 === 1 ? SPOOKY.purpleLight : "#e8e2f2";
    ctx.fillRect(x + 137 + key * 9, 449, 6, 4);
  }
  // Cobweb in the corner
  ctx.strokeStyle = "rgba(240,236,255,.55)";
  ctx.lineWidth = 1.2;
  for (let k = 0; k < 4; k += 1) {
    ctx.beginPath();
    ctx.moveTo(x + 264, 406);
    ctx.lineTo(x + 264 - 40 * Math.cos((k / 3) * Math.PI / 2), 406 + 40 * Math.sin((k / 3) * Math.PI / 2));
    ctx.stroke();
  }
  for (const r of [14, 26, 38]) {
    ctx.beginPath();
    ctx.arc(x + 264, 406, r, Math.PI / 2, Math.PI);
    ctx.stroke();
  }
  // Little spider dangling
  const sy = 430 + Math.sin(elapsed * 2) * 8;
  ctx.beginPath();
  ctx.moveTo(x + 240, 406);
  ctx.lineTo(x + 240, sy);
  ctx.stroke();
  ctx.fillStyle = "#0d0a12";
  ctx.beginPath();
  ctx.arc(x + 240, sy + 4, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawTinyGrave(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = SPOOKY.stoneDark;
  roundedRect(ctx, x, y, 18, 18, 7);
  ctx.fill();
  ctx.fillRect(x, y + 8, 18, 10);
  ctx.fillStyle = "#3d3a4a";
  ctx.fillRect(x + 5, y + 6, 8, 2);
  ctx.fillRect(x + 8, y + 3, 2, 8);
}

// ---------------------------------------------------------------------------
// Shared spooky shapes
// ---------------------------------------------------------------------------

export function drawPumpkin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  lit: boolean,
  elapsed: number,
) {
  const cx = x + w / 2;
  const cy = y + h * 0.56;
  // Ribbed body: three overlapping lobes
  ctx.fillStyle = SPOOKY.pumpkinDark;
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.22, cy, w * 0.3, h * 0.44, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + w * 0.22, cy, w * 0.3, h * 0.44, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = SPOOKY.pumpkin;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.3, h * 0.46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(120,40,0,.45)";
  ctx.lineWidth = Math.max(1, w * 0.03);
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.22, cy, w * 0.3, h * 0.44, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + w * 0.22, cy, w * 0.3, h * 0.44, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Stem
  ctx.fillStyle = SPOOKY.stem;
  ctx.fillRect(cx - w * 0.05, y, w * 0.1, h * 0.18);
  if (lit) {
    const flicker = 0.8 + Math.sin(elapsed * 11 + x) * 0.12;
    ctx.fillStyle = `rgba(255,214,107,${flicker})`;
    // Triangle eyes
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * w * 0.16, cy - h * 0.18);
      ctx.lineTo(cx + side * w * 0.26, cy - h * 0.02);
      ctx.lineTo(cx + side * w * 0.06, cy - h * 0.02);
      ctx.closePath();
      ctx.fill();
    }
    // Zig-zag grin
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.26, cy + h * 0.08);
    ctx.lineTo(cx - w * 0.14, cy + h * 0.2);
    ctx.lineTo(cx - w * 0.05, cy + h * 0.12);
    ctx.lineTo(cx + w * 0.05, cy + h * 0.22);
    ctx.lineTo(cx + w * 0.14, cy + h * 0.12);
    ctx.lineTo(cx + w * 0.26, cy + h * 0.08);
    ctx.lineTo(cx + w * 0.18, cy + h * 0.28);
    ctx.lineTo(cx - w * 0.18, cy + h * 0.28);
    ctx.closePath();
    ctx.fill();
  }
}

export function drawGhostShape(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, t: number) {
  const w = size;
  const h = size * 1.15;
  ctx.fillStyle = SPOOKY.ghost;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy + h * 0.35);
  ctx.lineTo(cx - w / 2, cy - h * 0.1);
  ctx.arc(cx, cy - h * 0.1, w / 2, Math.PI, 0);
  ctx.lineTo(cx + w / 2, cy + h * 0.35);
  // Wavy hem
  const waves = 4;
  for (let k = waves; k >= 0; k -= 1) {
    const wx = cx - w / 2 + (k / waves) * w;
    const wy = cy + h * 0.35 + (k % 2 ? 1 : -1) * h * 0.08 * Math.sin(t * 6 + k);
    ctx.lineTo(wx, wy + (k % 2 ? h * 0.1 : 0));
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = SPOOKY.ghostShade;
  ctx.fillRect(cx + w * 0.18, cy - h * 0.3, w * 0.12, h * 0.55);
  // Face
  ctx.fillStyle = "#1b1d22";
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.16, cy - h * 0.12, w * 0.08, h * 0.1, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + w * 0.12, cy - h * 0.12, w * 0.08, h * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx - w * 0.02, cy + h * 0.08, w * 0.09, h * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawBat(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, flap: number, color: string) {
  const wing = Math.sin(flap) * 0.6;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  // Ears
  ctx.beginPath();
  ctx.moveTo(-5, -6);
  ctx.lineTo(-3, -14);
  ctx.lineTo(-1, -7);
  ctx.moveTo(5, -6);
  ctx.lineTo(3, -14);
  ctx.lineTo(1, -7);
  ctx.fill();
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 5, -3);
    ctx.quadraticCurveTo(side * 20, -18 - wing * 18, side * 34, -6 - wing * 14);
    ctx.quadraticCurveTo(side * 28, 0, side * 24, 4);
    ctx.quadraticCurveTo(side * 18, -2, side * 14, 6);
    ctx.quadraticCurveTo(side * 9, 0, side * 5, 5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Obstacles (drawn inside the same boxes as the PAX art)
// ---------------------------------------------------------------------------

type ObstacleLike = {
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hit: boolean;
  smashed?: number; // seconds since it was stomped or zapped (undefined = intact)
};

export function drawHalloweenObstacle(ctx: CanvasRenderingContext2D, obstacle: ObstacleLike, elapsed: number) {
  const { x, y, width: w, height: h } = obstacle;
  ctx.save();
  ctx.globalAlpha = obstacle.hit ? 0.45 : 1;
  const shadow = (cx: number, rw: number) => {
    ctx.fillStyle = "rgba(0,0,0,.3)";
    ctx.beginPath();
    ctx.ellipse(cx, GROUND_Y + 4, rw, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  if (obstacle.smashed !== undefined) {
    drawSmashed(ctx, obstacle, elapsed);
    ctx.restore();
    return;
  }

  switch (obstacle.kind) {
    case "bomb": {
      // Witch's pumpkin bomb: a lit pumpkin with a sparking fuse
      const cx = x + w / 2;
      if (y + h >= GROUND_Y - 1) shadow(cx, w * 0.6);
      drawPumpkin(ctx, x - 4, y + 2, w + 8, h - 2, true, elapsed);
      ctx.strokeStyle = "#2a1a0e";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, y + 2);
      ctx.quadraticCurveTo(cx + 8, y - 8, cx + 12, y - 14);
      ctx.stroke();
      const spark = 4 + Math.sin(elapsed * 30) * 2;
      ctx.fillStyle = "#ffe066";
      ctx.beginPath();
      ctx.arc(cx + 12, y - 14, spark, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ff4d1a";
      ctx.beginPath();
      ctx.arc(cx + 12, y - 14, spark * 0.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "cone": {
      // Jack-o'-lantern (jump)
      shadow(x + w / 2, w * 0.62);
      drawPumpkin(ctx, x - 6, y + 4, w + 12, h - 4, true, elapsed);
      break;
    }
    case "barrier": {
      // Two gravestones with grass (jump)
      shadow(x + w / 2, w * 0.6);
      const stone = (sx: number, sw: number, sh: number, label: string) => {
        ctx.fillStyle = SPOOKY.stone;
        roundedRect(ctx, sx, y + h - sh, sw, sh, sw * 0.45);
        ctx.fill();
        ctx.fillRect(sx, y + h - sh * 0.55, sw, sh * 0.55);
        ctx.fillStyle = SPOOKY.stoneDark;
        ctx.fillRect(sx + sw - 7, y + h - sh + 10, 7, sh - 10);
        ctx.fillStyle = "#3d3a4a";
        ctx.font = `900 ${Math.round(sw * 0.32)}px Arial`;
        ctx.textAlign = "center";
        ctx.fillText(label, sx + sw / 2 - 2, y + h - sh * 0.45);
        ctx.textAlign = "left";
      };
      stone(x + 2, w * 0.5, h, "RIP");
      stone(x + w * 0.52, w * 0.46, h * 0.78, "BOO");
      ctx.fillStyle = "#2f5a26";
      for (let gx = x - 4; gx < x + w + 4; gx += 8) {
        ctx.beginPath();
        ctx.moveTo(gx, y + h);
        ctx.lineTo(gx + 4, y + h - 12);
        ctx.lineTo(gx + 8, y + h);
        ctx.fill();
      }
      break;
    }
    case "puddle": {
      // Bubbling green slime (jump)
      ctx.fillStyle = SPOOKY.slimeDark;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h * 0.62, w * 0.55, h * 0.62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = SPOOKY.slime;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h * 0.5, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      for (let k = 0; k < 3; k += 1) {
        const t = (elapsed * 0.9 + k * 0.33) % 1;
        ctx.fillStyle = `rgba(200,255,150,${0.9 * (1 - t)})`;
        ctx.beginPath();
        ctx.arc(x + w * (0.25 + k * 0.25), y + h * 0.3 - t * 16, 3 + t * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "boxes": {
      // Upright coffin (jump)
      shadow(x + w / 2, w * 0.6);
      ctx.fillStyle = "#4a2c22";
      ctx.beginPath();
      ctx.moveTo(x + w * 0.3, y);
      ctx.lineTo(x + w * 0.7, y);
      ctx.lineTo(x + w, y + h * 0.28);
      ctx.lineTo(x + w * 0.78, y + h);
      ctx.lineTo(x + w * 0.22, y + h);
      ctx.lineTo(x, y + h * 0.28);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#2a1712";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = "#d9b44a";
      ctx.fillRect(x + w / 2 - 3, y + h * 0.2, 6, h * 0.42);
      ctx.fillRect(x + w / 2 - 14, y + h * 0.3, 28, 6);
      break;
    }
    case "truck": {
      // Black hearse with purple trim (jump); drawn 25% bigger like the truck
      const dw = w * 1.25;
      const dh = h * 1.25;
      const dx = x - (dw - w) / 2;
      const dy = y + h - dh;
      shadow(x + w / 2, dw * 0.55);
      ctx.fillStyle = "#16121e";
      roundedRect(ctx, dx, dy + dh * 0.28, dw, dh * 0.56, 8);
      ctx.fill();
      roundedRect(ctx, dx + dw * 0.08, dy, dw * 0.62, dh * 0.4, 10);
      ctx.fill();
      ctx.fillStyle = SPOOKY.purple;
      ctx.fillRect(dx, dy + dh * 0.52, dw, 5);
      ctx.fillStyle = "rgba(185,138,240,.55)";
      roundedRect(ctx, dx + dw * 0.14, dy + dh * 0.08, dw * 0.22, dh * 0.22, 4);
      ctx.fill();
      ctx.fillStyle = "rgba(255,214,107,.85)";
      roundedRect(ctx, dx + dw * 0.72, dy + dh * 0.36, dw * 0.16, dh * 0.14, 3);
      ctx.fill();
      // A ghost peeking from the back window
      ctx.save();
      ctx.globalAlpha *= 0.9;
      drawGhostShape(ctx, dx + dw * 0.48, dy + dh * 0.16, dw * 0.16, elapsed);
      ctx.restore();
      for (const wx of [dx + dw * 0.2, dx + dw * 0.78]) {
        ctx.fillStyle = "#0b0a0f";
        ctx.beginPath();
        ctx.arc(wx, dy + dh * 0.86, dh * 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#8a8798";
        ctx.beginPath();
        ctx.arc(wx, dy + dh * 0.86, dh * 0.06, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "hand": {
      // Skeleton hand bursting up from the road (jump)
      shadow(x + w / 2, w * 0.6);
      ctx.fillStyle = "#3a2e22";
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h - 2, w * 0.62, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      const wave = Math.sin(elapsed * 6) * 0.08;
      ctx.save();
      ctx.translate(x + w / 2, y + h);
      ctx.rotate(wave);
      ctx.fillStyle = SPOOKY.bone;
      ctx.strokeStyle = SPOOKY.boneShade;
      ctx.lineWidth = 2;
      roundedRect(ctx, -9, -h * 0.55, 18, h * 0.55, 6); // forearm
      ctx.fill();
      ctx.stroke();
      roundedRect(ctx, -w * 0.32, -h * 0.8, w * 0.64, h * 0.3, 8); // palm
      ctx.fill();
      ctx.stroke();
      const fingers = [-0.26, -0.09, 0.08, 0.25];
      fingers.forEach((fx, k) => {
        const len = h * (k === 1 || k === 2 ? 0.26 : 0.2);
        roundedRect(ctx, fx * w - 4, -h * 0.8 - len, 8, len + 4, 4);
        ctx.fill();
        ctx.stroke();
      });
      roundedRect(ctx, w * 0.3, -h * 0.66, w * 0.2, 8, 4); // thumb
      ctx.fill();
      ctx.restore();
      break;
    }
    case "sign": {
      // Hanging wooden "BOO!" sign (slide under)
      ctx.strokeStyle = "#2b2233";
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(x + 13, y - 65);
      ctx.lineTo(x + 13, y + h + 80);
      ctx.stroke();
      ctx.fillStyle = "#6b4426";
      roundedRect(ctx, x, y, w, h, 6);
      ctx.fill();
      ctx.strokeStyle = "#4a2e18";
      ctx.lineWidth = 3;
      for (let k = 1; k < 3; k += 1) {
        ctx.beginPath();
        ctx.moveTo(x + 4, y + (h * k) / 3);
        ctx.lineTo(x + w - 4, y + (h * k) / 3);
        ctx.stroke();
      }
      ctx.fillStyle = SPOOKY.pumpkin;
      ctx.font = "900 24px Arial";
      ctx.textAlign = "center";
      ctx.fillText("BOO!", x + w / 2, y + 33);
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(126,224,74,.9)"; // slime drips
      for (const dx of [0.3, 0.62, 0.85]) {
        ctx.fillRect(x + w * dx, y + h - 2, 5, 8 + Math.sin(elapsed * 2 + dx * 9) * 4);
      }
      break;
    }
    case "banner": {
      // Giant cobweb from the top with a spider (slide under)
      ctx.strokeStyle = "rgba(240,236,255,.85)";
      ctx.lineWidth = 2;
      const cx = x + w / 2;
      const bottom = y + h;
      const spokes = 7;
      for (let k = 0; k < spokes; k += 1) {
        const a = Math.PI * (k / (spokes - 1));
        ctx.beginPath();
        ctx.moveTo(cx, y);
        ctx.lineTo(cx + Math.cos(a) * w * 0.55, y + Math.sin(a) * (h + 6));
        ctx.stroke();
      }
      for (let ring = 1; ring <= 6; ring += 1) {
        const f = ring / 6;
        ctx.beginPath();
        for (let k = 0; k < spokes; k += 1) {
          const a = Math.PI * (k / (spokes - 1));
          const px = cx + Math.cos(a) * w * 0.55 * f;
          const py = y + Math.sin(a) * (h + 6) * f;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.quadraticCurveTo((cx + px) / 2 + (px - cx) * 0.4, (y + py) / 2 + (py - y) * 0.6, px, py);
        }
        ctx.stroke();
      }
      // Spider hanging at the bottom edge
      const sy = bottom - 10 + Math.sin(elapsed * 2.2) * 4;
      ctx.beginPath();
      ctx.moveTo(cx, y + h * 0.6);
      ctx.lineTo(cx, sy);
      ctx.stroke();
      ctx.fillStyle = "#120c18";
      ctx.beginPath();
      ctx.ellipse(cx, sy + 8, 13, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#120c18";
      ctx.lineWidth = 3;
      for (const side of [-1, 1]) {
        for (let k = 0; k < 4; k += 1) {
          ctx.beginPath();
          ctx.moveTo(cx + side * 8, sy + 2 + k * 5);
          ctx.quadraticCurveTo(cx + side * 22, sy - 6 + k * 6, cx + side * 26, sy + 8 + k * 6);
          ctx.stroke();
        }
      }
      ctx.fillStyle = "#ff3b3b";
      ctx.fillRect(cx - 5, sy + 4, 3, 3);
      ctx.fillRect(cx + 2, sy + 4, 3, 3);
      break;
    }
    case "drone": {
      // Floating ghost at head height (slide under)
      const bob = Math.sin(elapsed * 3 + x * 0.01) * 4;
      drawGhostShape(ctx, x + w / 2, y + h * 0.35 + bob, Math.min(w, h * 1.7), elapsed);
      break;
    }
    case "bats": {
      // Swarm of bats at head height (slide under): light outline and lighter
      // purple bodies so they read against the night sky without a halo
      for (let k = 0; k < 5; k += 1) {
        const bx = x + 14 + (k % 3) * (w / 3) + Math.sin(elapsed * 4 + k) * 6;
        const by = y + 8 + (k % 2) * (h * 0.55) + Math.cos(elapsed * 5 + k * 2) * 4;
        drawBat(ctx, bx, by, 1.08, elapsed * 16 + k * 1.3, "#f4eeff");
        drawBat(ctx, bx, by, 0.92, elapsed * 16 + k * 1.3, "#5a3f7d");
        ctx.fillStyle = "#ff3b3b";
        ctx.fillRect(bx - 3, by - 2, 2, 2);
        ctx.fillRect(bx + 1, by - 2, 2, 2);
      }
      break;
    }
    case "plane": {
      // Witch on a broomstick flying low (stay on the ground)
      const cx = x + w / 2;
      const cy = y + h / 2;

      ctx.strokeStyle = "#7a4a22";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x + 8, cy + 14);
      ctx.lineTo(x + w - 20, cy + 14);
      ctx.stroke();
      ctx.fillStyle = "#e8b24a";
      ctx.beginPath();
      ctx.moveTo(x + w - 24, cy + 8);
      ctx.lineTo(x + w + 10, cy - 2 + Math.sin(elapsed * 16) * 3);
      ctx.lineTo(x + w + 12, cy + 30);
      ctx.lineTo(x + w - 24, cy + 20);
      ctx.closePath();
      ctx.fill();
      // Cloak and body
      ctx.fillStyle = SPOOKY.purple;
      ctx.beginPath();
      ctx.moveTo(cx - 14, cy + 12);
      ctx.lineTo(cx + 34, cy + 16 + Math.sin(elapsed * 10) * 4);
      ctx.lineTo(cx + 6, cy - 12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#7ac36a"; // face
      ctx.beginPath();
      ctx.arc(cx - 14, cy - 12, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2a1640"; // hat, with a light edge so it shows on the night sky
      ctx.beginPath();
      ctx.moveTo(cx - 32, cy - 18);
      ctx.lineTo(cx + 4, cy - 18);
      ctx.lineTo(cx - 6, cy - 50);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#e8dcff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillRect(cx - 34, cy - 20, 40, 5);
      ctx.fillStyle = SPOOKY.purple;
      ctx.fillRect(cx - 22, cy - 24, 20, 4);
      ctx.fillStyle = "#ff3b3b";
      ctx.fillRect(cx - 20, cy - 14, 3, 3);
      // "Stay low" hint like the plane's banner
      ctx.fillStyle = "rgba(21,18,28,.85)";
      roundedRect(ctx, x + 6, y + h + 6, 92, 22, 7);
      ctx.fill();
      ctx.fillStyle = SPOOKY.pumpkin;
      ctx.font = "900 13px Arial";
      ctx.fillText("STAY LOW!", x + 16, y + h + 22);
      break;
    }
    default:
      ctx.fillStyle = SPOOKY.purple;
      ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Collectibles
// ---------------------------------------------------------------------------

type CollectibleLike = { x: number; y: number; size: number; phase: number; color: string };

const CANDY_WRAPS = [SPOOKY.pumpkin, SPOOKY.purple, "#2fb67c", "#e23b5a"];

/** Candy in place of the switches: wrapped sweets, candy corn and lollipops. */
export function drawCandy(ctx: CanvasRenderingContext2D, candy: CollectibleLike, elapsed: number) {
  const bob = Math.sin(elapsed * 5 + candy.phase) * 6;
  const s = candy.size;
  const style = Math.floor(candy.phase * 10) % 3;
  ctx.save();
  ctx.translate(candy.x + s / 2, candy.y + s / 2 + bob);
  ctx.rotate(Math.sin(elapsed * 3 + candy.phase) * 0.18);
  ctx.fillStyle = "rgba(255,214,107,.22)";
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.55, 0, Math.PI * 2);
  ctx.fill();
  if (style === 0) {
    // Wrapped sweet
    const wrap = CANDY_WRAPS[Math.floor(candy.phase * 7) % CANDY_WRAPS.length];
    ctx.fillStyle = wrap;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * s * 0.2, 0);
      ctx.lineTo(side * s * 0.48, -s * 0.2);
      ctx.lineTo(side * s * 0.48, s * 0.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.28, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.fillRect(-s * 0.16, -s * 0.12, s * 0.12, s * 0.05);
    ctx.strokeStyle = "rgba(0,0,0,.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-s * 0.06, -s * 0.18);
    ctx.lineTo(s * 0.06, s * 0.18);
    ctx.stroke();
  } else if (style === 1) {
    // Candy corn
    const tri = (y0: number, y1: number, half0: number, half1: number, color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-half0, y0);
      ctx.lineTo(half0, y0);
      ctx.lineTo(half1, y1);
      ctx.lineTo(-half1, y1);
      ctx.closePath();
      ctx.fill();
    };
    tri(s * 0.32, s * 0.12, s * 0.3, s * 0.21, "#ffd84e");
    tri(s * 0.12, -s * 0.12, s * 0.21, s * 0.11, SPOOKY.pumpkin);
    tri(-s * 0.12, -s * 0.36, s * 0.11, s * 0.01, "#fff8ee");
    ctx.strokeStyle = "rgba(0,0,0,.25)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, s * 0.32);
    ctx.lineTo(0, -s * 0.36);
    ctx.lineTo(s * 0.3, s * 0.32);
    ctx.closePath();
    ctx.stroke();
  } else {
    // Swirl lollipop
    ctx.strokeStyle = "#f1ead6";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, s * 0.1);
    ctx.lineTo(0, s * 0.48);
    ctx.stroke();
    ctx.fillStyle = SPOOKY.purple;
    ctx.beginPath();
    ctx.arc(0, -s * 0.08, s * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = SPOOKY.pumpkin;
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 5; a += 0.3) {
      const r = (a / (Math.PI * 5)) * s * 0.25;
      const px = Math.cos(a) * r;
      const py = -s * 0.08 + Math.sin(a) * r;
      if (a === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

type KeycapLike = { x: number; y: number; size: number; phase: number; letter: string };

/** KEYCHRON letters as glowing pumpkin-orange keycaps. */
export function drawPumpkinKeycap(ctx: CanvasRenderingContext2D, keycap: KeycapLike, elapsed: number) {
  const bob = Math.sin(elapsed * 4 + keycap.phase) * 5;
  const s = keycap.size;
  const glow = 0.55 + Math.sin(elapsed * 6 + keycap.phase) * 0.25;
  ctx.save();
  ctx.translate(keycap.x + s / 2, keycap.y + s / 2 + bob);
  ctx.rotate(Math.sin(elapsed * 2.4 + keycap.phase) * 0.06);
  ctx.fillStyle = `rgba(255,150,40,${glow * 0.45})`;
  roundedRect(ctx, -s * 0.56, -s * 0.56, s * 1.12, s * 1.12, 13);
  ctx.fill();
  ctx.fillStyle = SPOOKY.pumpkinDark;
  roundedRect(ctx, -s * 0.42, -s * 0.42, s * 0.84, s * 0.84, 8);
  ctx.fill();
  ctx.fillStyle = SPOOKY.pumpkin;
  roundedRect(ctx, -s * 0.34, -s * 0.36, s * 0.68, s * 0.6, 6);
  ctx.fill();
  ctx.fillStyle = SPOOKY.stem;
  ctx.fillRect(-3, -s * 0.5, 6, s * 0.12);
  ctx.fillStyle = "#1b1220";
  ctx.font = `900 ${Math.round(s * 0.36)}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(keycap.letter, 0, -s * 0.05);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Stomp / zap debris
// ---------------------------------------------------------------------------

function drawSmashed(ctx: CanvasRenderingContext2D, o: ObstacleLike, elapsed: number) {
  const t = clamp((o.smashed ?? 0) / 0.6, 0, 1);
  const cx = o.x + o.width / 2;
  const cy = o.y + o.height / 2;
  ctx.globalAlpha = 1 - t;
  const flyer = o.kind === "drone" || o.kind === "bats" || o.kind === "plane";
  if (flyer) {
    // Poof of purple smoke and sparkles
    for (let k = 0; k < 7; k += 1) {
      const a = (k / 7) * Math.PI * 2;
      const r = 14 + t * 46;
      ctx.fillStyle = k % 2 ? "rgba(199,164,245,.8)" : "rgba(244,241,255,.85)";
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 12 * (1 - t) + 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#ffd84e";
    ctx.font = "900 22px Arial";
    ctx.textAlign = "center";
    ctx.fillText("ZAP!", cx, cy - 20 - t * 30);
    ctx.textAlign = "left";
    return;
  }
  // Stomped: chunks flying apart and a splat on the road
  const colors = o.kind === "boxes" ? ["#4a2c22", "#6b4426"] : o.kind === "hand" ? [SPOOKY.bone, SPOOKY.boneShade] : o.kind === "barrier" || o.kind === "truck" ? [SPOOKY.stone, SPOOKY.stoneDark] : [SPOOKY.pumpkin, SPOOKY.pumpkinDark];
  ctx.fillStyle = "rgba(255,122,26,.35)";
  ctx.beginPath();
  ctx.ellipse(cx, GROUND_Y - 2, o.width * 0.7, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let k = 0; k < 8; k += 1) {
    const a = -Math.PI * (0.1 + (k / 7) * 0.8);
    const r = 10 + t * 70;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r + t * t * 60;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(elapsed * 8 + k);
    ctx.fillStyle = colors[k % 2];
    ctx.fillRect(-7, -5, 14, 10);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Thrown candy
// ---------------------------------------------------------------------------

export type Projectile = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  targetId: number | null; // obstacle id it homes in on; -1 = the witch boss
};

export function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile) {
  ctx.save();
  ctx.translate(p.x, p.y);
  // Motion trail
  ctx.fillStyle = "rgba(255,214,107,.35)";
  ctx.beginPath();
  ctx.ellipse(-22, 0, 22, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(p.spin);
  ctx.fillStyle = SPOOKY.pumpkin;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 6, 0);
    ctx.lineTo(side * 15, -7);
    ctx.lineTo(side * 15, 7);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = SPOOKY.purple;
  ctx.beginPath();
  ctx.ellipse(0, 0, 9, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.8)";
  ctx.fillRect(-5, -4, 4, 2);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Witch boss
// ---------------------------------------------------------------------------

export type WitchBoss = {
  phase: "enter" | "fight" | "leave";
  timer: number; // seconds left in the current phase
  hp: number;
  x: number;
  y: number;
  bombTimer: number;
  hurt: number; // flash after a hit
  defeated: boolean;
};

export const BOSS_W = 170;
export const BOSS_H = 120;

export function drawWitchBoss(ctx: CanvasRenderingContext2D, boss: WitchBoss, elapsed: number) {
  const { x, y } = boss;
  const cx = x + BOSS_W / 2;
  const cy = y + BOSS_H / 2;
  ctx.save();
  if (boss.hurt > 0 && Math.floor(boss.hurt * 20) % 2 === 0) ctx.globalAlpha = 0.45;
  ctx.lineCap = "round";
  // Broom
  ctx.strokeStyle = "#7a4a22";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(x + 4, cy + 30);
  ctx.lineTo(x + BOSS_W - 34, cy + 30);
  ctx.stroke();
  ctx.fillStyle = "#e8b24a";
  ctx.beginPath();
  ctx.moveTo(x + BOSS_W - 40, cy + 20);
  ctx.lineTo(x + BOSS_W + 14, cy + 8 + Math.sin(elapsed * 16) * 4);
  ctx.lineTo(x + BOSS_W + 16, cy + 54);
  ctx.lineTo(x + BOSS_W - 40, cy + 40);
  ctx.closePath();
  ctx.fill();
  // Cloak, flapping
  ctx.fillStyle = SPOOKY.purple;
  ctx.beginPath();
  ctx.moveTo(cx - 28, cy + 26);
  ctx.lineTo(cx + 62, cy + 34 + Math.sin(elapsed * 9) * 7);
  ctx.lineTo(cx + 14, cy - 18);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#2a1640";
  ctx.fillRect(cx - 24, cy - 12, 34, 40);
  // Face (looking left, at the rider)
  ctx.fillStyle = "#7ac36a";
  ctx.beginPath();
  ctx.arc(cx - 24, cy - 20, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath(); // long nose
  ctx.moveTo(cx - 38, cy - 22);
  ctx.lineTo(cx - 54, cy - 14);
  ctx.lineTo(cx - 36, cy - 14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ff3b3b";
  ctx.fillRect(cx - 34, cy - 26, 5, 5);
  ctx.fillStyle = "#1b1d22";
  ctx.fillRect(cx - 36, cy - 10, 12, 3); // grin
  // Hat
  ctx.fillStyle = "#1a0f2a";
  ctx.beginPath();
  ctx.moveTo(cx - 54, cy - 30);
  ctx.lineTo(cx + 6, cy - 30);
  ctx.lineTo(cx - 14, cy - 86 + Math.sin(elapsed * 3) * 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#e8dcff";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillRect(cx - 58, cy - 34, 68, 8);
  ctx.fillStyle = SPOOKY.pumpkin;
  ctx.fillRect(cx - 40, cy - 42, 32, 6);
  // Wand arm pointing down at the road
  ctx.strokeStyle = "#2a1640";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(cx - 14, cy);
  ctx.lineTo(cx - 40, cy + 18);
  ctx.stroke();
  ctx.strokeStyle = "#e8e2f2";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 40, cy + 18);
  ctx.lineTo(cx - 56, cy + 36);
  ctx.stroke();
  ctx.fillStyle = "#7ee04a";
  ctx.beginPath();
  ctx.arc(cx - 56, cy + 36, 4 + Math.sin(elapsed * 20) * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Boss health and timer at the top of the screen. */
export function drawBossHud(ctx: CanvasRenderingContext2D, boss: WitchBoss, maxHp: number, fightSeconds: number) {
  const w = 360;
  const x = WORLD_WIDTH / 2 - w / 2;
  const y = 120;
  ctx.save();
  ctx.fillStyle = "rgba(21,10,34,.92)";
  roundedRect(ctx, x, y, w, 56, 16);
  ctx.fill();
  ctx.strokeStyle = SPOOKY.slime;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = SPOOKY.slime;
  ctx.font = "900 15px 'Courier New', monospace";
  ctx.textAlign = "left";
  const label = boss.defeated ? "WITCH DEFEATED!" : boss.phase === "leave" ? "THE WITCH FLEES" : "WITCH ATTACK! HIT HER WITH CANDY (X)";
  ctx.fillText(label, x + 16, y + 22);
  for (let k = 0; k < maxHp; k += 1) {
    ctx.fillStyle = k < boss.hp ? "#7ee04a" : "rgba(255,255,255,.18)";
    roundedRect(ctx, x + 16 + k * 40, y + 32, 34, 12, 5);
    ctx.fill();
  }
  if (boss.phase === "fight") {
    ctx.fillStyle = "rgba(255,255,255,.2)";
    roundedRect(ctx, x + 150, y + 34, w - 166, 8, 4);
    ctx.fill();
    ctx.fillStyle = SPOOKY.pumpkin;
    roundedRect(ctx, x + 150, y + 34, Math.max(8, (w - 166) * clamp(boss.timer / fightSeconds, 0, 1)), 8, 4);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Trick-or-treat doors
// ---------------------------------------------------------------------------

export type Door = { id: number; x: number; knocked: boolean; result: string | null; resultTimer: number; treat: boolean };

export const DOOR_W = 92;

/** A haunted front door on the footpath (screen x, scrolling with the road). */
export function drawDoor(ctx: CanvasRenderingContext2D, door: Door, elapsed: number, canKnock: boolean, keyLabel: string) {
  const x = door.x;
  const top = 380;
  const h = 114;
  ctx.save();
  // Wall, frame and steps
  ctx.fillStyle = "#3a2a4f";
  ctx.fillRect(x - 18, top - 16, DOOR_W + 36, h + 16);
  ctx.fillStyle = "#24182f";
  ctx.beginPath();
  ctx.moveTo(x - 26, top - 16);
  ctx.lineTo(x + DOOR_W / 2, top - 52);
  ctx.lineTo(x + DOOR_W + 26, top - 16);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = door.knocked ? (door.treat ? "#ffe08a" : "#4a1f2a") : "#6b3a1e";
  roundedRect(ctx, x, top, DOOR_W, h, 10);
  ctx.fill();
  if (!door.knocked) {
    ctx.strokeStyle = "#4a2410";
    ctx.lineWidth = 3;
    roundedRect(ctx, x + 12, top + 12, DOOR_W - 24, 38, 6);
    ctx.stroke();
    roundedRect(ctx, x + 12, top + 58, DOOR_W - 24, 44, 6);
    ctx.stroke();
    ctx.fillStyle = "#d9b44a"; // knocker
    ctx.beginPath();
    ctx.arc(x + DOOR_W / 2, top + 54, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6b3a1e";
    ctx.beginPath();
    ctx.arc(x + DOOR_W / 2, top + 54, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#5c5a6b";
  ctx.fillRect(x - 10, top + h, DOOR_W + 20, 8);
  drawPumpkin(ctx, x - 30, top + h - 30, 30, 28, true, elapsed);
  // Sign above the door
  ctx.fillStyle = "rgba(21,10,34,.9)";
  roundedRect(ctx, x - 22, top - 96, DOOR_W + 44, 30, 9);
  ctx.fill();
  ctx.fillStyle = SPOOKY.pumpkin;
  ctx.font = "900 14px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText("TRICK OR TREAT?", x + DOOR_W / 2, top - 76);
  if (canKnock) {
    // Big key cap + "KNOCK!" bouncing above the door, with an arrow down to it
    const bounce = Math.abs(Math.sin(elapsed * 6)) * 8;
    const cx = x + DOOR_W / 2;
    const by = top - 170 - bounce;
    ctx.fillStyle = "rgba(21,10,34,.92)";
    roundedRect(ctx, cx - 78, by, 156, 56, 14);
    ctx.fill();
    ctx.strokeStyle = "#ffd84e";
    ctx.lineWidth = 3;
    ctx.stroke();
    // key cap
    ctx.fillStyle = "#d8d2c4";
    roundedRect(ctx, cx - 66, by + 8, 42, 42, 8);
    ctx.fill();
    ctx.fillStyle = "#fffdf8";
    roundedRect(ctx, cx - 64, by + 8, 38, 34, 7);
    ctx.fill();
    ctx.fillStyle = "#1b1220";
    ctx.font = "900 22px Arial";
    ctx.fillText(keyLabel, cx - 45, by + 33);
    ctx.fillStyle = "#ffd84e";
    ctx.font = "900 22px Arial";
    ctx.fillText("KNOCK!", cx + 24, by + 36);
    ctx.fillStyle = "#ffd84e";
    ctx.beginPath();
    ctx.moveTo(cx - 10, by + 60);
    ctx.lineTo(cx + 10, by + 60);
    ctx.lineTo(cx, by + 74);
    ctx.closePath();
    ctx.fill();
  }
  ctx.textAlign = "left";
  ctx.restore();
}

/** Centre-screen hint while a door can be knocked on. */
export function drawKnockHint(ctx: CanvasRenderingContext2D, text: string, elapsed: number) {
  ctx.save();
  ctx.globalAlpha = 0.8 + Math.sin(elapsed * 8) * 0.2;
  ctx.textAlign = "center";
  ctx.font = "900 30px Arial";
  ctx.lineWidth = 7;
  ctx.strokeStyle = "rgba(21,10,34,.9)";
  ctx.strokeText(text, WORLD_WIDTH / 2, 262);
  ctx.fillStyle = "#ffd84e";
  ctx.fillText(text, WORLD_WIDTH / 2, 262);
  ctx.restore();
}

/** Ammo counter for throwing candy (top right, under the lives). */
export function drawAmmoHud(ctx: CanvasRenderingContext2D, ammo: number, keyLabel: string) {
  const x = WORLD_WIDTH - 278;
  const y = 112;
  ctx.save();
  ctx.fillStyle = "rgba(21,18,28,.86)";
  roundedRect(ctx, x, y, 250, 40, 14);
  ctx.fill();
  ctx.translate(x + 24, y + 20);
  drawCandy(ctx, { x: -16, y: -16, size: 32, phase: 0.05, color: "" }, 0);
  ctx.restore();
  ctx.fillStyle = ammo > 0 ? "#ffd84e" : "rgba(255,255,255,.45)";
  ctx.font = "900 15px 'Courier New', monospace";
  ctx.fillText(`× ${ammo}`, x + 48, y + 26);
  ctx.fillStyle = "rgba(255,255,255,.7)";
  ctx.font = "800 12px Arial";
  ctx.fillText(`THROW: ${keyLabel}`, x + 110, y + 25);
}

/** Banner for an active trick (mirror controls, fog). */
export function drawCurseBanner(ctx: CanvasRenderingContext2D, label: string, seconds: number) {
  ctx.save();
  ctx.translate(WORLD_WIDTH / 2, 196);
  ctx.font = "900 18px 'Courier New', monospace";
  const text = `${label} · ${Math.ceil(seconds)}`;
  const w = Math.ceil(ctx.measureText(text).width) + 40;
  ctx.fillStyle = "rgba(74,31,42,.92)";
  roundedRect(ctx, -w / 2, -18, w, 36, 12);
  ctx.fill();
  ctx.fillStyle = "#ffb3c1";
  ctx.textAlign = "center";
  ctx.fillText(text, 0, 6);
  ctx.restore();
}

/** Fog trick: drifting fog over the street (thinner near the rider so play stays fair). */
export function drawFogCurse(ctx: CanvasRenderingContext2D, elapsed: number, strength: number) {
  for (let k = 0; k < 8; k += 1) {
    const fx = ((k * 220 - elapsed * 90) % (WORLD_WIDTH + 400) + WORLD_WIDTH + 400) % (WORLD_WIDTH + 400) - 200;
    const fy = 380 + (k % 4) * 45 + Math.sin(elapsed + k) * 10;
    const nearRider = fx < 520 ? 0.5 : 1;
    ctx.fillStyle = `rgba(225,215,245,${0.42 * strength * nearRider})`;
    ctx.beginPath();
    ctx.ellipse(fx, fy, 230, 60, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Big "TREAT!"/"TRICK!" text after knocking. */
export function drawDoorResult(ctx: CanvasRenderingContext2D, text: string, treat: boolean, timer: number) {
  ctx.save();
  ctx.globalAlpha = clamp(timer / 0.4, 0, 1);
  ctx.textAlign = "center";
  ctx.font = "900 46px Arial";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(21,10,34,.9)";
  const y = 280 - (1.6 - timer) * 20;
  ctx.strokeText(text, WORLD_WIDTH / 2, y);
  ctx.fillStyle = treat ? "#ffd84e" : "#ff6b8a";
  ctx.fillText(text, WORLD_WIDTH / 2, y);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Rails and rooftops (platforms you can land on from above)
// ---------------------------------------------------------------------------

export type Platform = { id: number; kind: "rail" | "roof"; x: number; width: number; top: number };

/** Graveyard iron rail on posts. */
export function drawRail(ctx: CanvasRenderingContext2D, rail: Platform, elapsed: number, grinding: boolean) {
  const { x, width, top } = rail;
  ctx.save();
  // Posts down to the road
  ctx.fillStyle = "#2b2633";
  for (let px = x + 16; px < x + width - 8; px += 120) {
    ctx.fillRect(px, top + 6, 8, GROUND_Y - top - 6);
    ctx.fillStyle = "#3b3546";
    ctx.fillRect(px - 4, GROUND_Y - 6, 16, 6);
    ctx.fillStyle = "#2b2633";
  }
  // Rail bar with a shine, and spiky finials at both ends
  ctx.fillStyle = "#4a4458";
  roundedRect(ctx, x, top, width, 10, 5);
  ctx.fill();
  ctx.fillStyle = grinding ? "#ffd84e" : "#bdb4d6";
  ctx.fillRect(x + 6, top + 1, width - 12, 3);
  for (const ex of [x - 2, x + width - 10]) {
    ctx.fillStyle = "#2b2633";
    ctx.fillRect(ex, top - 14, 12, 24);
    ctx.beginPath();
    ctx.moveTo(ex - 2, top - 14);
    ctx.lineTo(ex + 6, top - 26);
    ctx.lineTo(ex + 14, top - 14);
    ctx.closePath();
    ctx.fill();
  }
  // Little "GRIND" tag so players know they can land on it
  if (!grinding) {
    const bob = Math.sin(elapsed * 4 + x * 0.01) * 3;
    ctx.fillStyle = "rgba(21,10,34,.85)";
    roundedRect(ctx, x + width / 2 - 34, top - 34 + bob, 68, 20, 7);
    ctx.fill();
    ctx.fillStyle = "#ffd84e";
    ctx.font = "900 12px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText("GRIND", x + width / 2, top - 20 + bob);
    ctx.textAlign = "left";
  }
  ctx.restore();
}

/** Raised stone rooftop / bridge slab on pillars; the road stays visible under it. */
export function drawRooftop(ctx: CanvasRenderingContext2D, roof: Platform, elapsed: number) {
  const { x, width, top } = roof;
  ctx.save();
  // Pillars
  ctx.fillStyle = "#2a2236";
  for (const px of [x + 18, x + width - 40]) {
    ctx.fillRect(px, top + 22, 22, GROUND_Y - top - 22);
  }
  // Slab: thick tiled top with a light walking edge, dark face below
  ctx.fillStyle = "#15101d";
  ctx.fillRect(x - 6, top - 2, width + 12, 34);
  ctx.fillStyle = "#3a2e4d";
  ctx.fillRect(x - 4, top + 12, width + 8, 18);
  ctx.fillStyle = "#7a5442";
  ctx.fillRect(x - 4, top, width + 8, 12);
  ctx.fillStyle = "#9c7058";
  for (let tx = x; tx < x + width; tx += 26) ctx.fillRect(tx, top + 2, 20, 5);
  ctx.fillStyle = "#f2d3a8";
  ctx.fillRect(x - 4, top, width + 8, 2);
  // Edge lanterns
  for (const lx of [x + 8, x + width - 16]) {
    ctx.fillStyle = "#1b1220";
    ctx.fillRect(lx + 3, top - 18, 2, 18);
    const flicker = 0.75 + Math.sin(elapsed * 9 + lx) * 0.2;
    ctx.fillStyle = `rgba(255,190,80,${flicker})`;
    ctx.fillRect(lx, top - 26, 8, 9);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Missions
// ---------------------------------------------------------------------------

export type MissionKind = "smash" | "zap" | "grind" | "candy" | "combo" | "door" | "roof" | "powerup";
export type Mission = { kind: MissionKind; target: number; progress: number; level: number };

export function missionText(m: Mission) {
  switch (m.kind) {
    case "smash": return `Stomp on ${m.target} spooky things`;
    case "zap": return `Zap ${m.target} ghosts or bats`;
    case "grind": return `Grind for ${m.target} seconds`;
    case "candy": return `Grab ${m.target} candy`;
    case "combo": return `Get a ${m.target}x candy combo`;
    case "door": return m.target === 1 ? "Knock on a door" : `Knock on ${m.target} doors`;
    case "roof": return m.target === 1 ? "Land on a rooftop" : `Land on ${m.target} rooftops`;
    case "powerup": return m.target === 1 ? "Grab a power-up" : `Grab ${m.target} power-ups`;
  }
}

/** Mission card at the top centre, between the score and lives panels. */
export function drawMissionHud(ctx: CanvasRenderingContext2D, m: Mission, doneFlash: number) {
  const x = 562;
  const y = 24;
  const w = 422;
  ctx.save();
  ctx.fillStyle = doneFlash > 0 ? "rgba(126,224,74,.9)" : "rgba(21,18,28,.86)";
  roundedRect(ctx, x, y, w, 78, 18);
  ctx.fill();
  ctx.fillStyle = doneFlash > 0 ? "#15121c" : SPOOKY.purpleLight;
  ctx.font = "800 14px 'Courier New', monospace";
  ctx.fillText(doneFlash > 0 ? "MISSION COMPLETE!" : `MISSION ${m.level}`, x + 20, y + 25);
  ctx.fillStyle = doneFlash > 0 ? "#15121c" : "#ffffff";
  ctx.font = "900 19px Arial";
  ctx.fillText(missionText(m), x + 20, y + 52);
  const shown = Math.min(m.progress, m.target);
  const label = m.kind === "grind" ? `${shown.toFixed(1)}/${m.target}` : `${Math.floor(shown)}/${m.target}`;
  ctx.font = "900 15px 'Courier New', monospace";
  ctx.textAlign = "right";
  ctx.fillText(label, x + w - 18, y + 52);
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,.18)";
  roundedRect(ctx, x + 20, y + 62, w - 40, 7, 3.5);
  ctx.fill();
  ctx.fillStyle = doneFlash > 0 ? "#15121c" : SPOOKY.pumpkin;
  roundedRect(ctx, x + 20, y + 62, Math.max(7, (w - 40) * clamp(m.progress / m.target, 0, 1)), 7, 3.5);
  ctx.fill();
  ctx.restore();
}

/** Banner at the top while a haunted stretch is on. */
export function drawHauntedBanner(ctx: CanvasRenderingContext2D, haunted: number, elapsed: number) {
  if (haunted <= 0) return;
  const appear = clamp(Math.min((10 - haunted) * 4, haunted * 2), 0, 1);
  ctx.save();
  ctx.globalAlpha = appear;
  ctx.translate(WORLD_WIDTH / 2, 132);
  const label = `HAUNTED STRETCH · POINTS x2 · ${Math.ceil(haunted)}`;
  ctx.font = "900 20px 'Courier New', monospace";
  const w = Math.ceil(ctx.measureText(label).width) + 48;
  ctx.fillStyle = "rgba(21,10,34,.9)";
  roundedRect(ctx, -w / 2, -20, w, 40, 14);
  ctx.fill();
  ctx.strokeStyle = SPOOKY.purpleLight;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = Math.sin(elapsed * 8) > 0 ? SPOOKY.pumpkin : "#ffd84e";
  ctx.textAlign = "center";
  ctx.fillText(label, 0, 7);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function hexAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function mix(a: string, b: string, t: number) {
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((x >> shift) & 255) + ((((y >> shift) & 255) - ((x >> shift) & 255)) * t));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
