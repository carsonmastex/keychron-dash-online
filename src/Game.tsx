import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import keychronLogoUrl from "../assets/keychron-logo.png";
import {
  HALLOWEEN,
  POWER_UP_INFO,
  drawBroomRide,
  drawCandy,
  drawHalloweenBackground,
  drawHalloweenObstacle,
  drawHauntedBanner,
  drawPlayerAura,
  drawPowerUpHud,
  drawPowerUpItem,
  drawPowerUpIcon,
  drawPumpkinKeycap,
  BOSS_H,
  BOSS_W,
  DOOR_W,
  drawAmmoHud,
  drawBossHud,
  drawCurseBanner,
  drawSwappedSign,
  makePumpkinKeychronLogo,
  drawDoor,
  drawDoorResult,
  drawFogCurse,
  drawKnockHint,
  drawProjectile,
  drawWitchBoss,
  drawRail,
  drawRooftop,
  drawMissionHud,
  drawBalanceMeter,
  type Mission,
  type MissionKind,
  type Platform,
  type ActivePower,
  type Door,
  type PowerUpItem,
  type PowerUpKind,
  type Projectile,
  type WitchBoss,
} from "./halloween";
import paxLogoUrl from "../assets/pax-aus-logo.png";
import paxFlagsLogoUrl from "../assets/pax26-flags-logo-sm.png";
import {
  addScore,
  startRun,
  SubmitError,
  subscribeLeaderboard,
  type LeaderboardEntry,
} from "./leaderboard";
import { isBlockedName } from "./profanity";

const WORLD_WIDTH = 1280;
const WORLD_HEIGHT = 720;
const GROUND_Y = 570;

// Booth difficulty: runs should last about a minute so the queue keeps moving.
// Online version (Carson, 2026-10-07): same difficulty as the Taiwan Pizza Dash.
// The booth version (keychron-pax) keeps its own faster tuning.
// Speed rises smoothly by distance: +1 every 480 m, from 6.6 up to 14.8 (at ~3.9 km).
const START_SPEED = 6.6;
const MAX_SPEED = 14.8;
const SPEED_GAIN_METRES = 480;
const FIRST_OBSTACLE_SECONDS = 2.3;
const OBSTACLE_GAP_BASE = 1.72; // seconds between obstacles at the start
const OBSTACLE_GAP_RANDOM = 0.62;
const OBSTACLE_RAMP_METRES = 2000; // gap shrinks by 1s over this distance
const OBSTACLE_GAP_MIN_CUT = 0.65; // most the gap can shrink
// Fairness: clear road (in seconds of travel) required between the end of one
// obstacle and the start of the next. A perfect bot needs up to 0.7 s at top
// speed (cone then boxes); the extra is reaction time for real players.
const MIN_CLEAR_SECONDS = 0.85;
const HIT_INVINCIBLE_SECONDS = 1.35;
const KEYCHRON_SHIELD_SECONDS = 3.2;

type GameMode = "ready" | "running" | "paused" | "gameover";
type ObstacleKind =
  | "cone"
  | "barrier"
  | "sign"
  | "puddle"
  | "plane"
  | "boxes" // jump: tall stack of PAX merch boxes
  | "banner" // slide: hanging PAX banner
  | "drone" // slide: camera drone at head height
  | "truck" // jump: a little Keychron delivery truck
  | "hand" // Halloween, jump: skeleton hand out of the road
  | "bats" // Halloween, slide: swarm of bats at head height
  | "spider" // Halloween: drops from a cobweb you hit with candy (jump it or stomp it)
  | "bomb"; // Halloween boss: pumpkin bomb dropped by the witch (jump it or stomp it)

// Spawn weights; `from` is the distance (m) where the obstacle starts appearing.
const OBSTACLE_TABLE: { kind: ObstacleKind; weight: number; from: number }[] = [
  { kind: "plane", weight: 16, from: 0 },
  { kind: "cone", weight: 18, from: 0 },
  { kind: "barrier", weight: 11, from: 0 },
  { kind: "puddle", weight: 8, from: 0 },
  { kind: "sign", weight: 10, from: 0 },
  { kind: "banner", weight: 11, from: 0 },
  { kind: "boxes", weight: 11, from: 0 },
  { kind: "drone", weight: 10, from: 0 },
  { kind: "truck", weight: 11, from: 0 },
  // Halloween-only obstacles (same sizes as the cone and the drone)
  ...(HALLOWEEN
    ? [
        { kind: "hand" as const, weight: 9, from: 0 },
        { kind: "bats" as const, weight: 9, from: 0 },
      ]
    : []),
];

// ---- Halloween rules (only used when HALLOWEEN) ----
// Speed is never changed by any of these, so the server's run-time check stays valid.
const POWER_UP_FIRST_SECONDS = 12;
const POWER_UP_GAP_MIN = 16;
const POWER_UP_GAP_RANDOM = 8;
const HAUNTED_EVERY_METRES = 500;
const HAUNTED_SECONDS = 10;
const HAUNTED_POINTS_MULTIPLIER = 2;
const BROOM_HEIGHT = 150; // px above the road while flying
const MAGNET_RADIUS = 300;
const GHOST_PASS_POINTS = 25;
// Stomp: land on these from above to smash them and bounce
const STOMPABLE = new Set<ObstacleKind>(["cone", "boxes", "hand", "truck", "bomb", "spider"]);
const STOMP_POINTS = 150; // x chain: 150, 300, 450 ... until you touch the road
const STOMP_BOUNCE = -820;
// Throwing candy at ghosts, bats and witches
const ZAPPABLE = new Set<ObstacleKind>(["drone", "bats", "plane", "banner"]);
const SPIDER_W = 64;
const SPIDER_H = 40;
const ZAP_POINTS = 200;
const START_AMMO = 3;
const MAX_AMMO = 30;
const THROW_COOLDOWN = 0.25;
// Witch boss every 1,000 m (haunted stretches move to 500, 1,500, 2,500 ...)
const BOSS_EVERY_METRES = 1000;
const BOSS_FIGHT_SECONDS = 15;
const BOSS_HP = 3;
const BOSS_DEFEAT_POINTS = 3000;
const BOSS_SURVIVE_POINTS = 500;
const BOMB_SIZE = 44;
// Pumpkin ghost mini-boss when a haunted stretch (the thunder) ends
const MINI_BOSS_HP = 2;
const MINI_BOSS_FIGHT_SECONDS = 10;
const MINI_BOSS_DEFEAT_POINTS = 1200;
const MINI_BOSS_SURVIVE_POINTS = 300;
// Trick-or-treat doors
const DOOR_FIRST_SECONDS = 20;
const DOOR_GAP_MIN = 22;
const DOOR_GAP_RANDOM = 10;
const TREAT_POINTS = 500;
const CURSE_SECONDS = 5;
// Rails and rooftop routes (one-way platforms: land on them from above)
const PLATFORM_FIRST_SECONDS = 14;
const PLATFORM_GAP_MIN = 10;
const PLATFORM_GAP_RANDOM = 6;
const RAIL_TOP = GROUND_Y - 118; // clears the tallest jump obstacle (boxes, 104)
const ROOF_TOP = GROUND_Y - 150;
const GRIND_POINTS_PER_SECOND = 80; // x1, x2, x3 as you stay balanced
const GRIND_LEVEL_UP_SECONDS = 1.1; // time in the green to go up a level
const GAP_POINTS = 250;
const TRICK_NAMES: Record<string, string> = { ollie: "OLLIE", kickflip: "KICKFLIP", shuvit: "360 SHOVE-IT", grab: "INDY GRAB" };
// While a rail or rooftop is around, only ground obstacles spawn (nothing at head height up there)
const OVERHEAD_KINDS = new Set<ObstacleKind>(["sign", "banner", "plane", "drone", "bats"]);
// Missions
const MISSION_KINDS: MissionKind[] = ["smash", "zap", "grind", "candy", "combo", "door", "roof", "powerup"];
const MISSION_POINTS_BASE = 300;
const MISSION_POINTS_PER_LEVEL = 200;
const MISSION_AMMO = 3;
// Candy combo bonus stops growing here (keeps scores within the server's limits;
// rooftop candy makes very long combos easy)
const COMBO_CAP = 30;
// Halloween: candy must come quicker to keep a combo going, and the combo
// banner only shows from 5 in a row so it isn't on screen all the time
const HALLOWEEN_COMBO_WINDOW = 1.5; // seconds (PAX: 2.4)
const HALLOWEEN_COMBO_SHOW_FROM = 5;

function makeMission(level: number, previous?: MissionKind): Mission {
  const choices = MISSION_KINDS.filter((kind) => kind !== previous);
  const kind = choices[Math.floor(Math.random() * choices.length)];
  const targets: Record<MissionKind, number> = {
    smash: Math.min(8, 2 + level),
    zap: Math.min(8, 2 + level),
    grind: Math.min(5, 1 + Math.ceil(level / 2)), // seconds; one rail gives about 1-2 s
    candy: Math.min(60, 10 + level * 5),
    combo: Math.min(24, 6 + level * 2),
    door: 1 + Math.floor(level / 3),
    roof: 1 + Math.floor(level / 2),
    powerup: 1 + Math.floor(level / 3),
  };
  return { kind, target: targets[kind], progress: 0, level };
}

type Player = {
  x: number;
  y: number;
  width: number;
  height: number;
  velocityY: number;
  grounded: boolean;
  sliding: boolean;
  invincible: number;
  shield: number;
};

type Obstacle = {
  id: number;
  kind: ObstacleKind;
  x: number;
  y: number;
  width: number;
  height: number;
  hit: boolean;
  grazed: boolean;
  smashed?: number; // Halloween: seconds since stomped or zapped
  vy?: number; // Halloween: falling speed of a witch's bomb
};

// Regular collectibles are mechanical switches; the big bonus is a keyboard.
// The internal "pizza" names are kept from the original game.
type Pizza = {
  id: number;
  x: number;
  y: number;
  size: number;
  collected: boolean;
  phase: number;
  color: string;
};

const SWITCH_COLORS = ["#e23b3b", "#2f7de1", "#a0673a", "#f5b21f", "#2fb67c"];

type Keycap = {
  id: number;
  x: number;
  y: number;
  size: number;
  collected: boolean;
  phase: number;
  letter: string;
};

const KEYCHRON_LETTERS = ["K", "E", "Y", "C", "H", "R", "O", "N"] as const;

const LETTER_BOX_SIZE = 22;
const LETTER_GAP = 5;
const LETTER_PANEL_PADDING_X = 18;
const LETTER_PANEL_HEIGHT = 78;
const LETTER_TOTAL_WIDTH =
  KEYCHRON_LETTERS.length * LETTER_BOX_SIZE + (KEYCHRON_LETTERS.length - 1) * LETTER_GAP;
const LETTER_PANEL_WIDTH = LETTER_TOTAL_WIDTH + LETTER_PANEL_PADDING_X * 2;
const LETTER_PANEL_CENTER_X = WORLD_WIDTH / 2;
const LETTER_PANEL_X = LETTER_PANEL_CENTER_X - LETTER_PANEL_WIDTH / 2;
const LETTER_PANEL_Y = WORLD_HEIGHT - LETTER_PANEL_HEIGHT - 26;
const LETTER_START_X = LETTER_PANEL_CENTER_X - LETTER_TOTAL_WIDTH / 2;
const LETTER_TILE_Y = LETTER_PANEL_Y + 32;
const LETTER_TILE_CENTERS = KEYCHRON_LETTERS.map((_, index) => {
  const lx = LETTER_START_X + index * (LETTER_BOX_SIZE + LETTER_GAP);
  return { x: lx + LETTER_BOX_SIZE / 2, y: LETTER_TILE_Y + LETTER_BOX_SIZE / 2 };
});

type LetterFlyEffect = {
  letter: string;
  fromX: number;
  fromY: number;
  timer: number;
  duration: number;
};

type ScorePopup = {
  x: number;
  y: number;
  text: string;
  timer: number;
  duration: number;
  color: string;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
};

type GameState = {
  player: Player;
  obstacles: Obstacle[];
  pizzas: Pizza[];
  keycaps: Keycap[];
  collectedLetters: Set<string>;
  bigPizza: Pizza | null;
  particles: Particle[];
  score: number;
  pizzasCollected: number;
  lives: number;
  distance: number;
  speed: number;
  elapsed: number;
  scroll: number;
  obstacleTimer: number;
  pizzaTimer: number;
  keycapTimer: number;
  keychronCelebration: number;
  keychronCompletions: number;
  bigPizzaBonus: number;
  bigPizzaMissed: number;
  grazeSoundCooldown: number;
  lastMilestone: number;
  milestoneFlash: number;
  milestoneLabel: string;
  letterFlashLetter: string | null;
  letterFlashTimer: number;
  letterFlyEffects: LetterFlyEffect[];
  scorePopups: ScorePopup[];
  combo: number;
  comboTimer: number;
  shake: number;
  nextId: number;
  // Halloween
  powerUps: PowerUpItem[];
  powerUpTimer: number;
  activePower: ActivePower | null;
  pumpkinShield: number; // seconds left; blocks one hit
  broomLift: number; // 0 on the road .. 1 flying
  haunted: number; // seconds left in a haunted stretch
  lightningAge: number; // seconds since the last strike (Infinity = none)
  lightningX: number;
  lightningSeed: number;
  nextLightning: number;
  candyAmmo: number;
  throwCooldown: number;
  projectiles: Projectile[];
  stompChain: number;
  boss: WitchBoss | null;
  doors: Door[];
  doorTimer: number;
  curse: { kind: "mirror" | "fog"; timer: number } | null;
  doorResult: { text: string; treat: boolean; timer: number } | null;
  actionQueued: boolean; // Space / candy button pressed: knock if at a door, else throw
  platforms: Platform[];
  platformTimer: number;
  onPlatform: number | null; // id of the rail/roof the rider is standing on
  grindPoints: number; // points from the current grind (shown when it ends)
  mission: Mission;
  missionFlash: number; // "MISSION COMPLETE" time left; the next mission starts after
  grindBalance: number; // -1 .. 1; fall off the rail at either end
  grindDrift: number;
  grindLevel: number; // points multiplier for staying balanced: 1, 2, 3
  grindSteady: number; // seconds balanced in the green
  grindSoundTimer: number;
  jumpedFromRoof: number | null; // roof id we jumped from (for the gap bonus)
};

type Hud = {
  score: number;
  pizzas: number;
  lives: number;
  distance: number;
};

type GameOverView = "entry" | "leaderboard";

type SoundEffect =
  | "start"
  | "jump"
  | "hit"
  | "pizza"
  | "gameover"
  | "toggle"
  | "keycap"
  | "graze"
  | "keychron"
  | "bigpizza"
  | "miss"
  | "milestone"
  | "powerup"
  | "haunted"
  | "shieldbreak"
  | "throw"
  | "zap"
  | "stomp"
  | "boss"
  | "treat"
  | "trick"
  | "thunder"
  | "grind";

type AudioBus = {
  context: AudioContext;
  music: GainNode;
  sfx: GainNode;
  noise: AudioBuffer;
};

const PRIVACY_POLICY_URL = "https://keychron.com.au/policies/privacy-policy";

const normalizePlayerName = (value: string) =>
  Array.from(value.trim().replace(/\s+/g, " ")).slice(0, 12).join("");

const freshGame = (): GameState => ({
  player: {
    x: 180,
    y: GROUND_Y - 116,
    width: 150,
    height: 116,
    velocityY: 0,
    grounded: true,
    sliding: false,
    invincible: 0,
    shield: 0,
  },
  obstacles: [],
  pizzas: [],
  keycaps: [],
  collectedLetters: new Set(),
  bigPizza: null,
  particles: [],
  score: 0,
  pizzasCollected: 0,
  lives: 3,
  distance: 0,
  speed: START_SPEED,
  elapsed: 0,
  scroll: 0,
  obstacleTimer: FIRST_OBSTACLE_SECONDS,
  pizzaTimer: 0.8,
  keycapTimer: 6 + Math.random() * 3,
  keychronCelebration: 0,
  keychronCompletions: 0,
  bigPizzaBonus: 1000,
  bigPizzaMissed: 0,
  grazeSoundCooldown: 0,
  lastMilestone: 0,
  milestoneFlash: 0,
  milestoneLabel: "",
  letterFlashLetter: null,
  letterFlashTimer: 0,
  letterFlyEffects: [],
  scorePopups: [],
  combo: 0,
  comboTimer: 0,
  shake: 0,
  nextId: 1,
  powerUps: [],
  powerUpTimer: POWER_UP_FIRST_SECONDS,
  activePower: null,
  pumpkinShield: 0,
  broomLift: 0,
  haunted: 0,
  lightningAge: Infinity,
  lightningX: 0,
  lightningSeed: 1,
  nextLightning: 0,
  candyAmmo: START_AMMO,
  throwCooldown: 0,
  projectiles: [],
  stompChain: 0,
  boss: null,
  doors: [],
  doorTimer: DOOR_FIRST_SECONDS,
  curse: null,
  doorResult: null,
  actionQueued: false,
  platforms: [],
  platformTimer: PLATFORM_FIRST_SECONDS,
  onPlatform: null,
  grindPoints: 0,
  mission: makeMission(1),
  missionFlash: 0,
  grindBalance: 0,
  grindDrift: 0,
  grindLevel: 1,
  grindSteady: 0,
  grindSoundTimer: 0,
  jumpedFromRoof: null,
});

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const lerpColor = (hexA: string, hexB: string, t: number) => {
  const a = parseInt(hexA.slice(1), 16);
  const b = parseInt(hexB.slice(1), 16);
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
};

const overlaps = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

// Large event keyboards are often numpad-style: NumLock toggles Numpad6's
// event.key between "ArrowRight" and "6", so match event.code AND event.key
// to stay reliable regardless of NumLock state.
// Game time comes from our own copy of the clock, taken when the page loads,
// not from the timestamp the browser hands to requestAnimationFrame. Scripts
// pasted into the console later can't slow the game down by faking it.
const gameClock = performance.now.bind(performance);
// Each frame simulates the real time that passed, in steps of at most
// MAX_STEP_SECONDS, so a low frame rate (or a throttled one) doesn't turn
// into slow motion. Longer stalls are capped so a hiccup can't teleport
// the rider into an obstacle.
const MAX_STEP_SECONDS = 0.034;
const MAX_CATCH_UP_SECONDS = 0.25;

// Phones and tablets (no mouse): show the on-screen pad and "TAP" prompts
const IS_TOUCH_DEVICE =
  typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;

// Two presses of R within this window restart a run
const RESTART_DOUBLE_PRESS_MS = 500;

// W A S D work as well as the arrow keys
const isLeftKey = (event: KeyboardEvent) =>
  event.code === "ArrowLeft" || event.code === "Numpad4" || event.key === "ArrowLeft" || event.code === "KeyA";
const isRightKey = (event: KeyboardEvent) =>
  event.code === "ArrowRight" || event.code === "Numpad6" || event.key === "ArrowRight" || event.code === "KeyD";
const isUpKey = (event: KeyboardEvent) =>
  event.code === "ArrowUp" || event.code === "Numpad8" || event.key === "ArrowUp" || event.code === "KeyW";
const isDownKey = (event: KeyboardEvent) =>
  event.code === "ArrowDown" || event.code === "Numpad2" || event.key === "ArrowDown" || event.code === "KeyS";
// Halloween: Space throws candy / knocks (X still works too); jump is W / ↑
const isActionKey = (event: KeyboardEvent) => event.code === "Space" || event.code === "KeyX";
const ACTION_KEY_LABEL = "SPACE";

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/** Draws an image scaled to fit inside the box, keeping its aspect ratio. */
function drawImageFit(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (!image.complete || image.naturalWidth === 0) return;
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h);
  ctx.restore();
}

function drawKeychronLogo(
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement,
  x: number,
  y: number,
  size: number,
  white = false,
) {
  if (!logo.complete || logo.naturalWidth === 0) return;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  if (white) ctx.filter = "invert(1)";
  ctx.drawImage(logo, x, y, size, size);
  ctx.restore();
}

function scheduleTone(
  audio: AudioContext,
  destination: AudioNode,
  start: number,
  duration: number,
  startFrequency: number,
  endFrequency: number,
  gain: number,
  type: OscillatorType = "sine",
  detune = 0,
) {
  const oscillator = audio.createOscillator();
  const envelope = audio.createGain();
  oscillator.type = type;
  oscillator.detune.value = detune;
  oscillator.frequency.setValueAtTime(startFrequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(1, endFrequency),
    start + duration,
  );
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + Math.min(0.018, duration * 0.2));
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(envelope);
  envelope.connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function scheduleNoise(
  bus: AudioBus,
  destination: AudioNode,
  start: number,
  duration: number,
  gain: number,
  frequency: number,
  filterType: BiquadFilterType = "bandpass",
  q = 0.8,
  attack = 0.008,
) {
  const source = bus.context.createBufferSource();
  const filter = bus.context.createBiquadFilter();
  const envelope = bus.context.createGain();
  source.buffer = bus.noise;
  // The noise buffer is only 1 s long: loop it so longer sounds don't cut off with a click
  source.loop = true;
  filter.type = filterType;
  filter.frequency.setValueAtTime(frequency, start);
  filter.Q.value = q;
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + attack);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(destination);
  source.start(start);
  source.stop(start + duration + 0.02);
}

function scheduleYelp(
  bus: AudioBus,
  destination: AudioNode,
  start: number,
) {
  const { context } = bus;
  const envelope = context.createGain();
  const lowFormant = context.createBiquadFilter();
  const highFormant = context.createBiquadFilter();
  const lowMix = context.createGain();
  const highMix = context.createGain();
  const voice = context.createOscillator();
  const voiceDouble = context.createOscillator();
  const duration = 0.27;

  voice.type = "sawtooth";
  voice.frequency.setValueAtTime(205, start);
  voice.frequency.exponentialRampToValueAtTime(365, start + 0.065);
  voice.frequency.exponentialRampToValueAtTime(155, start + duration);

  voiceDouble.type = "triangle";
  voiceDouble.detune.value = 11;
  voiceDouble.frequency.setValueAtTime(205, start);
  voiceDouble.frequency.exponentialRampToValueAtTime(365, start + 0.065);
  voiceDouble.frequency.exponentialRampToValueAtTime(155, start + duration);

  lowFormant.type = "bandpass";
  lowFormant.frequency.value = 760;
  lowFormant.Q.value = 2.3;
  highFormant.type = "bandpass";
  highFormant.frequency.value = 1320;
  highFormant.Q.value = 3.1;
  lowMix.gain.value = 1;
  highMix.gain.value = 0.58;

  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(0.2, start + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.15, start + 0.09);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  voice.connect(lowFormant);
  voice.connect(highFormant);
  voiceDouble.connect(lowFormant);
  lowFormant.connect(lowMix);
  highFormant.connect(highMix);
  lowMix.connect(envelope);
  highMix.connect(envelope);
  envelope.connect(destination);

  voice.start(start);
  voiceDouble.start(start);
  voice.stop(start + duration + 0.02);
  voiceDouble.stop(start + duration + 0.02);
  scheduleNoise(bus, destination, start, 0.12, 0.035, 2200, "bandpass", 1.1);
}

// ---- Halloween soundtrack ----
// Its own slower tune (108 bpm), not a re-key of the PAX one. Deliberately a
// different timbre from the candy "plink" bells: a wobbling theremin lead in a
// lower register, a pizzicato bass walk, a dark organ pad and a heartbeat.
export const SPOOKY_BPM = 108;
const N = (name: string) => {
  const table: Record<string, number> = {
    A1: 55, D2: 73.42, E2: 82.41, F2: 87.31, A2: 110, C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, "G#3": 207.65,
    A3: 220, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, "G#4": 415.3,
    A4: 440, B4: 493.88, C5: 523.25,
  };
  return table[name];
};
// Theremin lead: one entry per bar, [note, start step, length in steps]
const SPOOKY_LEAD: [string, number, number][][] = [
  [["E4", 0, 6], ["A4", 6, 4], ["C5", 10, 6]],
  [["B4", 0, 6], ["A4", 6, 4], ["F4", 10, 6]],
  [["D4", 0, 6], ["F4", 6, 4], ["A4", 10, 6]],
  [["G#4", 0, 8], ["B4", 8, 4], ["E4", 12, 4]],
];
const SPOOKY_BARS = [
  { bass: ["A2", "E3", "A2", "C3"], pad: ["A3", "C4", "E4"] },
  { bass: ["F2", "C3", "F2", "A2"], pad: ["F3", "A3", "C4"] },
  { bass: ["D2", "A2", "D2", "F2"], pad: ["F3", "A3", "D4"] },
  { bass: ["E2", "B3", "E2", "G#3"], pad: ["E3", "G#3", "B3"] },
];

function scheduleTheremin(bus: AudioBus, start: number, duration: number, frequency: number, gain: number) {
  const { context, music } = bus;
  const oscillator = context.createOscillator();
  const vibrato = context.createOscillator();
  const vibratoDepth = context.createGain();
  const envelope = context.createGain();
  oscillator.type = "sine";
  // Slide up into the note, like a theremin player finding the pitch
  oscillator.frequency.setValueAtTime(frequency * 0.94, start);
  oscillator.frequency.exponentialRampToValueAtTime(frequency, start + 0.12);
  vibrato.frequency.value = 5.2;
  vibratoDepth.gain.setValueAtTime(0, start);
  vibratoDepth.gain.linearRampToValueAtTime(frequency * 0.018, start + duration * 0.5);
  vibrato.connect(vibratoDepth);
  vibratoDepth.connect(oscillator.frequency);
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.09);
  envelope.gain.setValueAtTime(gain, start + duration * 0.7);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(envelope);
  envelope.connect(music);
  oscillator.start(start);
  vibrato.start(start);
  oscillator.stop(start + duration + 0.02);
  vibrato.stop(start + duration + 0.02);
}

function scheduleSpookyMusicStep(bus: AudioBus, step: number, start: number, stepLength: number) {
  const { context, music } = bus;
  const s = step % (SPOOKY_BARS.length * 16);
  const barIndex = Math.floor(s / 16);
  const bar = SPOOKY_BARS[barIndex];
  const inBar = s % 16;
  for (const [name, at, length] of SPOOKY_LEAD[barIndex]) {
    if (at === inBar) scheduleTheremin(bus, start, stepLength * length, N(name), 0.032);
  }
  // Pizzicato bass walk on every beat (short, low, no bell partials)
  if (inBar % 4 === 0) {
    const f = N(bar.bass[inBar / 4]);
    scheduleTone(context, music, start, stepLength * 1.8, f, f * 0.99, 0.065, "triangle");
  }
  // Dark organ pad: a soft minor chord held through the bar
  if (inBar === 0) {
    bar.pad.forEach((name, index) => {
      const f = N(name);
      scheduleTone(context, music, start, stepLength * 16, f, f, 0.009, "triangle", (index - 1) * 7);
    });
  }
  // Heartbeat: thump-thump on beat 1 of every bar
  if (inBar === 0 || inBar === 2) {
    scheduleTone(context, music, start, stepLength * 1.6, inBar === 0 ? 90 : 75, 45, inBar === 0 ? 0.08 : 0.06, "sine");
  }
}

function scheduleMusicStep(bus: AudioBus, step: number, start: number, stepLength: number) {
  if (HALLOWEEN) {
    scheduleSpookyMusicStep(bus, step, start, stepLength);
    return;
  }
  const melody = [
    659.25, 0, 783.99, 0, 880, 783.99, 659.25, 0,
    587.33, 0, 659.25, 783.99, 523.25, 0, 659.25, 0,
    698.46, 0, 880, 0, 987.77, 880, 698.46, 0,
    659.25, 0, 587.33, 659.25, 783.99, 0, 523.25, 0,
  ];
  const roots = [130.81, 174.61, 220, 196];
  const chordTones = [
    [261.63, 329.63, 392],
    [349.23, 440, 523.25],
    [440, 523.25, 659.25],
    [392, 493.88, 587.33],
  ];
  const normalizedStep = step % melody.length;
  const chordIndex = Math.floor(normalizedStep / 8) % chordTones.length;
  const note = melody[normalizedStep];

  if (note) {
    scheduleTone(
      bus.context,
      bus.music,
      start,
      stepLength * 1.65,
      note,
      note,
      0.035,
      "triangle",
      -4,
    );
    scheduleTone(
      bus.context,
      bus.music,
      start,
      stepLength * 1.3,
      note * 2,
      note * 2,
      0.009,
      "sine",
      5,
    );
  }

  if (normalizedStep % 4 === 0) {
    const root = roots[chordIndex];
    scheduleTone(
      bus.context,
      bus.music,
      start,
      stepLength * 3.2,
      root,
      root * 0.995,
      0.055,
      "triangle",
    );
    chordTones[chordIndex].forEach((frequency, index) => {
      scheduleTone(
        bus.context,
        bus.music,
        start + 0.012 * index,
        stepLength * 2.6,
        frequency,
        frequency,
        0.012,
        "sine",
        index * 3 - 3,
      );
    });
    scheduleTone(
      bus.context,
      bus.music,
      start,
      stepLength * 0.9,
      125,
      48,
      0.075,
      "sine",
    );
  }

  if (normalizedStep % 2 === 0) {
    scheduleNoise(bus, bus.music, start, stepLength * 0.42, 0.017, 7200, "highpass", 0.3);
  }
  if (normalizedStep % 8 === 4) {
    scheduleNoise(bus, bus.music, start, stepLength * 1.1, 0.035, 1700, "bandpass", 0.7);
  }
}

// ---- Halloween sound set ----
// Everything is in A minor (the spooky music's key) so effects never clash
// with the soundtrack. Candy plinks walk up an A-minor pentatonic scale with
// the combo and wrap around, instead of getting ever higher.
const SPOOKY_PENTATONIC = [880, 1046.5, 1174.66, 1318.51, 1567.98];

/** Plays the Halloween version of an effect. Returns false if it has none. */
function playHalloweenSound(bus: AudioBus, effect: SoundEffect, combo: number, now: number): boolean {
  const { context, sfx } = bus;
  const tone = (start: number, duration: number, from: number, to: number, gain: number, type: OscillatorType = "sine", detune = 0) =>
    scheduleTone(context, sfx, start, duration, from, to, gain, type, detune);
  // Bell / music-box timbre: fundamental plus soft inharmonic partials
  const bell = (start: number, frequency: number, gain: number, duration = 0.5) => {
    tone(start, duration, frequency, frequency, gain, "sine");
    tone(start, duration * 0.7, frequency * 2.01, frequency * 2.01, gain * 0.32, "sine");
    tone(start, duration * 0.45, frequency * 2.76, frequency * 2.76, gain * 0.14, "sine");
  };

  switch (effect) {
    case "pizza": {
      // Candy: a music-box plink on the pentatonic scale
      const note = SPOOKY_PENTATONIC[Math.max(0, combo - 1) % SPOOKY_PENTATONIC.length];
      bell(now, note, 0.05, 0.28);
      return true;
    }
    case "jump":
      scheduleNoise(bus, sfx, now, 0.18, 0.03, 700, "bandpass", 0.6, 0.03);
      tone(now, 0.16, 196, 392, 0.05, "triangle");
      return true;
    case "keycap":
      // Letter: two spooky celesta notes
      bell(now, 880, 0.05, 0.4);
      bell(now + 0.08, 1318.51, 0.045, 0.45);
      return true;
    case "keychron":
      // Full KEYCHRON: A-minor bell arpeggio over a low hum
      [440, 523.25, 659.25, 880, 1046.5].forEach((frequency, index) => bell(now + index * 0.08, frequency, 0.055, 0.6));
      tone(now, 0.9, 110, 110, 0.05, "triangle");
      return true;
    case "bigpizza":
      // Spooky keyboard bonus: a harp-like run up the pentatonic scale
      [440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66].forEach((frequency, index) =>
        bell(now + index * 0.045, frequency, 0.045, 0.45),
      );
      return true;
    case "graze":
      scheduleNoise(bus, sfx, now, 0.14, 0.025, 1800, "bandpass", 0.7, 0.03);
      return true;
    case "hit":
      // Pumpkin thud and a ghostly "ooh"
      tone(now, 0.3, 150, 55, 0.16, "sine");
      scheduleNoise(bus, sfx, now, 0.22, 0.12, 380, "lowpass", 0.7);
      tone(now + 0.06, 0.45, 330, 220, 0.04, "triangle", -8);
      tone(now + 0.06, 0.45, 333, 222, 0.025, "sine", 8);
      return true;
    case "gameover":
      // Organ "dun dun duuun"
      [293.66, 277.18, 261.63].forEach((frequency, index) => {
        tone(now + index * 0.22, 0.24, frequency, frequency, 0.05, "triangle");
        tone(now + index * 0.22, 0.24, frequency / 2, frequency / 2, 0.04, "sine");
      });
      tone(now + 0.66, 1.1, 220, 216, 0.06, "triangle", -6);
      tone(now + 0.66, 1.1, 110, 108, 0.05, "sine");
      return true;
    case "start":
      bell(now, 440, 0.06, 0.6);
      bell(now + 0.12, 659.25, 0.05, 0.6);
      tone(now, 0.5, 110, 110, 0.04, "triangle");
      return true;
    case "milestone":
      // Church bell
      bell(now, 329.63, 0.08, 1.2);
      bell(now + 0.35, 329.63, 0.05, 1);
      return true;
    case "miss":
      tone(now, 0.25, 329.63, 311.13, 0.045, "triangle");
      tone(now + 0.22, 0.4, 293.66, 261.63, 0.045, "triangle");
      return true;
    case "powerup":
      [880, 1046.5, 1318.51, 1760].forEach((frequency, index) => bell(now + index * 0.05, frequency, 0.04, 0.35));
      return true;
    case "treat":
      [1046.5, 1318.51, 1567.98].forEach((frequency, index) => bell(now + index * 0.07, frequency, 0.045, 0.4));
      return true;
    case "trick":
      tone(now, 0.55, 330, 165, 0.045, "triangle", -12);
      tone(now + 0.03, 0.5, 335, 168, 0.03, "triangle", 12);
      return true;
    case "stomp":
      // Squelchy pumpkin smash
      tone(now, 0.14, 180, 70, 0.1, "sine");
      scheduleNoise(bus, sfx, now, 0.14, 0.07, 600, "lowpass", 0.9);
      bell(now + 0.05, 659.25, 0.025, 0.2);
      return true;
    case "throw":
      scheduleNoise(bus, sfx, now, 0.14, 0.025, 2000, "bandpass", 0.8, 0.03);
      return true;
    case "zap":
      // Ghost "poof"
      tone(now, 0.2, 880, 220, 0.05, "sine");
      scheduleNoise(bus, sfx, now, 0.18, 0.035, 1500, "bandpass", 0.6);
      return true;
    case "shieldbreak":
      scheduleNoise(bus, sfx, now, 0.2, 0.07, 800, "bandpass", 0.8);
      tone(now, 0.22, 330, 140, 0.05, "triangle");
      return true;
    case "boss":
      // Witch cackle: "heh-heh-heh-heh" stepping down
      [784, 740, 698, 659, 622].forEach((frequency, index) => {
        tone(now + index * 0.1, 0.08, frequency, frequency * 0.9, 0.05, "triangle", index % 2 ? 10 : -10);
      });
      scheduleNoise(bus, sfx, now, 0.6, 0.04, 260, "lowpass", 0.8);
      return true;
    case "grind":
      // Long, soft-edged bursts that overlap into one continuous scrape (no clicking)
      scheduleNoise(bus, sfx, now, 0.42, 0.014, 2400, "bandpass", 0.6, 0.12);
      return true;
    default:
      return false; // toggle, haunted, thunder keep their sounds
  }
}

const nightShade = (color: string, dark: string, nightFactor: number) =>
  nightFactor > 0.05 ? lerpColor(color, dark, nightFactor) : color;

function drawLandmarkLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  y: number,
  width: number,
  textColor: string,
  nightFactor: number,
) {
  ctx.fillStyle = nightFactor > 0.1 ? `rgba(255,236,170,${0.7 + nightFactor * 0.3})` : "rgba(255,255,255,.88)";
  roundedRect(ctx, -width / 2, y, width, 20, 3);
  ctx.fill();
  ctx.fillStyle = textColor;
  ctx.font = "900 12px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText(text, 0, y + 14);
}

function drawEurekaTower(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  scale: number,
  nightFactor = 0,
) {
  ctx.save();
  ctx.translate(x, baseY);
  ctx.scale(scale, scale);

  ctx.fillStyle = "rgba(28, 60, 90, .14)";
  ctx.fillRect(-46, -380, 92, 380);

  // Glass shaft
  ctx.fillStyle = nightShade("#3d5f7a", "#121a26", nightFactor);
  ctx.fillRect(-36, -330, 72, 330);
  ctx.fillStyle = nightShade("#55809c", "#18222f", nightFactor);
  ctx.fillRect(-36, -330, 22, 330);

  // Floor lines / lit windows
  for (let floor = -320; floor < -10; floor += 14) {
    ctx.fillStyle = nightFactor > 0.1
      ? `rgba(255,224,140,${(floor / 14) % 3 === 0 ? 0.25 : 0.35 + nightFactor * 0.45})`
      : "rgba(214, 238, 248, .32)";
    ctx.fillRect(-32, floor, 64, 3);
  }

  // Red stripe down the face
  ctx.fillStyle = nightShade("#c8323a", "#4a1418", nightFactor * 0.6);
  ctx.fillRect(10, -300, 8, 290);

  // Gold crown
  ctx.fillStyle = "#e9b949";
  ctx.fillRect(-36, -378, 72, 50);
  ctx.fillStyle = "#f7d77a";
  ctx.fillRect(-36, -378, 22, 50);
  ctx.fillStyle = "#c99a2e";
  for (let line = -372; line < -330; line += 8) ctx.fillRect(-36, line, 72, 2);
  ctx.fillStyle = "#8a96a0";
  ctx.fillRect(-2, -404, 4, 28);

  drawLandmarkLabel(ctx, "EUREKA TOWER", -34, 108, "#2a4b63", nightFactor);
  ctx.restore();
}

function drawFlindersStation(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  scale: number,
  nightFactor = 0,
) {
  ctx.save();
  ctx.translate(x, baseY);
  ctx.scale(scale, scale);

  // Wings
  ctx.fillStyle = nightShade("#e9b35e", "#2b2216", nightFactor);
  ctx.fillRect(-150, -96, 300, 96);
  ctx.fillStyle = nightShade("#c9573a", "#2a1712", nightFactor);
  for (let band = -84; band < 0; band += 22) ctx.fillRect(-150, band, 300, 4);

  // Arched windows
  for (let wx = -136; wx <= 116; wx += 28) {
    if (Math.abs(wx + 10) < 50) continue;
    ctx.fillStyle = nightFactor > 0.1 ? `rgba(255,214,120,${0.55 + nightFactor * 0.45})` : "#7a5233";
    ctx.beginPath();
    ctx.moveTo(wx, -18);
    ctx.lineTo(wx, -58);
    ctx.arc(wx + 8, -58, 8, Math.PI, 0);
    ctx.lineTo(wx + 16, -18);
    ctx.closePath();
    ctx.fill();
  }

  // Central entrance block + big arch
  ctx.fillStyle = nightShade("#f0bd66", "#30261a", nightFactor);
  ctx.fillRect(-58, -150, 116, 150);
  ctx.fillStyle = nightFactor > 0.1 ? `rgba(255,220,140,${0.6 + nightFactor * 0.4})` : "#6b4630";
  ctx.beginPath();
  ctx.moveTo(-38, 0);
  ctx.lineTo(-38, -78);
  ctx.arc(0, -78, 38, Math.PI, 0);
  ctx.lineTo(38, 0);
  ctx.closePath();
  ctx.fill();

  // The famous row of clocks
  for (let clock = 0; clock < 5; clock += 1) {
    const cx = -28 + clock * 14;
    ctx.fillStyle = "#fffbea";
    ctx.beginPath();
    ctx.arc(cx, -22, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3b2a1c";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx, -22);
    ctx.lineTo(cx, -26);
    ctx.moveTo(cx, -22);
    ctx.lineTo(cx + 3, -22);
    ctx.stroke();
  }

  // Green copper dome
  ctx.fillStyle = nightShade("#5f9e8a", "#17262a", nightFactor);
  ctx.beginPath();
  ctx.arc(0, -150, 44, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = nightShade("#7fbfa9", "#1d3034", nightFactor);
  ctx.beginPath();
  ctx.arc(-8, -158, 22, Math.PI, Math.PI * 1.6);
  ctx.lineTo(-8, -158);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#e9b949";
  ctx.fillRect(-3, -212, 6, 20);
  ctx.beginPath();
  ctx.arc(0, -214, 5, 0, Math.PI * 2);
  ctx.fill();

  // Corner clock tower
  ctx.fillStyle = nightShade("#e9b35e", "#2b2216", nightFactor);
  ctx.fillRect(112, -168, 34, 72);
  ctx.fillStyle = nightShade("#5f9e8a", "#17262a", nightFactor);
  ctx.beginPath();
  ctx.moveTo(108, -168);
  ctx.lineTo(129, -196);
  ctx.lineTo(150, -168);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fffbea";
  ctx.beginPath();
  ctx.arc(129, -144, 9, 0, Math.PI * 2);
  ctx.fill();

  drawLandmarkLabel(ctx, "FLINDERS ST", -128, 100, "#7a3a1f", nightFactor);
  ctx.restore();
}

function drawMcec(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  scale: number,
  nightFactor: number,
  paxFlagsLogo: HTMLImageElement,
) {
  ctx.save();
  ctx.translate(x, baseY);
  ctx.scale(scale, scale);

  // Long glass hall with the sloping roof
  ctx.fillStyle = nightShade("#8fb7c6", "#152230", nightFactor);
  ctx.beginPath();
  ctx.moveTo(-190, 0);
  ctx.lineTo(-190, -92);
  ctx.lineTo(190, -128);
  ctx.lineTo(190, 0);
  ctx.closePath();
  ctx.fill();

  // Glass mullions
  ctx.strokeStyle = nightFactor > 0.1 ? `rgba(255,214,120,${0.35 + nightFactor * 0.4})` : "rgba(255,255,255,.45)";
  ctx.lineWidth = 2;
  for (let mx = -176; mx < 190; mx += 22) {
    const roofY = -92 - ((mx + 190) / 380) * 36;
    ctx.beginPath();
    ctx.moveTo(mx, -6);
    ctx.lineTo(mx, roofY + 6);
    ctx.stroke();
  }
  if (nightFactor > 0.1) {
    ctx.fillStyle = `rgba(255,200,90,${nightFactor * 0.28})`;
    ctx.beginPath();
    ctx.moveTo(-186, -4);
    ctx.lineTo(-186, -88);
    ctx.lineTo(186, -122);
    ctx.lineTo(186, -4);
    ctx.closePath();
    ctx.fill();
  }

  // Roof blade
  ctx.fillStyle = nightShade("#2c3a44", "#0c1118", nightFactor);
  ctx.beginPath();
  ctx.moveTo(-206, -88);
  ctx.lineTo(-206, -98);
  ctx.lineTo(212, -138);
  ctx.lineTo(212, -126);
  ctx.closePath();
  ctx.fill();

  // MCEC sign
  ctx.fillStyle = "#1b1d22";
  roundedRect(ctx, -170, -60, 116, 34, 4);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 22px Arial";
  ctx.textAlign = "center";
  ctx.fillText("MCEC", -112, -35);

  // PAX Aus 2026 banner on the facade
  ctx.fillStyle = "#f5b21f";
  ctx.fillRect(-30, -70, 196, 40);
  ctx.fillStyle = "#1b1d22";
  ctx.font = "900 15px Arial";
  ctx.fillText("PAX AUS · 9-11 OCT", 68, -45);

  // PAX 2026 flags logo up on the roof
  if (paxFlagsLogo.complete && paxFlagsLogo.naturalWidth > 0) {
    const logoHeight = 120;
    const logoWidth = (paxFlagsLogo.naturalWidth / paxFlagsLogo.naturalHeight) * logoHeight;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(paxFlagsLogo, 40 - logoWidth / 2, -118 - logoHeight, logoWidth, logoHeight);
  }

  ctx.restore();
}

type GameImages = {
  pax: HTMLImageElement;
  paxFlags: HTMLImageElement;
  keychron: HTMLImageElement;
};

function drawBackground(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  images: GameImages,
) {
  if (HALLOWEEN) {
    drawHalloweenBackground(
      ctx,
      {
        scroll: state.scroll,
        elapsed: state.elapsed,
        haunted: state.haunted,
        lightningAge: state.lightningAge,
        lightningX: state.lightningX,
        lightningSeed: state.lightningSeed,
      },
      images.keychron,
    );
    return;
  }
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, "#74d8f2");
  sky.addColorStop(0.72, "#dff7f7");
  sky.addColorStop(1, "#fff4d4");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  const DAY_CYCLE_LENGTH = 900;
  const rawCycleT = ((state.distance % DAY_CYCLE_LENGTH) + DAY_CYCLE_LENGTH) % DAY_CYCLE_LENGTH / DAY_CYCLE_LENGTH;
  const cycleT = (rawCycleT + 0.25) % 1;
  const altitude = Math.sin(cycleT * Math.PI * 2);
  const nightFactor = clamp(-altitude, 0, 1);
  const duskFactor = clamp(1 - Math.abs(altitude) * 2, 0, 1);

  const horizonY = 500;
  const topY = 90;
  const margin = 90;
  const isDayHalf = cycleT < 0.5;
  const arcProgress = isDayHalf ? cycleT / 0.5 : (cycleT - 0.5) / 0.5;
  const celestialX = margin + arcProgress * (WORLD_WIDTH - margin * 2);
  const celestialY = horizonY - Math.sin(clamp(arcProgress, 0, 1) * Math.PI) * (horizonY - topY);

  if (isDayHalf) {
    ctx.save();
    const sunGlow = ctx.createRadialGradient(
      celestialX, celestialY, 10,
      celestialX, celestialY, 92,
    );
    sunGlow.addColorStop(0, "rgba(255,246,214,.5)");
    sunGlow.addColorStop(1, "rgba(255,226,103,0)");
    ctx.fillStyle = sunGlow;
    ctx.beginPath();
    ctx.arc(celestialX, celestialY, 92, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,210,110,.5)";
    ctx.lineWidth = 3;
    for (let ray = 0; ray < 8; ray += 1) {
      const angle = (ray / 8) * Math.PI * 2 + state.elapsed * 0.06;
      ctx.beginPath();
      ctx.moveTo(celestialX + Math.cos(angle) * 58, celestialY + Math.sin(angle) * 58);
      ctx.lineTo(celestialX + Math.cos(angle) * 76, celestialY + Math.sin(angle) * 76);
      ctx.stroke();
    }

    const sunBody = ctx.createRadialGradient(
      celestialX - 14, celestialY - 14, 6,
      celestialX, celestialY, 50,
    );
    sunBody.addColorStop(0, "#fff6d6");
    sunBody.addColorStop(0.6, "#ffdd6b");
    sunBody.addColorStop(1, "#ffb84d");
    ctx.fillStyle = sunBody;
    ctx.beginPath();
    ctx.arc(celestialX, celestialY, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.save();
    const outerGlow = ctx.createRadialGradient(
      celestialX, celestialY, 4,
      celestialX, celestialY, 110,
    );
    outerGlow.addColorStop(0, "rgba(255,250,222,.5)");
    outerGlow.addColorStop(0.55, "rgba(255,250,222,.18)");
    outerGlow.addColorStop(1, "rgba(255,250,222,0)");
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(celestialX, celestialY, 110, 0, Math.PI * 2);
    ctx.fill();

    const innerGlow = ctx.createRadialGradient(
      celestialX, celestialY, 2,
      celestialX, celestialY, 48,
    );
    innerGlow.addColorStop(0, "rgba(255,253,238,.85)");
    innerGlow.addColorStop(1, "rgba(255,253,238,0)");
    ctx.fillStyle = innerGlow;
    ctx.beginPath();
    ctx.arc(celestialX, celestialY, 48, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = "58px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🌙", celestialX, celestialY);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }

  const cloudOffset = (state.scroll * 0.08) % 1480;
  for (const [baseX, y, scale] of [
    [140, 130, 1],
    [710, 88, 0.72],
    [1220, 176, 0.9],
  ] as const) {
    const x = ((baseX - cloudOffset + 1480) % 1480) - 100;
    ctx.fillStyle = "rgba(255,255,255,.9)";
    ctx.beginPath();
    ctx.arc(x, y, 34 * scale, 0, Math.PI * 2);
    ctx.arc(x + 38 * scale, y - 18 * scale, 44 * scale, 0, Math.PI * 2);
    ctx.arc(x + 82 * scale, y, 31 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  const skylineOffset = (state.scroll * 0.22) % 980;
  for (let repeat = -1; repeat < 3; repeat += 1) {
    const origin = repeat * 980 - skylineOffset;
    const buildings = [
      { x: 0, w: 140, h: 190, c: "#70b3c8" },
      { x: 148, w: 118, h: 244, c: "#4e94ae" },
      { x: 274, w: 182, h: 165, c: "#88c6d4" },
      { x: 464, w: 132, h: 218, c: "#5ba1b6" },
      { x: 604, w: 190, h: 184, c: "#78b9ca" },
      { x: 802, w: 150, h: 258, c: "#4a8fa7" },
    ];
    buildings.forEach((building, index) => {
      const top = GROUND_Y - 76 - building.h;
      ctx.fillStyle = nightFactor > 0.05 ? lerpColor(building.c, "#131a2c", nightFactor) : building.c;
      ctx.fillRect(origin + building.x, top, building.w, building.h);
      for (let wx = 18; wx < building.w - 12; wx += 34) {
        for (let wy = 22; wy < building.h - 14; wy += 42) {
          if ((wx + wy + index) % 3 !== 0) {
            const wxAbs = origin + building.x + wx;
            const wyAbs = top + wy;
            if (nightFactor > 0.1) {
              ctx.fillStyle = `rgba(255,205,110,${nightFactor * 0.4})`;
              ctx.fillRect(wxAbs - 3, wyAbs - 3, 19, 24);
              ctx.fillStyle = `rgba(255,232,170,${0.55 + nightFactor * 0.45})`;
            } else {
              ctx.fillStyle = "rgba(255,244,170,.72)";
            }
            ctx.fillRect(wxAbs, wyAbs, 13, 18);
          }
        }
      }
    });
  }

  const landmarkOffset = (state.scroll * 0.3) % 1980;
  for (let repeat = -1; repeat < 3; repeat += 1) {
    const origin = repeat * 1980 - landmarkOffset;
    drawEurekaTower(ctx, origin + 300, GROUND_Y - 76, 0.9, nightFactor);
    drawFlindersStation(ctx, origin + 960, GROUND_Y - 76, 0.92, nightFactor);
    drawMcec(ctx, origin + 1620, GROUND_Y - 76, 1.3, nightFactor, images.paxFlags);
  }

  // Night glow used to be drawn with ctx.filter = "blur(...)" (up to 21 blurs
  // per frame), which made the game lag every time night fell. Soft glows are
  // now plain translucent rectangles.
  const shopLit = nightFactor > 0.15;
  const litWindowColor = "#ffe08a";
  const litDisplayColor = "#fff0c2";
  const glow = (color: string, x: number, y: number, w: number, h: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(x - 8, y - 8, w + 16, h + 16);
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  };

  const shopOffset = (state.scroll * 0.55) % 1560;
  for (let repeat = -1; repeat < 2; repeat += 1) {
    const paxX = 140 + repeat * 1560 - shopOffset;
    ctx.fillStyle = nightShade("#2a2c33", "#15161b", nightFactor);
    ctx.fillRect(paxX, 352, 264, 142);
    if (shopLit) glow(`rgba(245,178,31,${nightFactor * 0.22})`, paxX, 352, 264, 46);
    ctx.fillStyle = "#f5b21f";
    ctx.fillRect(paxX, 352, 264, 46);
    ctx.fillStyle = "#1b1d22";
    ctx.fillRect(paxX, 398, 264, 8);
    if (shopLit) {
      glow(`rgba(255,210,110,${nightFactor * 0.25})`, paxX + 28, 423, 58, 71);
      glow(`rgba(255,210,110,${nightFactor * 0.25})`, paxX + 122, 423, 110, 48);
    }
    ctx.fillStyle = shopLit ? litWindowColor : "#3a3f4a";
    ctx.fillRect(paxX + 28, 423, 58, 71);
    ctx.fillStyle = shopLit ? litDisplayColor : "#4d5563";
    ctx.fillRect(paxX + 122, 423, 110, 48);
    ctx.fillStyle = "#1b1d22";
    ctx.font = "900 19px Arial";
    ctx.fillText("PAX AUS 2026", paxX + 92, 383);
    drawImageFit(ctx, images.pax, paxX + 12, 359, 70, 32);
    ctx.fillStyle = "#f5b21f";
    ctx.font = "900 13px 'Courier New', monospace";
    ctx.fillText("GAME ON", paxX + 140, 452);

    const keychronX = paxX + 780;
    ctx.fillStyle = nightShade("#f5f5f2", "#20242f", nightFactor);
    ctx.fillRect(keychronX, 352, 264, 142);
    if (shopLit) glow(`rgba(142,221,241,${nightFactor * 0.22})`, keychronX, 352, 264, 46);
    ctx.fillStyle = "#171b1f";
    ctx.fillRect(keychronX, 352, 264, 46);
    ctx.fillStyle = "#d9e0e4";
    ctx.fillRect(keychronX, 398, 264, 8);
    if (shopLit) {
      glow(`rgba(255,210,110,${nightFactor * 0.25})`, keychronX + 25, 424, 62, 70);
      glow(`rgba(255,210,110,${nightFactor * 0.25})`, keychronX + 112, 421, 124, 52);
    }
    ctx.fillStyle = shopLit ? litWindowColor : "#26323a";
    ctx.fillRect(keychronX + 25, 424, 62, 70);
    ctx.fillStyle = shopLit ? litDisplayColor : "#b9e0ea";
    ctx.fillRect(keychronX + 112, 421, 124, 52);
    ctx.fillStyle = "#ffffff";
    roundedRect(ctx, keychronX + 12, 357, 34, 34, 17);
    ctx.fill();
    drawKeychronLogo(ctx, images.keychron, keychronX + 16, 361, 26);
    ctx.fillStyle = shopLit ? "#bff0fb" : "#ffffff";
    ctx.font = "900 19px Arial";
    ctx.fillText("KEYCHRON", keychronX + 55, 383);
    ctx.fillStyle = "#15191c";
    roundedRect(ctx, keychronX + 132, 439, 84, 17, 3);
    ctx.fill();
    ctx.fillStyle = "#d8dde0";
    for (let key = 0; key < 8; key += 1) {
      ctx.fillRect(keychronX + 137 + key * 9, 443, 6, 4);
      ctx.fillRect(keychronX + 137 + key * 9, 449, 6, 4);
    }
  }

  ctx.fillStyle = "#f6cc78";
  ctx.fillRect(0, 494, WORLD_WIDTH, 76);
  ctx.fillStyle = "#ffffff";
  for (let x = -((state.scroll * 0.8) % 94); x < WORLD_WIDTH; x += 94) {
    ctx.fillRect(x, 510, 56, 7);
  }

  ctx.fillStyle = "#2d3941";
  ctx.fillRect(0, GROUND_Y, WORLD_WIDTH, WORLD_HEIGHT - GROUND_Y);
  ctx.fillStyle = "#414d54";
  ctx.fillRect(0, GROUND_Y + 12, WORLD_WIDTH, 6);
  ctx.fillStyle = "#f6d654";
  for (let x = -((state.scroll * 2) % 170); x < WORLD_WIDTH; x += 170) {
    ctx.fillRect(x, GROUND_Y + 96, 100, 8);
  }

  if (duskFactor > 0) {
    ctx.fillStyle = `rgba(255,140,70,${duskFactor * 0.3 * (1 - nightFactor)})`;
    ctx.fillRect(0, 0, WORLD_WIDTH, GROUND_Y + 100);
  }
  if (nightFactor > 0) {
    ctx.fillStyle = `rgba(8,12,36,${nightFactor * 0.62})`;
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    for (let index = 0; index < 40; index += 1) {
      const starX = (index * 137.5) % WORLD_WIDTH;
      const starY = (index * 71.3) % (GROUND_Y - 100);
      const twinkle = 0.4 + Math.sin(state.elapsed * 3 + index) * 0.3;
      ctx.fillStyle = `rgba(255,255,255,${nightFactor * clamp(twinkle, 0, 1)})`;
      ctx.fillRect(starX, starY, 2, 2);
    }
  }
}

function drawPizza(
  ctx: CanvasRenderingContext2D,
  pizza: Pizza,
  elapsed: number,
) {
  // A mechanical keyboard switch: clear housing, coloured cross stem.
  const bob = Math.sin(elapsed * 5 + pizza.phase) * 6;
  const s = pizza.size;
  ctx.save();
  ctx.translate(pizza.x + s / 2, pizza.y + s / 2 + bob);
  ctx.rotate(Math.sin(elapsed * 3 + pizza.phase) * 0.08);
  ctx.fillStyle = "rgba(14,39,53,.14)";
  ctx.beginPath();
  ctx.ellipse(2, s * 0.53, s * 0.38, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bottom housing
  ctx.fillStyle = "#22262b";
  roundedRect(ctx, -s * 0.42, -s * 0.02, s * 0.84, s * 0.4, 5);
  ctx.fill();
  // Pins
  ctx.fillStyle = "#d9b44a";
  ctx.fillRect(-s * 0.2, s * 0.36, 3, 7);
  ctx.fillRect(s * 0.14, s * 0.36, 3, 7);
  // Top housing (translucent)
  ctx.fillStyle = "rgba(230,240,245,.92)";
  roundedRect(ctx, -s * 0.38, -s * 0.3, s * 0.76, s * 0.34, 6);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.75)";
  ctx.fillRect(-s * 0.3, -s * 0.26, s * 0.18, 3);
  // Cross stem
  ctx.fillStyle = pizza.color;
  roundedRect(ctx, -s * 0.14, -s * 0.5, s * 0.28, s * 0.24, 3);
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.fillRect(-s * 0.03, -s * 0.48, s * 0.06, s * 0.2);
  ctx.fillRect(-s * 0.11, -s * 0.41, s * 0.22, s * 0.05);
  ctx.restore();
}

function drawKeycap(
  ctx: CanvasRenderingContext2D,
  keycap: Keycap,
  elapsed: number,
) {
  const bob = Math.sin(elapsed * 4 + keycap.phase) * 5;
  const x = keycap.x + keycap.size / 2;
  const y = keycap.y + keycap.size / 2 + bob;
  const glow = 0.55 + Math.sin(elapsed * 6 + keycap.phase) * 0.25;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.sin(elapsed * 2.4 + keycap.phase) * 0.06);
  ctx.fillStyle = "rgba(14,39,53,.16)";
  ctx.beginPath();
  ctx.ellipse(2, keycap.size * 0.5, keycap.size * 0.36, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(142,221,241,${glow * 0.5})`;
  roundedRect(ctx, -keycap.size * 0.52, -keycap.size * 0.52, keycap.size * 1.04, keycap.size * 1.04, 12);
  ctx.fill();
  ctx.fillStyle = "#171b1f";
  roundedRect(ctx, -keycap.size * 0.42, -keycap.size * 0.42, keycap.size * 0.84, keycap.size * 0.84, 8);
  ctx.fill();
  ctx.fillStyle = "#2b333a";
  roundedRect(ctx, -keycap.size * 0.34, -keycap.size * 0.34, keycap.size * 0.68, keycap.size * 0.58, 6);
  ctx.fill();
  ctx.fillStyle = `rgba(142,221,241,${clamp(glow, 0.4, 1)})`;
  ctx.font = `900 ${Math.round(keycap.size * 0.34)}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(keycap.letter, 0, -keycap.size * 0.05);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

function drawBigPizza(
  ctx: CanvasRenderingContext2D,
  bigPizza: Pizza,
  elapsed: number,
) {
  // The bonus prize: a Keychron keyboard.
  const bob = Math.sin(elapsed * 4 + bigPizza.phase) * 6;
  const x = bigPizza.x + bigPizza.size / 2;
  const y = bigPizza.y + bigPizza.size / 2 + bob;
  const glowAlpha = 0.4 + Math.sin(elapsed * 5) * 0.22;
  const w = bigPizza.size * 1.5;
  const h = bigPizza.size * 0.62;
  ctx.save();
  ctx.fillStyle = `rgba(255,216,78,${glowAlpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y, w * 0.68, h * 1.15, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.translate(x, y);
  ctx.rotate(Math.sin(elapsed * 3 + bigPizza.phase) * 0.05);
  ctx.fillStyle = "rgba(14,39,53,.18)";
  ctx.beginPath();
  ctx.ellipse(0, h * 0.68, w * 0.45, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Case
  ctx.fillStyle = "#3b4048";
  roundedRect(ctx, -w / 2, -h / 2, w, h, 9);
  ctx.fill();
  ctx.fillStyle = "#23272d";
  roundedRect(ctx, -w / 2 + 6, -h / 2 + 6, w - 12, h - 12, 6);
  ctx.fill();
  // Keys: 4 rows, accent Esc and Enter
  const rows = 4;
  const cols = 10;
  const pad = 9;
  const keyW = (w - pad * 2) / cols;
  const keyH = (h - pad * 2) / rows;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const accent = (row === 0 && col === 0) || (row === 2 && col === cols - 1);
      if (HALLOWEEN) {
        ctx.fillStyle = accent ? "#7b3fbf" : (row + col) % 3 === 0 ? "#ff7a1a" : "#2a2433";
      } else {
        ctx.fillStyle = accent ? "#f5b21f" : row === rows - 1 && col > 2 && col < 7 ? "#e7e9ec" : "#cfd4d9";
      }
      if (row === rows - 1 && col > 3 && col < 7) continue; // space bar drawn below
      roundedRect(ctx, -w / 2 + pad + col * keyW + 1.5, -h / 2 + pad + row * keyH + 1.5, keyW - 3, keyH - 3, 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = HALLOWEEN ? "#ff7a1a" : "#e7e9ec";
  roundedRect(ctx, -w / 2 + pad + 4 * keyW + 1.5, -h / 2 + pad + 3 * keyH + 1.5, keyW * 3 - 3, keyH - 3, 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(x, y - h * 0.5 - 30);
  const label = HALLOWEEN ? "SPOOKY KEYBOARD!" : "KEYCHRON!";
  ctx.font = "900 14px Arial";
  const labelWidth = Math.ceil(ctx.measureText(label).width) + 22;
  ctx.fillStyle = "#171b1f";
  roundedRect(ctx, -labelWidth / 2, -13, labelWidth, 24, 8);
  ctx.fill();
  ctx.fillStyle = "#ffd84e";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 0, 0);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

function drawObstacle(ctx: CanvasRenderingContext2D, obstacle: Obstacle) {
  ctx.save();
  ctx.globalAlpha = obstacle.hit ? 0.48 : 1;
  const { x, y, width, height } = obstacle;

  if (obstacle.kind === "cone") {
    ctx.fillStyle = "rgba(0,0,0,.2)";
    ctx.beginPath();
    ctx.ellipse(x + width / 2, GROUND_Y + 4, width * 0.62, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f26722";
    ctx.beginPath();
    ctx.moveTo(x + width / 2, y);
    ctx.lineTo(x + width - 8, y + height - 12);
    ctx.lineTo(x + 8, y + height - 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x + 15, y + 29, width - 30, 9);
    ctx.fillStyle = "#d94a10";
    roundedRect(ctx, x, y + height - 15, width, 15, 4);
    ctx.fill();
  }

  if (obstacle.kind === "barrier") {
    ctx.fillStyle = "#f6f2dc";
    roundedRect(ctx, x, y, width, height - 20, 6);
    ctx.fill();
    ctx.fillStyle = "#e31837";
    ctx.save();
    roundedRect(ctx, x, y, width, height - 20, 6);
    ctx.clip();
    for (let stripe = -40; stripe < width + 40; stripe += 44) {
      ctx.save();
      ctx.translate(x + stripe, y);
      ctx.rotate(-0.55);
      ctx.fillRect(0, -20, 18, height + 36);
      ctx.restore();
    }
    ctx.restore();
    ctx.fillStyle = "#193949";
    ctx.fillRect(x + 15, y + height - 20, 10, 22);
    ctx.fillRect(x + width - 25, y + height - 20, 10, 22);
  }

  if (obstacle.kind === "sign") {
    ctx.strokeStyle = "#243943";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(x + 13, y - 65);
    ctx.lineTo(x + 13, y + height + 80);
    ctx.stroke();
    ctx.fillStyle = "#e31837";
    roundedRect(ctx, x, y, width, height, 9);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    roundedRect(ctx, x + 5, y + 5, width - 10, height - 10, 6);
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 19px Arial";
    ctx.textAlign = "center";
    ctx.fillText("LOW!", x + width / 2, y + 31);
    ctx.textAlign = "left";
  }

  if (obstacle.kind === "puddle") {
    ctx.fillStyle = "rgba(76,198,232,.6)";
    ctx.beginPath();
    ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(210,248,255,.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x + width * 0.65, y + height * 0.48, 12, Math.PI * 1.1, Math.PI * 1.8);
    ctx.stroke();
  }

  if (obstacle.kind === "boxes") {
    ctx.fillStyle = "rgba(0,0,0,.2)";
    ctx.beginPath();
    ctx.ellipse(x + width / 2, GROUND_Y + 4, width * 0.6, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    const boxH = height / 3;
    const boxes = [
      { bx: x, by: y + boxH * 2, bw: width, label: "PAX" },
      { bx: x + 4, by: y + boxH, bw: width - 8, label: "KEYCHRON" },
      { bx: x + 10, by: y, bw: width - 20, label: "" },
    ];
    for (const { bx, by, bw, label } of boxes) {
      ctx.fillStyle = "#c98f4f";
      ctx.fillRect(bx, by, bw, boxH - 2);
      ctx.fillStyle = "#b07738";
      ctx.fillRect(bx, by, bw, 6);
      ctx.fillStyle = "#e6c07a";
      ctx.fillRect(bx + bw / 2 - 5, by, 10, boxH - 2);
      if (label) {
        ctx.fillStyle = "#1b1d22";
        ctx.font = `900 ${label.length > 3 ? 10 : 14}px Arial`;
        ctx.textAlign = "center";
        ctx.fillText(label, bx + bw / 2, by + boxH / 2 + 6);
        ctx.textAlign = "left";
      }
    }
  }

  if (obstacle.kind === "banner") {
    const clothH = 40;
    const clothY = y + height - clothH;
    ctx.strokeStyle = "#3a3f48";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x + 14, clothY);
    ctx.lineTo(x + 14, y);
    ctx.moveTo(x + width - 14, clothY);
    ctx.lineTo(x + width - 14, y);
    ctx.stroke();
    ctx.fillStyle = "#1b1d22";
    roundedRect(ctx, x, clothY, width, clothH, 4);
    ctx.fill();
    ctx.fillStyle = "#f5b21f";
    ctx.fillRect(x + 4, clothY + 4, width - 8, clothH - 8);
    ctx.fillStyle = "#1b1d22";
    ctx.font = "900 17px Arial";
    ctx.textAlign = "center";
    ctx.fillText("PAX AUS 2026", x + width / 2, clothY + clothH / 2 + 6);
    ctx.textAlign = "left";
    // Triangle bunting along the bottom edge
    for (let flag = x + 6; flag < x + width - 12; flag += 18) {
      ctx.beginPath();
      ctx.moveTo(flag, clothY + clothH);
      ctx.lineTo(flag + 12, clothY + clothH);
      ctx.lineTo(flag + 6, clothY + clothH + 9);
      ctx.closePath();
      ctx.fill();
    }
  }

  if (obstacle.kind === "drone") {
    const bob = Math.sin(performance.now() * 0.008 + obstacle.id) * 3;
    const cy = y + height / 2 + bob;
    ctx.fillStyle = "rgba(0,0,0,.12)";
    ctx.beginPath();
    ctx.ellipse(x + width / 2, GROUND_Y + 4, width * 0.35, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#2b3038";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x + 12, cy - 10);
    ctx.lineTo(x + width - 12, cy - 10);
    ctx.stroke();
    // Rotors
    const spin = Math.abs(Math.sin(performance.now() * 0.05));
    ctx.fillStyle = "rgba(60,66,76,.55)";
    for (const rx of [x + 12, x + width - 12]) {
      ctx.beginPath();
      ctx.ellipse(rx, cy - 14, 18 * (0.4 + spin * 0.6), 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Body + camera
    ctx.fillStyle = "#23272d";
    roundedRect(ctx, x + width / 2 - 24, cy - 12, 48, 20, 7);
    ctx.fill();
    ctx.fillStyle = "#3a3f48";
    ctx.beginPath();
    ctx.arc(x + width / 2, cy + 12, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8eddf1";
    ctx.beginPath();
    ctx.arc(x + width / 2, cy + 12, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = Math.floor(performance.now() / 300) % 2 === 0 ? "#ff4d4d" : "#7a1f1f";
    ctx.beginPath();
    ctx.arc(x + width / 2 + 16, cy - 4, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  if (obstacle.kind === "plane") {
    // Chubby toy plane flying towards the rider (nose on the left), with a
    // face on the nose and a little cat pilot in the cockpit.
    const t = performance.now() / 1000;
    const bob = Math.sin(t * 3 + obstacle.id) * 2;
    const cx = x + width * 0.55;
    const cy = y + height * 0.52 + bob;
    const outline = "#1b1d22";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.fillStyle = "rgba(0,0,0,.12)";
    ctx.beginPath();
    ctx.ellipse(x + width / 2, y + height + 17, width * 0.34, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tail fin + tail wing
    ctx.fillStyle = "#ff8fa3";
    ctx.beginPath();
    ctx.moveTo(x + width - 30, cy - 6);
    ctx.quadraticCurveTo(x + width - 22, cy - 34, x + width - 6, cy - 30);
    ctx.quadraticCurveTo(x + width - 4, cy - 12, x + width - 12, cy + 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = "#f5b21f";
    roundedRect(ctx, x + width - 30, cy + 2, 26, 9, 4.5);
    ctx.fill();
    ctx.stroke();

    // Back wing (behind the body)
    ctx.fillStyle = "#e09a12";
    roundedRect(ctx, cx - 18, cy - 20, 30, 12, 6);
    ctx.fill();
    ctx.stroke();

    // Chubby body
    ctx.fillStyle = "#fffaf0";
    ctx.beginPath();
    ctx.ellipse(cx, cy, width * 0.4, height * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Gold belly stripe
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, width * 0.4, height * 0.46, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#f5b21f";
    ctx.fillRect(cx - width * 0.42, cy + height * 0.12, width * 0.84, height * 0.12);
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(cx, cy, width * 0.4, height * 0.46, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Shine
    ctx.strokeStyle = "rgba(255,255,255,.95)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(cx + 6, cy - 4, width * 0.3, height * 0.3, 0, Math.PI * 1.15, Math.PI * 1.45);
    ctx.stroke();

    // Tinted windscreen on the nose and a row of round cabin windows
    ctx.fillStyle = "#2e4a5c";
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x + width * 0.2, cy - 6);
    ctx.quadraticCurveTo(x + width * 0.24, cy - height * 0.36, x + width * 0.36, cy - height * 0.38);
    ctx.lineTo(x + width * 0.37, cy - 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + width * 0.27, cy - height * 0.28);
    ctx.lineTo(x + width * 0.31, cy - height * 0.3);
    ctx.stroke();
    for (let w = 0; w < 4; w += 1) {
      const wx = x + width * 0.46 + w * 13;
      ctx.fillStyle = "#bfe0ee";
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(wx, cy - 6, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // Door outline and tail registration
    ctx.strokeStyle = "rgba(27,29,34,.45)";
    ctx.lineWidth = 1.5;
    roundedRect(ctx, x + width * 0.4, cy - 12, 9, 22, 3);
    ctx.stroke();
    ctx.fillStyle = outline;
    ctx.font = "900 8px Arial";
    ctx.textAlign = "center";
    ctx.fillText("PAX26", x + width - 34, cy - 10);
    ctx.textAlign = "left";

    // Front wing
    ctx.fillStyle = "#f5b21f";
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2.5;
    roundedRect(ctx, cx - 14, cy + 4, 36, 13, 6.5);
    ctx.fill();
    ctx.stroke();

    // Nose cap + spinning propeller
    const propellerX = x + 9;
    const propellerY = cy;
    ctx.fillStyle = "#ff8fa3";
    ctx.beginPath();
    ctx.arc(propellerX + 4, propellerY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const spin = Math.abs(Math.sin(t * 40));
    ctx.fillStyle = "rgba(60,66,76,.5)";
    ctx.beginPath();
    ctx.ellipse(propellerX - 2, propellerY, 3, 6 + spin * 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd84e";
    ctx.beginPath();
    ctx.arc(propellerX - 2, propellerY, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  if (obstacle.kind === "truck") {
    // Light box truck in the cute style: low cab-over cab (front third),
    // tall cargo box on a chassis (back two thirds), big wheels.
    const t = performance.now() / 1000;
    const outline = "#1b1d22";
    ctx.fillStyle = "rgba(0,0,0,.2)";
    ctx.beginPath();
    ctx.ellipse(x + width / 2, GROUND_Y + 3, width * 0.55, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Draw 25% larger than the hitbox, anchored at the bottom centre
    const drawW = width * 1.25;
    const drawH = height * 1.25;
    ctx.save();
    ctx.translate(x - (drawW - width) / 2, y - (drawH - height));
    ctx.scale(drawW / 108, drawH / 72);
    {
    // Local drawing space: 108 x 72
    const x = 0;
    const y = 0;
    const width = 108;
    const height = 72;
    const bob = Math.abs(Math.sin(t * 9 + obstacle.id)) * 1.2;
    const wheelR = 12;
    const groundY = y + height;
    const axleY = groundY - wheelR;
    const chassisY = axleY - 6 + bob; // top of the chassis rail
    const boxX = x + 40;
    const boxRight = x + width - 2;
    const boxTop = y + 2 + bob;
    const cabTop = y + 22 + bob;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // Chassis rail
    ctx.fillStyle = "#3b4048";
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2;
    roundedRect(ctx, x + 6, chassisY, width - 10, 7, 3);
    ctx.fill();
    ctx.stroke();

    // Cargo box
    ctx.fillStyle = "#f7f7f4";
    ctx.lineWidth = 2.5;
    roundedRect(ctx, boxX, boxTop, boxRight - boxX, chassisY - boxTop, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f5b21f";
    ctx.fillRect(boxX + 2, chassisY - 9, boxRight - boxX - 4, 5);
    ctx.fillStyle = outline;
    ctx.font = "900 10px Arial";
    ctx.textAlign = "center";
    const boxMid = (boxX + boxRight) / 2;
    ctx.fillText("KEYCHRON", boxMid, boxTop + 15);
    ctx.textAlign = "left";
    ctx.fillStyle = "#3b4048";
    roundedRect(ctx, boxMid - 22, boxTop + 21, 44, 15, 3);
    ctx.fill();
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 7; col += 1) {
        ctx.fillStyle = row === 0 && col === 0 ? "#f5b21f" : row === 1 && col === 6 ? "#8eddf1" : "#d8dde0";
        ctx.fillRect(boxMid - 20 + col * 5.9, boxTop + 24 + row * 5.6, 4.4, 3.8);
      }
    }

    // Cab (cab-over): rounded front, big windscreen, door, mirror
    ctx.fillStyle = "#f5b21f";
    ctx.strokeStyle = outline;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(boxX + 3, cabTop);
    ctx.lineTo(x + 14, cabTop);
    ctx.quadraticCurveTo(x + 2, cabTop + 1, x + 2, cabTop + 13);
    ctx.lineTo(x + 2, chassisY + 4);
    ctx.lineTo(boxX + 3, chassisY + 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Windscreen + side window
    ctx.fillStyle = "#bfe9f5";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 15, cabTop + 4);
    ctx.lineTo(boxX - 2, cabTop + 4);
    ctx.lineTo(boxX - 2, cabTop + 17);
    ctx.lineTo(x + 6, cabTop + 17);
    ctx.quadraticCurveTo(x + 6, cabTop + 5, x + 15, cabTop + 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.9)";
    ctx.beginPath();
    ctx.moveTo(x + 13, cabTop + 8);
    ctx.lineTo(x + 19, cabTop + 8);
    ctx.stroke();
    // Door with handle
    ctx.strokeStyle = "rgba(27,29,34,.5)";
    ctx.lineWidth = 1.6;
    roundedRect(ctx, x + 18, cabTop + 19, boxX - x - 22, chassisY - cabTop - 18, 3);
    ctx.stroke();
    ctx.fillStyle = "#3b4048";
    ctx.fillRect(x + 22, cabTop + 23, 6, 2.4);
    // Mirror
    ctx.fillStyle = "#3b4048";
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.6;
    roundedRect(ctx, x + 13, cabTop + 7, 3.5, 8, 1.5);
    ctx.fill();
    ctx.stroke();
    // Front: grille, headlight, indicator, bumper
    ctx.fillStyle = "#3b4048";
    ctx.lineWidth = 2;
    roundedRect(ctx, x + 3, cabTop + 21, 7, 9, 2.5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff6c8";
    ctx.beginPath();
    ctx.arc(x + 7, cabTop + 35, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ff8a3d";
    roundedRect(ctx, x + 3, cabTop + 18, 4, 2.6, 1.3);
    ctx.fill();
    ctx.fillStyle = "#cfd4d9";
    roundedRect(ctx, x - 2, chassisY + 1, 16, 6, 3);
    ctx.fill();
    ctx.stroke();

    // Wheels (front under the cab, rear under the box)
    for (const wx of [x + 22, x + width - 24]) {
      ctx.save();
      ctx.translate(wx, axleY);
      ctx.rotate(-t * 12);
      ctx.fillStyle = "#23272d";
      ctx.beginPath();
      ctx.arc(0, 0, wheelR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = outline;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#cfd4d9";
      ctx.beginPath();
      ctx.arc(0, 0, wheelR * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#23272d";
      ctx.fillRect(-1, -wheelR * 0.45, 2, 3);
      ctx.restore();
    }
    }
    ctx.restore();
  }
  ctx.restore();
}

/**
 * A little ginger cat riding on the board's nose. Origin is between its
 * feet; it faces right. `crouch` (0..1) flattens it when the rider slides.
 */
function drawBoardCat(ctx: CanvasRenderingContext2D, elapsed: number, crouch: number) {
  const outline = "#1b1d22";
  const fur = HALLOWEEN ? "#2b2533" : "#f2a33a";
  const furDark = HALLOWEEN ? "#4a4157" : "#d9822b";
  ctx.save();
  ctx.scale(1.25, 1.25 * (1 - crouch * 0.28));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Tail, swishing behind
  const swish = Math.sin(elapsed * 4.2) * 3;
  const drawTail = (color: string, width: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(-6, -4);
    ctx.quadraticCurveTo(-15, -6, -13 + swish * 0.4, -15);
    ctx.quadraticCurveTo(-11 + swish, -21, -15 + swish, -22);
    ctx.stroke();
  };
  drawTail(outline, 6.5);
  drawTail(fur, 4);

  // Body
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.ellipse(0, -6.5, 9, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.stroke();
  // Paws
  ctx.fillStyle = "#fff8ee";
  for (const px of [3.5, 8]) {
    ctx.beginPath();
    ctx.ellipse(px, -1.2, 2.6, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Head
  const hx = 6;
  const hy = -17;
  const ear = (x1: number, tipX: number, x2: number) => {
    ctx.fillStyle = fur;
    ctx.beginPath();
    ctx.moveTo(hx + x1, hy - 4);
    ctx.lineTo(hx + tipX, hy - 12);
    ctx.lineTo(hx + x2, hy - 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffb3c1";
    ctx.beginPath();
    ctx.moveTo(hx + x1 + 1.4, hy - 5);
    ctx.lineTo(hx + tipX, hy - 9.5);
    ctx.lineTo(hx + x2 - 1.4, hy - 5.5);
    ctx.closePath();
    ctx.fill();
  };
  const earTwitch = Math.sin(elapsed * 1.3) > 0.97 ? 1 : 0;
  ear(-7, -5 - earTwitch, -1.5);
  ear(1.5, 5, 7.5);
  ctx.fillStyle = fur;
  ctx.beginPath();
  ctx.ellipse(hx, hy, 8.5, 7.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.stroke();
  // Forehead stripes
  ctx.strokeStyle = furDark;
  ctx.lineWidth = 1.6;
  for (const sx of [-2.5, 0, 2.5]) {
    ctx.beginPath();
    ctx.moveTo(hx + sx, hy - 7);
    ctx.lineTo(hx + sx * 0.8, hy - 4.5);
    ctx.stroke();
  }
  // Eyes (blink on their own rhythm)
  const blink = (elapsed + 1.1) % 2.9 < 0.12;
  for (const ex of [hx - 1.5, hx + 4]) {
    if (blink) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(ex, hy - 0.5, 1.6, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();
    } else {
      ctx.fillStyle = HALLOWEEN ? "#ffb52e" : outline;
      ctx.beginPath();
      ctx.ellipse(ex, hy - 0.5, 1.7, 2.3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(ex + 0.6, hy - 1.4, 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Blush, nose, mouth, whiskers
  ctx.fillStyle = "rgba(255,120,140,.6)";
  ctx.beginPath();
  ctx.ellipse(hx - 4.2, hy + 2.6, 1.8, 1.2, 0, 0, Math.PI * 2);
  ctx.ellipse(hx + 6.4, hy + 2.4, 1.6, 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff7f98";
  ctx.beginPath();
  ctx.moveTo(hx + 0.6, hy + 1.6);
  ctx.lineTo(hx + 2.8, hy + 1.6);
  ctx.lineTo(hx + 1.7, hy + 2.8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(hx + 0.9, hy + 3, 0.9, 0, Math.PI);
  ctx.arc(hx + 2.7, hy + 3, 0.9, 0, Math.PI);
  ctx.stroke();
  ctx.strokeStyle = "rgba(27,29,34,.55)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(hx + 6, hy + 1.2);
  ctx.lineTo(hx + 11, hy + 0.4);
  ctx.moveTo(hx + 6, hy + 2.4);
  ctx.lineTo(hx + 11, hy + 2.8);
  ctx.stroke();

  // PAX-gold collar with a bell
  ctx.strokeStyle = "#f5b21f";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(hx, hy, 7.6, 0.25 * Math.PI, 0.75 * Math.PI);
  ctx.stroke();
  ctx.fillStyle = "#ffd84e";
  ctx.beginPath();
  ctx.arc(hx, hy + 8.2, 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = outline;
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.restore();
}

// Skate tricks: each jump picks one at random; riding sometimes pops a manual.
type SkateTrick = "ollie" | "kickflip" | "shuvit" | "grab";
const SKATE_TRICKS: SkateTrick[] = ["ollie", "kickflip", "shuvit", "grab"];
const TRICK_SECONDS = 0.55;
const skateTrick = { wasGrounded: true, start: 0, trick: "ollie" as SkateTrick };
// Lean when steering: +1 pushing forward (right), -1 braking backward (left)
const skaterMotion = { lastX: Number.NaN, lastT: 0, lean: 0 };
const STEER_SPEED = 330; // px/s, matches the horizontal move speed in update()

if (__DEBUG__) (window as unknown as { __skateTrick: typeof skateTrick }).__skateTrick = skateTrick;

// ---- Pixel-art rider and board (the old chibi rider: add ?rider=classic) ----
// Art is laid out on a small pixel grid, then drawn as solid colour runs at
// PIXEL_SCALE. Drawing rects (not a scaled image) keeps every pixel the same
// size and lets the sprite tilt and move smoothly without shimmering.
const PIXEL_RIDER =
  typeof window === "undefined" || new URLSearchParams(window.location.search).get("rider") !== "classic";
type PixelPose = "ride" | "ride2" | "tuck" | "air" | "slide" | "grind";
type PixelRun = { x: number; y: number; w: number; color: string };
const PIXEL_SCALE = 3.5;

const PX = {
  cap: "#24272d",
  capHi: "#3d434c",
  logo: "#f4f4f2",
  hair: "#6b3d20",
  hairHi: "#8d5530",
  skin: "#f7cba6",
  skinSh: "#e2a77f",
  eye: "#1b1d22",
  blush: "#f19a8e",
  mouth: "#b8574c",
  tee: "#25282e",
  teeHi: "#3a3f47",
  jeans: "#2f5597",
  jeansHi: "#4a76c0",
  shoe: "#f6f6f4",
  sole: "#b8bec5",
  deck: "#f5b21f",
  deckSh: "#c98a12",
  grip: "#2b2f36",
  truck: "#9aa3ab",
  wheel: "#f2efe6",
  hub: "#8eddf1",
  outline: "#15171c",
  cape: "#1c1226",
  capeLining: "#b3122e",
};

function makePixelGrid(width: number, height: number) {
  const grid: (string | null)[][] = Array.from({ length: height }, () => Array<string | null>(width).fill(null));
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    for (let j = y; j < y + h; j += 1) {
      for (let i = x; i < x + w; i += 1) {
        if (j >= 2 && j < height - 2 && i >= 2 && i < width - 2) grid[j][i] = color;
      }
    }
  };
  const pattern = (x: number, y: number, rows: string[], color: string) =>
    rows.forEach((row, j) => [...row].forEach((ch, i) => ch === "w" && rect(x + i, y + j, 1, 1, color)));
  // Adds a 1px border around everything drawn so far
  const outline = (color: string, diagonal: boolean) => {
    const add: [number, number][] = [];
    for (let j = 0; j < height; j += 1) {
      for (let i = 0; i < width; i += 1) {
        if (grid[j][i]) continue;
        const near = (dx: number, dy: number) => Boolean(grid[j + dy]?.[i + dx]);
        if (near(1, 0) || near(-1, 0) || near(0, 1) || near(0, -1) ||
            (diagonal && (near(1, 1) || near(-1, 1) || near(1, -1) || near(-1, -1)))) {
          add.push([i, j]);
        }
      }
    }
    add.forEach(([i, j]) => { grid[j][i] = color; });
  };
  // Merges each row into runs of the same colour (far fewer rects to draw)
  const runs = () => {
    const out: PixelRun[] = [];
    grid.forEach((row, y) => {
      let x = 0;
      while (x < width) {
        const color = row[x];
        if (!color) { x += 1; continue; }
        let w = 1;
        while (x + w < width && row[x + w] === color) w += 1;
        out.push({ x, y, w, color });
        x += w;
      }
    });
    return out;
  };
  return { rect, pattern, outline, runs };
}

function drawPixelRuns(ctx: CanvasRenderingContext2D, runs: PixelRun[], originCol: number, originRow: number) {
  // A hair of overlap hides seams between rows when the sprite is tilted
  const S = PIXEL_SCALE;
  let current = "";
  for (const run of runs) {
    if (run.color !== current) {
      ctx.fillStyle = run.color;
      current = run.color;
    }
    ctx.fillRect((run.x - originCol) * S, (run.y - originRow) * S, run.w * S + 0.4, S + 0.4);
  }
}

// Rider grid: 36 x 42, feet sit on row 40, centred on column 17
const RIDER_W = 36;
const RIDER_H = 42;
const RIDER_ANCHOR_COL = 17;
const RIDER_FEET_ROW = 40;
// Where the real Keychron logo goes on the cap and the T-shirt (grid cells)
type PixelLogoSpot = { col: number; row: number; size: number };
type PixelRider = { runs: PixelRun[]; logos: PixelLogoSpot[] };
const pixelRiderCache = new Map<string, PixelRider>();

function buildPixelRider(pose: PixelPose, blink: boolean): PixelRider {
  const { rect, outline, runs } = makePixelGrid(RIDER_W, RIDER_H);
  const logos: PixelLogoSpot[] = [];

  const head = (hx: number, hy: number) => {
    // Hair at the back and sides
    rect(hx + 1, hy + 7, 5, 9, PX.hair);
    rect(hx, hy + 8, 1, 6, PX.hair);
    rect(hx + 2, hy + 8, 2, 4, PX.hairHi);
    // Face
    rect(hx + 4, hy + 8, 12, 10, PX.skin);
    rect(hx + 5, hy + 18, 9, 1, PX.skin);
    rect(hx + 4, hy + 8, 12, 1, PX.skinSh);
    // Fringe and sideburn under the cap
    rect(hx + 5, hy + 8, 8, 2, PX.hair);
    rect(hx + 6, hy + 10, 1, 1, PX.hair);
    rect(hx + 9, hy + 10, 1, 1, PX.hair);
    rect(hx + 4, hy + 9, 2, 5, PX.hair);
    // Ear
    rect(hx + 6, hy + 12, 2, 3, PX.skinSh);
    rect(hx + 7, hy + 13, 1, 1, PX.skin);
    // Eye (with a sparkle), or a closed line mid-blink; brow, cheek, mouth
    if (blink) {
      rect(hx + 12, hy + 13, 2, 1, PX.eye);
    } else {
      rect(hx + 12, hy + 11, 2, 3, PX.eye);
      rect(hx + 12, hy + 11, 1, 1, PX.logo);
    }
    rect(hx + 11, hy + 10, 3, 1, PX.hair);
    rect(hx + 13, hy + 15, 2, 1, PX.blush);
    rect(hx + 12, hy + 16, 2, 1, PX.mouth);
    // Black cap: crown, highlight, round Keychron "K" logo, brim forward
    rect(hx + 5, hy, 9, 1, PX.cap);
    rect(hx + 3, hy + 1, 13, 1, PX.cap);
    rect(hx + 2, hy + 2, 15, 6, PX.cap);
    rect(hx + 5, hy + 1, 4, 1, PX.capHi);
    rect(hx + 3, hy + 2, 2, 3, PX.capHi);
    logos.push({ col: hx + 9, row: hy + 1, size: 6 });
    rect(hx + 14, hy + 7, 9, 2, PX.cap);
    rect(hx + 16, hy + 7, 6, 1, PX.capHi);
  };
  const torso = (tx: number, ty: number, rows = 9) => {
    rect(tx + 2, ty, 9, rows, PX.tee);
    rect(tx + 1, ty + 1, 11, 3, PX.tee);
    rect(tx + 3, ty + 1, 1, rows - 3, PX.teeHi);
    // Hidden behind the head when crouched for a slide
    if (pose !== "slide") logos.push({ col: tx + 4, row: ty + 2, size: 6 });
  };
  const shoe = (x: number, y: number) => {
    rect(x, y, 6, 1, PX.shoe);
    rect(x + 1, y - 1, 3, 1, PX.shoe);
    rect(x, y + 1, 6, 1, PX.sole);
  };

  // Halloween: vampire cape flowing back from the shoulders (drawn first, behind everything)
  const cape = (ty: number, rows: number, flutter: number) => {
    if (!HALLOWEEN) return;
    for (let k = 0; k < rows; k += 1) {
      const spread = Math.floor(k * 0.6) + (k > rows / 2 ? flutter : 0);
      rect(tx + 1 - spread, ty + k, 4 + spread, 1, PX.cape);
      rect(tx + 1 - spread, ty + k, 1, 1, PX.capeLining);
    }
    rect(tx + 1, ty - 2, 2, 2, PX.capeLining); // collar
    rect(tx + 9, ty - 2, 2, 2, PX.capeLining);
  };

  const fistsUp = (ty: number) => {
    // Both fists up in the air, drawn over the head's edge so they show
    rect(tx - 1, ty + 1, 3, 2, PX.tee);
    rect(tx - 3, ty - 1, 2, 3, PX.skin);
    rect(tx - 4, ty - 3, 3, 2, PX.skin);
    rect(tx + 11, ty + 1, 3, 2, PX.tee);
    rect(tx + 14, ty - 1, 2, 3, PX.skin);
    rect(tx + 14, ty - 3, 3, 2, PX.skin);
  };

  const tx = 10;
  if (pose === "grind") {
    // Grinding a rail: crouched low, knees out, arms wide for balance
    const ty = 24;
    cape(ty, 11, 1);
    rect(tx - 1, ty + 1, 3, 3, PX.tee);
    rect(tx - 5, ty + 1, 4, 2, PX.skin);
    rect(tx - 7, ty, 2, 3, PX.skin);
    rect(tx + 2, ty + 9, 9, 2, PX.jeans);
    rect(tx, ty + 10, 4, 3, PX.jeans);
    rect(tx + 9, ty + 10, 4, 3, PX.jeans);
    rect(tx + 1, ty + 10, 1, 2, PX.jeansHi);
    rect(tx + 10, ty + 10, 1, 2, PX.jeansHi);
    rect(tx - 1, ty + 12, 3, 2, PX.jeans);
    rect(tx + 11, ty + 12, 3, 2, PX.jeans);
    shoe(tx - 3, 38);
    shoe(tx + 10, 38);
    torso(tx, ty);
    rect(tx + 11, ty + 1, 2, 3, PX.tee);
    rect(tx + 13, ty + 1, 4, 2, PX.skin);
    rect(tx + 17, ty, 2, 3, PX.skin);
    head(tx - 1, 5);
  } else if (pose === "tuck") {
    // Ollie take-off: crouched in the air, knees pulled up, feet on the board
    const ty = 24;
    cape(ty, 11, 2);
    rect(tx + 2, ty + 9, 9, 2, PX.jeans);
    // Back leg: knee bent back and up
    rect(tx - 1, ty + 8, 6, 3, PX.jeans);
    rect(tx - 2, ty + 10, 3, 4, PX.jeans);
    rect(tx, ty + 8, 4, 1, PX.jeansHi);
    shoe(tx - 3, 38);
    torso(tx, ty);
    // Front leg (in front of the body): knee pulled right up and forward
    rect(tx + 7, ty + 6, 8, 3, PX.jeans);
    rect(tx + 8, ty + 6, 5, 1, PX.jeansHi);
    rect(tx + 12, ty + 9, 3, 5, PX.jeans);
    shoe(tx + 10, 38);
    head(tx - 1, 5);
    fistsUp(ty);
  } else if (pose === "slide") {
    // Crouched low and forward, one hand down on the board
    const ty = 30;
    cape(ty, 6, 1);
    rect(tx - 1, ty + 1, 4, 6, PX.tee);
    torso(tx, ty, 6);
    rect(tx + 1, ty + 6, 13, 2, PX.jeans);
    rect(tx + 2, ty + 6, 9, 1, PX.jeansHi);
    shoe(tx, 38);
    shoe(tx + 9, 38);
    rect(tx + 12, ty + 1, 2, 3, PX.tee);
    rect(tx + 13, ty + 3, 2, 3, PX.skin);
    rect(tx + 13, ty + 6, 3, 2, PX.skin);
    head(tx + 4, 15);
  } else {
    const ty = 21;
    const air = pose === "air";
    const sway = pose === "ride2" ? 1 : 0;
    cape(ty, 14, air ? 2 : sway);
    // Back arm out for balance
    if (!air) {
      rect(tx - 1, ty + 1, 3, 3, PX.tee);
      rect(tx - 4, ty + 2 + sway, 3, 2, PX.skin);
      rect(tx - 6, ty + 1 + sway, 2, 3, PX.skin);
    }
    // Legs: wide skate stance, knees bent out more in the air
    const knee = air ? 1 : 0;
    rect(tx + 2, ty + 9, 9, 2, PX.jeans);
    rect(tx + 2 - knee, ty + 11, 4, 4, PX.jeans);
    rect(tx + 7 + knee, ty + 11, 4, 4, PX.jeans);
    rect(tx + 3 - knee, ty + 11, 1, 3, PX.jeansHi);
    rect(tx + 8 + knee, ty + 11, 1, 3, PX.jeansHi);
    rect(tx, ty + 15, 4, 2, PX.jeans);
    rect(tx + 9, ty + 15, 4, 2, PX.jeans);
    shoe(tx - 2, ty + 17);
    shoe(tx + 9, ty + 17);
    torso(tx, ty);
    // Front arm out for balance
    if (!air) {
      rect(tx + 11, ty + 1, 2, 3, PX.tee);
      rect(tx + 13, ty + 2 - sway, 4, 2, PX.skin);
      rect(tx + 17, ty + 1 - sway, 2, 3, PX.skin);
    }
    head(tx - 1, 2);
    if (air) fistsUp(ty);
  }
  // Dark 1px outline
  outline(PX.outline, false);
  return { runs: runs(), logos };
}

// The logo file is a black disc with the C and TK cut out (transparent).
// For black fabric we want the opposite: just the C and TK in white.
let whiteKeychronMark: HTMLCanvasElement | null = null;
function getWhiteKeychronMark(logo: HTMLImageElement) {
  if (whiteKeychronMark) return whiteKeychronMark;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const mctx = canvas.getContext("2d")!;
  mctx.fillStyle = "#ffffff";
  mctx.beginPath();
  mctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  mctx.fill();
  mctx.globalCompositeOperation = "destination-out";
  mctx.drawImage(logo, 0, 0, size, size);
  whiteKeychronMark = canvas;
  return canvas;
}

function drawPixelRider(
  ctx: CanvasRenderingContext2D,
  pose: PixelPose,
  tilt: number,
  deckY: number,
  keychronLogo: HTMLImageElement | undefined,
  blink: boolean,
  airTime: number | null,
) {
  const key = blink ? `${pose}-blink` : pose;
  let rider = pixelRiderCache.get(key);
  if (!rider) {
    rider = buildPixelRider(pose, blink);
    pixelRiderCache.set(key, rider);
  }
  ctx.save();
  ctx.translate(76, deckY);
  ctx.rotate(tilt);
  drawPixelRuns(ctx, rider.runs, RIDER_ANCHOR_COL, RIDER_FEET_ROW);
  // The real (smooth) Keychron logo on the cap and the T-shirt, in white
  if (keychronLogo && keychronLogo.complete && keychronLogo.naturalWidth > 0) {
    const S = PIXEL_SCALE;
    const mark = getWhiteKeychronMark(keychronLogo);
    for (const spot of rider.logos) {
      ctx.drawImage(
        mark,
        (spot.col - RIDER_ANCHOR_COL) * S,
        (spot.row - RIDER_FEET_ROW) * S,
        spot.size * S,
        spot.size * S,
      );
    }
  }
  if (airTime !== null && airTime < SWEAT_SECONDS) drawSweatDrops(ctx, pose, airTime);
  ctx.restore();
}

// Sweat drops flung back off the head just after take-off
const SWEAT_SECONDS = 0.6;
const SWEAT_DROPS = [
  { delay: 0, speed: 30, lift: 12 },
  { delay: 0.04, speed: 22, lift: 20 },
  { delay: 0.08, speed: 36, lift: 4 },
  { delay: 0.12, speed: 26, lift: 14 },
];
// Pixel teardrop: k = dark edge, b = blue, w = white glint
const SWEAT_SHAPE = ["..k..", ".kbk.", "kwbbk", "kbbbk", ".kkk."];
const SWEAT_COLORS: Record<string, string> = { k: "#15171c", b: "#5fc4ff", w: "#ffffff" };
function drawSweatDrops(ctx: CanvasRenderingContext2D, pose: PixelPose, airTime: number) {
  const S = PIXEL_SCALE;
  // Back of the head, in rider grid cells
  const startCol = 8;
  const startRow = pose === "tuck" ? 12 : 9;
  for (const drop of SWEAT_DROPS) {
    const t = airTime - drop.delay;
    const life = SWEAT_SECONDS - drop.delay;
    if (t <= 0 || t >= life) continue;
    const col = startCol - drop.speed * t;
    const row = startRow - drop.lift * t + 34 * t * t;
    ctx.globalAlpha = Math.min(1, 2 * (1 - t / life));
    const x = (col - RIDER_ANCHOR_COL) * S;
    const y = (row - RIDER_FEET_ROW) * S;
    SWEAT_SHAPE.forEach((line, j) => {
      [...line].forEach((ch, i) => {
        if (ch === ".") return;
        ctx.fillStyle = SWEAT_COLORS[ch];
        ctx.fillRect(x + i * S, y + j * S, S + 0.4, S + 0.4);
      });
    });
  }
  ctx.globalAlpha = 1;
}

// Board grid: 40 x 14, deck top on row 4, centred on column 19.5.
// Four versions with the wheel hubs in different spots make the wheels spin.
const BOARD_W = 40;
const BOARD_H = 14;
const BOARD_ANCHOR_COL = 19.5;
const BOARD_TOP_ROW = 4;
const pixelBoardCache = new Map<number, PixelRun[]>();

function buildPixelBoard(spin: number): PixelRun[] {
  const { rect, pattern, outline, runs } = makePixelGrid(BOARD_W, BOARD_H);
  // Tail and nose kicks
  rect(3, 3, 3, 1, PX.deck);
  rect(2, 2, 2, 1, PX.deck);
  rect(34, 3, 3, 1, PX.deck);
  rect(36, 2, 2, 1, PX.deck);
  // Deck: grip tape on top, gold board, darker underside
  rect(5, 4, 30, 1, PX.deck);
  rect(6, 4, 28, 1, PX.grip);
  rect(4, 5, 32, 1, PX.deck);
  rect(5, 6, 30, 1, PX.deckSh);
  // Trucks
  rect(9, 7, 4, 1, PX.truck);
  rect(27, 7, 4, 1, PX.truck);
  // Wheels with a hub that moves around as they roll
  const hubs: [number, number][] = [[1, 0], [3, 1], [2, 2], [0, 1]];
  const [hx, hy] = hubs[spin];
  for (const wx of [9, 27]) {
    pattern(wx, 8, [".ww.", "wwww", ".ww."], PX.wheel);
    rect(wx + hx, 8 + hy, 1, 1, PX.hub);
  }
  outline(PX.outline, false);
  return runs();
}

function drawPixelBoard(ctx: CanvasRenderingContext2D, wheelAngle: number) {
  const spin = ((Math.floor(wheelAngle / (Math.PI / 2)) % 4) + 4) % 4;
  let runs = pixelBoardCache.get(spin);
  if (!runs) {
    runs = buildPixelBoard(spin);
    pixelBoardCache.set(spin, runs);
  }
  drawPixelRuns(ctx, runs, BOARD_ANCHOR_COL, BOARD_TOP_ROW);
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  keychronLogo?: HTMLImageElement,
) {
  const player = state.player;
  {
    const dt = state.elapsed - skaterMotion.lastT;
    if (dt > 0 && dt < 0.2 && Number.isFinite(skaterMotion.lastX)) {
      const target = clamp((player.x - skaterMotion.lastX) / (dt * STEER_SPEED), -1, 1);
      skaterMotion.lean += (target - skaterMotion.lean) * Math.min(1, dt * 9);
    } else if (dt < 0 || dt >= 0.2) {
      skaterMotion.lean = 0;
    }
    skaterMotion.lastX = player.x;
    skaterMotion.lastT = state.elapsed;
  }
  const lean = skaterMotion.lean;
  if (player.invincible > 0 && Math.floor(player.invincible * 12) % 2 === 0) return;

  const bounce = player.grounded ? Math.sin(state.elapsed * 15) * 1.5 : 0;
  const x = player.x;
  const y = player.y + bounce;
  const H = player.height;
  const wheelAngle = state.scroll * 0.09;
  const airborne = !player.grounded;
  const gold = "#f5b21f";
  const ink = "#23272d";
  const line = "#1b1d22";
  const skin = "#ffd9bd";
  const denim = "#3d5a80";

  if (player.shield > 0) {
    const pulse = 0.5 + Math.sin(state.elapsed * 9) * 0.3;
    const cx = x + player.width / 2;
    const cy = y + player.height / 2;
    ctx.save();
    ctx.fillStyle = `rgba(142,221,241,${0.14 + pulse * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, player.width * 0.62, player.height * 0.66, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(142,221,241,${0.55 + pulse * 0.35})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(cx, cy, player.width * 0.62, player.height * 0.66, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Halloween ghost mode: the rider (and board and cat) turn see-through
  const ghostMode = HALLOWEEN && state.activePower?.kind === "ghost";
  if (ghostMode) ctx.globalAlpha = 0.45 + Math.sin(state.elapsed * 10) * 0.1;

  // Ground shadow (stays on the ground while jumping)
  ctx.fillStyle = "rgba(0,0,0,.22)";
  ctx.beginPath();
  const broomDrop = HALLOWEEN && state.broomLift > 0 ? GROUND_Y - (player.y + H) : 0;
  ctx.ellipse(76, H + 7 - bounce + broomDrop, airborne || broomDrop > 0 ? 48 : 62, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Speed lines while rolling
  if (!airborne) {
    ctx.strokeStyle = "rgba(255,255,255,.7)";
    ctx.lineWidth = 3;
    for (let index = 0; index < 3; index += 1) {
      const drift = (state.elapsed * 160 + index * 23) % 26;
      const ly = H - 46 + index * 14;
      const extra = Math.max(0, lean) * 16;
      ctx.beginPath();
      ctx.moveTo(8 - drift, ly);
      ctx.lineTo(-6 - drift - extra, ly);
      ctx.stroke();
    }
    if (lean < -0.35 && !player.sliding) {
      // Tail scraping the ground: little dust puffs behind the board
      const strength = Math.min(1, (-lean - 0.35) / 0.5);
      for (let puff = 0; puff < 4; puff += 1) {
        const age = (state.elapsed * 3 + puff * 0.25) % 1;
        ctx.fillStyle = `rgba(240,232,214,${(1 - age) * 0.95 * strength})`;
        ctx.beginPath();
        ctx.arc(14 - age * 26, H - 6 - age * 12 - puff * 2, 3 + age * 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ---- Tricks ----
  if (skateTrick.wasGrounded && airborne) {
    skateTrick.start = state.elapsed;
    skateTrick.trick = SKATE_TRICKS[Math.floor(Math.random() * SKATE_TRICKS.length)];
  }
  skateTrick.wasGrounded = !airborne;
  const trick: SkateTrick | null = airborne ? skateTrick.trick : null;
  const trickT = clamp((state.elapsed - skateTrick.start) / TRICK_SECONDS, 0, 1);
  const trickArc = Math.sin(trickT * Math.PI); // 0 -> 1 -> 0 over the trick
  // Manual: every few seconds on the ground, ride on the back wheels briefly
  const manual = !airborne && !player.sliding && state.elapsed % 6 > 5.15;

  // ---- Skateboard ----
  // Ollie: nose tips up while rising, levels out on the way down.
  let boardTilt = airborne ? clamp(player.velocityY / 2600, -0.32, 0.1) : 0;
  const grinding =
    HALLOWEEN && state.onPlatform !== null && state.platforms.some((p) => p.id === state.onPlatform && p.kind === "rail");
  if (trick === "grab") boardTilt -= 0.2 * trickArc;
  if (manual) boardTilt = -0.14;
  if (!airborne) boardTilt += lean > 0 ? lean * 0.07 : lean * 0.16;
  if (grinding) boardTilt = -0.06 + state.grindBalance * 0.12; // nose up, wobbling with the balance
  const boardY = H - 16 - (manual ? 4 : 0);
  ctx.save();
  ctx.translate(76, boardY);
  ctx.rotate(boardTilt);
  if (trick === "kickflip") {
    // Flip along the board's length: squash vertically through a full turn
    ctx.translate(0, -trickArc * 12);
    const flip = Math.cos(trickT * Math.PI * 2);
    ctx.scale(1, Math.abs(flip) < 0.05 ? 0.05 * Math.sign(flip || 1) : flip);
  } else if (trick === "shuvit") {
    // 360 shove-it: board spins flat under the feet
    ctx.translate(0, -trickArc * 9);
    const spin = Math.cos(trickT * Math.PI * 2);
    ctx.scale(Math.abs(spin) < 0.05 ? 0.05 * Math.sign(spin || 1) : spin, 1);
  } else if (trick === "grab") {
    ctx.translate(0, -trickArc * 6);
  }
  // Halloween broom power-up: the broom replaces the skateboard until it's over
  if (HALLOWEEN && state.broomLift > 0) {
    drawBroomRide(ctx, state.elapsed);
  } else if (PIXEL_RIDER) {
    drawPixelBoard(ctx, wheelAngle);
  } else {
  // Deck with kicked-up nose and tail
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.moveTo(-58, -10);
  ctx.quadraticCurveTo(-52, 0, -40, 0);
  ctx.lineTo(40, 0);
  ctx.quadraticCurveTo(52, 0, 58, -10);
  ctx.lineTo(60, -6);
  ctx.quadraticCurveTo(54, 7, 40, 7);
  ctx.lineTo(-40, 7);
  ctx.quadraticCurveTo(-54, 7, -60, -6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = line;
  ctx.lineWidth = 3;
  ctx.stroke();
  // Grip tape
  ctx.strokeStyle = ink;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-40, 1);
  ctx.lineTo(40, 1);
  ctx.stroke();
  // Trucks + wheels
  for (const wx of [-30, 30]) {
    ctx.fillStyle = "#9aa3ab";
    ctx.fillRect(wx - 7, 7, 14, 4);
    ctx.save();
    ctx.translate(wx, 15);
    ctx.rotate(wheelAngle);
    ctx.fillStyle = "#f5f5f2";
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = "#8eddf1";
    ctx.fillRect(-1.5, -6, 3, 5);
    ctx.restore();
  }
  }
  ctx.restore();

  if (PIXEL_RIDER) {
    const pose: PixelPose = grinding
      ? "grind"
      : player.sliding
        ? "slide"
        : airborne
          ? player.velocityY < 0 ? "tuck" : "air"
          : Math.floor(state.elapsed * 3) % 2 === 0 ? "ride" : "ride2";
    // Shoe outline sits on the deck outline; in the air the rider follows half
    // of the board's tilt so the feet stay on it
    drawPixelRider(
      ctx,
      pose,
      lean * 0.1 + (airborne ? boardTilt * 0.6 : 0) + (grinding ? state.grindBalance * 0.32 : 0),
      boardY - PIXEL_SCALE,
      keychronLogo,
      state.elapsed % 3.4 < 0.13,
      airborne ? state.elapsed - skateTrick.start : null,
    );
  } else {
  // ---- Rider (chibi) ----
  const blink = state.elapsed % 3.4 < 0.13;
  const HEAD_RADIUS = 28; // same size standing and sliding
  const drawFace = (hx: number, hy: number, r: number, squint: boolean) => {
    ctx.fillStyle = "#4a3426";
    ctx.beginPath();
    ctx.arc(hx - r * 0.55, hy + r * 0.15, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // White baseball cap, brim forward, round Keychron logo on the front
    const rimY = hy - r * 0.2;
    const capWhite = "#f7f7f4";
    // Brim (drawn first so the crown overlaps its root)
    ctx.fillStyle = capWhite;
    ctx.beginPath();
    ctx.moveTo(hx + r * 0.3, rimY - r * 0.06);
    ctx.quadraticCurveTo(hx + r * 1.5, rimY - r * 0.16, hx + r * 1.62, rimY + r * 0.1);
    ctx.quadraticCurveTo(hx + r * 1.05, rimY + r * 0.24, hx + r * 0.3, rimY + r * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.strokeStyle = "#cfd3d6";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx + r * 0.45, rimY + r * 0.1);
    ctx.quadraticCurveTo(hx + r * 1.05, rimY + r * 0.16, hx + r * 1.5, rimY + r * 0.08);
    ctx.stroke();
    // Crown
    ctx.fillStyle = capWhite;
    ctx.beginPath();
    ctx.ellipse(hx - r * 0.02, rimY, r * 1.04, r * 0.96, 0, Math.PI, Math.PI * 2);
    ctx.quadraticCurveTo(hx, rimY + r * 0.12, hx - r * 1.06, rimY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Panel seams and top button
    ctx.strokeStyle = "#d6dadd";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(hx - r * 0.02, rimY - r * 0.94);
    ctx.quadraticCurveTo(hx - r * 0.55, rimY - r * 0.55, hx - r * 0.62, rimY + r * 0.04);
    ctx.moveTo(hx - r * 0.02, rimY - r * 0.94);
    ctx.quadraticCurveTo(hx - r * 0.05, rimY - r * 0.5, hx - r * 0.12, rimY + r * 0.08);
    ctx.stroke();
    ctx.fillStyle = capWhite;
    ctx.beginPath();
    ctx.arc(hx - r * 0.02, rimY - r * 0.96, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Round Keychron logo on the front panel
    const logoX = hx + r * 0.42;
    const logoY = rimY - r * 0.42;
    const logoR = r * 0.3;
    if (keychronLogo && keychronLogo.complete && keychronLogo.naturalWidth > 0) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(keychronLogo, logoX - logoR, logoY - logoR, logoR * 2, logoR * 2);
      ctx.restore();
    } else {
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(logoX, logoY, logoR * 0.85, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = ink;
      ctx.font = `900 ${Math.round(logoR * 1.1)}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("K", logoX, logoY + 1);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }
    // Cheeks
    ctx.fillStyle = "rgba(255,120,140,.55)";
    ctx.beginPath();
    ctx.ellipse(hx + r * 0.02, hy + r * 0.44, r * 0.21, r * 0.15, 0, 0, Math.PI * 2);
    ctx.ellipse(hx + r * 0.88, hy + r * 0.4, r * 0.18, r * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    // Eyes
    ctx.strokeStyle = line;
    ctx.fillStyle = line;
    ctx.lineWidth = 2.5;
    const e = r * 0.14; // squint / blink stroke size
    for (const ex of [hx + r * 0.3, hx + r * 0.74]) {
      const ey = hy + r * 0.12;
      if (squint) {
        ctx.beginPath();
        ctx.moveTo(ex - e, ey - e * 0.9);
        ctx.lineTo(ex + e * 0.4, ey);
        ctx.lineTo(ex - e, ey + e * 0.9);
        ctx.stroke();
      } else if (blink) {
        ctx.beginPath();
        ctx.arc(ex, ey - e * 0.3, e, 0.1 * Math.PI, 0.9 * Math.PI);
        ctx.stroke();
      } else {
        // Big shiny eyes with two highlights
        ctx.beginPath();
        ctx.ellipse(ex, ey, r * 0.155, r * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(ex + r * 0.05, ey - r * 0.08, r * 0.075, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(ex - r * 0.05, ey + r * 0.09, r * 0.035, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = line;
      }
    }
    // Smile
    ctx.strokeStyle = "#7a3b2e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hx + r * 0.52, hy + r * 0.4, r * 0.13, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();
  };

  // Keyboard backpack with colourful keycaps
  // A full Keychron keyboard slung across the rider's back
  const drawKeyboardOnBack = (cx: number, cy: number, angle: number) => {
    const w = 66;
    const h = 24;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    // Case
    ctx.fillStyle = "#3b4048";
    roundedRect(ctx, -w / 2, -h / 2, w, h, 5);
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = ink;
    roundedRect(ctx, -w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 3);
    ctx.fill();
    // Keys: 3 rows, gold Esc, cyan Enter, long space bar
    const cols = 9;
    const keyW = (w - 10) / cols;
    const keyH = (h - 10) / 3;
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (row === 2 && col > 2 && col < 7) continue;
        ctx.fillStyle =
          row === 0 && col === 0 ? gold : row === 1 && col === cols - 1 ? "#8eddf1" : "#d8dde0";
        roundedRect(ctx, -w / 2 + 5 + col * keyW + 0.6, -h / 2 + 5 + row * keyH + 0.6, keyW - 1.2, keyH - 1.2, 1);
        ctx.fill();
      }
    }
    ctx.fillStyle = "#d8dde0";
    roundedRect(ctx, -w / 2 + 5 + 3 * keyW + 0.6, -h / 2 + 5 + 2 * keyH + 0.6, keyW * 4 - 1.2, keyH - 1.2, 1);
    ctx.fill();
    ctx.restore();
  };
  // Gold strap across the hoodie holding the keyboard on
  const drawStrap = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.strokeStyle = gold;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  const drawLimb = (color: string, width: number, points: [number, number][]) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (const [px, py] of points.slice(1)) ctx.lineTo(px, py);
    ctx.stroke();
  };
  const drawShoe = (sx: number, sy: number) => {
    ctx.fillStyle = gold;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = line;
    ctx.lineWidth = 2;
    ctx.stroke();
  };

  if (player.sliding) {
    // Crouched low, one hand grabbing the board
    drawLimb(denim, 10, [[70, H - 36], [56, H - 34], [54, H - 22]]);
    drawLimb(denim, 10, [[80, H - 36], [96, H - 36], [98, H - 22]]);
    drawShoe(54, H - 21);
    drawShoe(99, H - 21);
    drawKeyboardOnBack(70, H - 62, -0.12);
    ctx.fillStyle = ink;
    roundedRect(ctx, 60, H - 56, 30, 24, 12);
    ctx.fill();
    drawStrap(66, H - 56, 90, H - 36);
    drawLimb(ink, 7, [[80, H - 44], [88, H - 31], [90, H - 22]]);
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(90, H - 21, 5.5, 0, Math.PI * 2);
    ctx.fill();
    drawFace(104, H - 50, HEAD_RADIUS, true);
  } else {
    const sway = Math.sin(state.elapsed * 6) * 4;
    const tuck = airborne ? (trick === "kickflip" || trick === "shuvit" ? 16 : 8) : 0;
    // Legs: wide skate stance, knees tuck up during an ollie
    drawLimb(denim, 11, [[68, H - 50], [56, H - 38 - tuck], [52, H - 24 - tuck * 0.4]]);
    drawLimb(denim, 11, [[78, H - 50], [92, H - 38 - tuck], [100, H - 24 - tuck * 0.4]]);
    drawShoe(51, H - 22 - tuck * 0.4);
    drawShoe(101, H - 22 - tuck * 0.4);
    // Upper body leans from the hips: forward when pushing, back when braking
    ctx.save();
    ctx.translate(72, H - 50);
    ctx.rotate(lean * 0.22);
    ctx.translate(-72 + lean * 5, -(H - 50));
    drawKeyboardOnBack(50, H - 74, -1.05);
    // Back arm out for balance
    drawLimb(ink, 8, [[64, H - 72], [46, H - 62 + sway], [32, H - 66 + sway]]);
    // Hoodie body (small and round)
    ctx.fillStyle = ink;
    roundedRect(ctx, 58, H - 80, 28, 32, 14);
    ctx.fill();
    drawStrap(60, H - 77, 65, H - 50);
    ctx.fillStyle = gold;
    ctx.font = "900 8px Arial";
    ctx.textAlign = "center";
    ctx.fillText("PAX", 73, H - 59);
    ctx.textAlign = "left";
    // Front arm: out for balance, or reaching down to grab the board
    const handX = 112;
    const handY = trick === "grab" ? H - 34 - trickArc * 6 : H - 76 - sway;
    if (trick === "grab") drawLimb(ink, 8, [[80, H - 72], [102, H - 56], [handX, handY]]);
    else drawLimb(ink, 8, [[80, H - 72], [100, H - 68 - sway], [handX, handY]]);
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(32, H - 66 + sway, 5.5, 0, Math.PI * 2);
    ctx.moveTo(handX + 5.5, handY);
    ctx.arc(handX, handY, 5.5, 0, Math.PI * 2);
    ctx.fill();
    drawFace(76, H - 104, HEAD_RADIUS, airborne && player.velocityY < 0);
    ctx.restore();
  }

  }

  // ---- Board cat ----
  // Follows the board's position and tilt but not its flip; it hops clear
  // while the board flips or spins underneath, then lands back on the nose.
  const catHop =
    trick === "kickflip" || trick === "shuvit" ? trickArc * 22 : trick === "grab" ? trickArc * 6 : 0;
  ctx.save();
  ctx.translate(76, boardY);
  ctx.rotate(boardTilt);
  // On the nose while riding; hops back to the tail when the rider slides
  // so it doesn't cover their face.
  ctx.translate(player.sliding ? -44 : 40, -1 - catHop);
  ctx.rotate(-lean * 0.22);
  drawBoardCat(ctx, state.elapsed, player.sliding ? 1 : 0);
  ctx.restore();

  if (HALLOWEEN) {
    ctx.globalAlpha = 1;
    drawPlayerAura(ctx, {
      width: player.width,
      height: H,
      elapsed: state.elapsed,
      broomLift: state.broomLift,
      shieldSeconds: state.pumpkinShield,
      magnet: state.activePower?.kind === "magnet",
      ghost: ghostMode,
    });
  }
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]) {
  particles.forEach((particle) => {
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  });
  ctx.globalAlpha = 1;
}

function drawScorePopups(ctx: CanvasRenderingContext2D, popups: ScorePopup[]) {
  popups.forEach((popup) => {
    const t = clamp(1 - popup.timer / popup.duration, 0, 1);
    const scale = t < 0.25 ? 0.7 + (t / 0.25) * 0.5 : 1.2 - Math.min(1, (t - 0.25) / 0.75) * 0.2;
    const alpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;

    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.translate(popup.x, popup.y);
    ctx.scale(scale, scale);
    ctx.font = "900 30px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(23,27,31,.9)";
    ctx.strokeText(popup.text, 0, 0);
    ctx.fillStyle = popup.color;
    ctx.fillText(popup.text, 0, 0);
    ctx.restore();
  });
  ctx.globalAlpha = 1;
}

function drawHud(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  highScore: number,
) {
  ctx.fillStyle = "rgba(27,29,34,.86)";
  roundedRect(ctx, 28, 24, 516, 78, 18);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.15)";
  ctx.fillRect(178, 40, 2, 47);
  ctx.fillRect(334, 40, 2, 47);

  ctx.fillStyle = "#8eddf1";
  ctx.font = "800 15px 'Courier New', monospace";
  ctx.fillText("SCORE", 52, 49);
  ctx.fillText(HALLOWEEN ? "CANDY" : "SWITCHES", 204, 49);
  ctx.fillText("DISTANCE", 360, 49);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 29px 'Courier New', monospace";
  ctx.fillText(String(Math.floor(state.score)).padStart(5, "0"), 52, 81);
  ctx.fillText(`× ${state.pizzasCollected}`, 204, 81);
  ctx.fillStyle = state.milestoneFlash > 0 ? "#ffd84e" : "#ffffff";
  ctx.fillText(`${Math.floor(state.distance)}m`, 360, 81);

  if (state.milestoneFlash > 0) {
    const progress = 1 - state.milestoneFlash / 1.6;
    ctx.save();
    ctx.globalAlpha = clamp(state.milestoneFlash / 1.6, 0, 1);
    ctx.translate(420, 14 - progress * 20);
    const milestoneLabel = state.milestoneLabel;
    ctx.font = "900 20px Arial";
    const milestoneWidth = Math.ceil(ctx.measureText(milestoneLabel).width) + 28;
    ctx.fillStyle = "#171b1f";
    roundedRect(ctx, -milestoneWidth / 2, -16, milestoneWidth, 32, 10);
    ctx.fill();
    ctx.fillStyle = "#ffd84e";
    ctx.textAlign = "center";
    ctx.fillText(milestoneLabel, 0, 6);
    ctx.textAlign = "left";
    ctx.restore();
  }

  ctx.fillStyle = "rgba(27,29,34,.86)";
  roundedRect(ctx, WORLD_WIDTH - 278, 24, 250, 78, 18);
  ctx.fill();
  ctx.fillStyle = "#8eddf1";
  ctx.font = "800 15px 'Courier New', monospace";
  ctx.fillText(`BEST ${String(highScore).padStart(5, "0")}`, WORLD_WIDTH - 251, 50);
  ctx.font = "900 26px Arial";
  ctx.fillStyle = "#ffffff";
  ctx.fillText("LIVES", WORLD_WIDTH - 251, 82);
  for (let heart = 0; heart < 3; heart += 1) {
    ctx.fillStyle = heart < state.lives ? "#e31837" : "rgba(255,255,255,.22)";
    ctx.beginPath();
    const hx = WORLD_WIDTH - 101 + heart * 25;
    const hy = 72;
    ctx.moveTo(hx, hy + 7);
    ctx.bezierCurveTo(hx - 13, hy - 2, hx - 14, hy + 14, hx, hy + 23);
    ctx.bezierCurveTo(hx + 14, hy + 14, hx + 13, hy - 2, hx, hy + 7);
    ctx.fill();
  }

  const letterBoxSize = LETTER_BOX_SIZE;
  const letterGap = LETTER_GAP;
  const letterPanelCenterX = LETTER_PANEL_CENTER_X;
  const letterPanelX = LETTER_PANEL_X;
  const letterPanelY = LETTER_PANEL_Y;

  ctx.fillStyle = "rgba(27,29,34,.86)";
  roundedRect(ctx, letterPanelX, letterPanelY, LETTER_PANEL_WIDTH, LETTER_PANEL_HEIGHT, 16);
  ctx.fill();

  ctx.fillStyle = "#8eddf1";
  ctx.font = "800 13px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText("KEYCHRON", letterPanelCenterX, letterPanelY + 20);

  const letterStartX = LETTER_START_X;
  const letterY = LETTER_TILE_Y;
  ctx.font = "900 12px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  KEYCHRON_LETTERS.forEach((letter, index) => {
    const collected = state.collectedLetters.has(letter);
    const lx = letterStartX + index * (letterBoxSize + letterGap);
    const cx = lx + letterBoxSize / 2;
    const cy = letterY + letterBoxSize / 2;
    const isFlashing = letter === state.letterFlashLetter && state.letterFlashTimer > 0;
    const flashProgress = isFlashing ? Math.min(1, state.letterFlashTimer / 0.7) : 0;
    const pulse = 0.82 + Math.sin(state.elapsed * 3 + index * 0.7) * 0.18;
    const inset = 3;

    if (isFlashing) {
      ctx.save();
      const flamePoints = 14;
      const ringRadius = letterBoxSize * 0.58;
      ctx.fillStyle = `rgba(255,216,78,${0.55 * flashProgress})`;
      ctx.beginPath();
      ctx.arc(cx, cy, letterBoxSize * 1.15, 0, Math.PI * 2);
      ctx.fill();
      for (let point = 0; point < flamePoints; point += 1) {
        const angle = (point / flamePoints) * Math.PI * 2;
        const jitter = Math.sin(state.elapsed * 30 + point * 2.3) * 2.5;
        const dist = ringRadius + jitter * 0.4;
        const fx = cx + Math.cos(angle) * dist;
        const fy = cy + Math.sin(angle) * dist;
        const size = (7 + jitter * 0.8) * flashProgress;

        ctx.fillStyle = `rgba(227,24,55,${0.85 * flashProgress})`;
        ctx.beginPath();
        ctx.arc(fx, fy, size, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(255,150,40,${0.9 * flashProgress})`;
        ctx.beginPath();
        ctx.arc(fx, fy, size * 0.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(255,236,150,${flashProgress})`;
        ctx.beginPath();
        ctx.arc(fx, fy, size * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    ctx.save();
    const scale = 1 + flashProgress * 0.4;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);

    // Outer bezel, matching the physical keycap look used elsewhere.
    ctx.fillStyle = "#171b1f";
    roundedRect(ctx, lx, letterY, letterBoxSize, letterBoxSize, 5);
    ctx.fill();

    // Inner cap surface.
    if (isFlashing) {
      ctx.fillStyle = "#ffd84e";
    } else if (collected) {
      ctx.fillStyle = `rgba(142,221,241,${0.72 + pulse * 0.28})`;
    } else {
      ctx.fillStyle = "#2b333a";
    }
    roundedRect(
      ctx,
      lx + inset,
      letterY + inset,
      letterBoxSize - inset * 2,
      letterBoxSize - inset * 2,
      3,
    );
    ctx.fill();

    ctx.fillStyle = isFlashing ? "#171b1f" : collected ? "#0e2735" : "rgba(255,255,255,.4)";
    ctx.fillText(letter, cx, cy + 1);
    ctx.restore();
  });
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  for (const effect of state.letterFlyEffects) {
    const targetIndex = KEYCHRON_LETTERS.indexOf(effect.letter as (typeof KEYCHRON_LETTERS)[number]);
    if (targetIndex < 0) continue;
    const target = LETTER_TILE_CENTERS[targetIndex];
    const t = Math.min(1, Math.max(0, 1 - effect.timer / effect.duration));
    const eased = 1 - (1 - t) * (1 - t);
    const midX = (effect.fromX + target.x) / 2;
    const midY = Math.min(effect.fromY, target.y) - 70;

    for (let trail = 7; trail >= 0; trail -= 1) {
      const trailT = Math.min(1, Math.max(0, eased - trail * 0.05));
      const mt = 1 - trailT;
      const px = mt * mt * effect.fromX + 2 * mt * trailT * midX + trailT * trailT * target.x;
      const py = mt * mt * effect.fromY + 2 * mt * trailT * midY + trailT * trailT * target.y;
      const fade = 1 - trail / 8;
      const size = trail === 0 ? 5 : Math.max(1.2, 4 - trail * 0.4);
      ctx.fillStyle = trail === 0 ? `rgba(255,255,255,${0.9 * fade})` : `rgba(142,221,241,${0.75 * fade})`;
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (state.combo >= (HALLOWEEN ? HALLOWEEN_COMBO_SHOW_FROM : 2) && state.comboTimer > 0) {
    ctx.save();
    ctx.translate(WORLD_WIDTH / 2, 150);
    const breathe = 1 + Math.sin(state.elapsed * 4) * 0.055;
    ctx.scale(breathe, breathe);
    const comboLabel =
      HALLOWEEN && state.combo >= COMBO_CAP
        ? `MAX COMBO ×${COMBO_CAP} · ${state.combo} in a row!`
        : `${state.combo}× ${HALLOWEEN ? "CANDY" : "SWITCH"} COMBO!`;
    ctx.font = "900 28px Arial";
    const comboWidth = Math.ceil(ctx.measureText(comboLabel).width) + 44;
    const comboHeight = 52;
    const halfW = comboWidth / 2;
    const halfH = comboHeight / 2;

    // Escalating sunburst wraps the banner: bigger + hotter the longer the streak runs.
    const tier = state.combo >= 20 ? 2 : state.combo >= 10 ? 1 : 0;
    const flameColors = [
      { core: "255,236,150", mid: "255,150,40", outer: "255,90,30" },
      { core: "255,200,90", mid: "227,24,55", outer: "168,20,20" },
      { core: "255,210,255", mid: "196,86,235", outer: "107,33,168" },
    ][tier];
    const tierBase = [0.5, 0.85, 1.25][tier];
    const tierGrowth =
      tier === 0
        ? Math.min(Math.max(state.combo - 2, 0) / 7, 1)
        : tier === 1
          ? Math.min(Math.max(state.combo - 10, 0) / 9, 1)
          : Math.min(Math.max(state.combo - 20, 0) / 20, 1);
    const burstScale = tierBase + tierGrowth * 0.25;
    const burstRadius = (halfW + 18) * burstScale;
    const rotation = state.elapsed * (0.7 + tier * 0.2);

    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, burstRadius * 1.3);
    glow.addColorStop(0, `rgba(${flameColors.core},.55)`);
    glow.addColorStop(0.45, `rgba(${flameColors.mid},.32)`);
    glow.addColorStop(1, `rgba(${flameColors.outer},0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, burstRadius * 1.3, 0, Math.PI * 2);
    ctx.fill();

    const rayCount = 16 + tier * 6;
    for (let ray = 0; ray < rayCount; ray += 1) {
      const angle = (ray / rayCount) * Math.PI * 2 + rotation;
      const flicker = 0.8 + Math.sin(state.elapsed * 10 + ray * 1.3) * 0.2;
      const rayLength = burstRadius * (0.85 + flicker * 0.25);
      ctx.save();
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(halfH * 0.5, -halfH * 0.16);
      ctx.lineTo(rayLength, 0);
      ctx.lineTo(halfH * 0.5, halfH * 0.16);
      ctx.closePath();
      ctx.fillStyle = ray % 2 === 0 ? `rgba(${flameColors.mid},.5)` : `rgba(${flameColors.outer},.4)`;
      ctx.fill();
      ctx.restore();
    }

    const dotCount = 20 + tier * 6;
    const ringRadius = halfH + 10 * burstScale;
    for (let dot = 0; dot < dotCount; dot += 1) {
      const angle = (dot / dotCount) * Math.PI * 2 - rotation * 1.4;
      const dotFlicker = 0.6 + Math.sin(state.elapsed * 14 + dot) * 0.4;
      const dx = Math.cos(angle) * ringRadius;
      const dy = Math.sin(angle) * ringRadius;
      ctx.fillStyle = `rgba(${flameColors.core},${0.5 + dotFlicker * 0.5})`;
      ctx.beginPath();
      ctx.arc(dx, dy, 2.2 * burstScale, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(15,12,10,.82)";
    roundedRect(ctx, -halfW, -halfH, comboWidth, comboHeight, halfH);
    ctx.fill();
    ctx.strokeStyle = `rgba(${flameColors.core},.9)`;
    ctx.lineWidth = 2;
    roundedRect(ctx, -halfW, -halfH, comboWidth, comboHeight, halfH);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText(comboLabel, 0, 10);
    ctx.textAlign = "left";
    ctx.restore();
  }

  if (state.player.shield > 0) {
    ctx.save();
    ctx.translate(WORLD_WIDTH / 2, 220);
    const shieldLabel = "🔑 SHIELD ACTIVE";
    ctx.font = "900 22px Arial";
    const shieldWidth = Math.ceil(ctx.measureText(shieldLabel).width) + 40;
    ctx.fillStyle = "#171b1f";
    roundedRect(ctx, -shieldWidth / 2, -22, shieldWidth, 44, 12);
    ctx.fill();
    ctx.fillStyle = "#8eddf1";
    ctx.textAlign = "center";
    ctx.fillText(shieldLabel, 0, 7);
    ctx.textAlign = "left";
    ctx.restore();
  }
}

function drawKeychronCelebration(
  ctx: CanvasRenderingContext2D,
  state: GameState,
) {
  const t = state.keychronCelebration;
  const fade = clamp(t / 1.8, 0, 1);
  ctx.save();
  ctx.fillStyle = `rgba(255,216,78,${0.3 * fade})`;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  ctx.restore();

  const pop = t > 1.5 ? 1 - (t - 1.5) / 0.3 : 1;
  const scale = 0.85 + pop * 0.15;
  ctx.save();
  ctx.globalAlpha = clamp(fade * 1.4, 0, 1);
  ctx.translate(WORLD_WIDTH / 2, 380);
  ctx.scale(scale, scale);
  const label = "🎉 KEYCHRON COMPLETE! 🎉";
  ctx.font = "900 32px Arial";
  const width = Math.ceil(ctx.measureText(label).width) + 56;
  ctx.fillStyle = "#171b1f";
  roundedRect(ctx, -width / 2, -32, width, 64, 20);
  ctx.fill();
  ctx.fillStyle = "#ffd84e";
  ctx.textAlign = "center";
  ctx.fillText(label, 0, 11);
  ctx.textAlign = "left";
  ctx.restore();
}

function drawBigPizzaMissed(ctx: CanvasRenderingContext2D, state: GameState) {
  const t = state.bigPizzaMissed;
  const fade = clamp(t / 1.4, 0, 1);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(WORLD_WIDTH / 2, 320);
  const label = "😢 Missed the keyboard...";
  ctx.font = "900 22px Arial";
  const width = Math.ceil(ctx.measureText(label).width) + 40;
  ctx.fillStyle = "rgba(23,27,31,.88)";
  roundedRect(ctx, -width / 2, -22, width, 44, 14);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.85)";
  ctx.textAlign = "center";
  ctx.fillText(label, 0, 7);
  ctx.textAlign = "left";
  ctx.restore();
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  mode: GameMode,
) {
  if (mode === "running") return;
  ctx.fillStyle = "rgba(17,19,23,.72)";
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  if (mode === "ready") {
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "900 72px Arial";
    if (HALLOWEEN) {
      ctx.fillText("KEYCHRON DASH", WORLD_WIDTH / 2, 196);
      ctx.fillStyle = "#ff7a1a";
      ctx.font = "900 34px Arial";
      ctx.fillText("🎃 HALLOWEEN NIGHT 🎃", WORLD_WIDTH / 2, 244);
      ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.font = "700 20px Arial";
      ctx.fillText("Dodge the spooks, grab candy and spell K-E-Y-C-H-R-O-N!", WORLD_WIDTH / 2, 286);
      // Power-up legend
      const kinds: PowerUpKind[] = ["broom", "shield", "magnet", "ghost"];
      kinds.forEach((kind, index) => {
        const cx = WORLD_WIDTH / 2 - 375 + index * 250;
        ctx.save();
        ctx.translate(cx - 70, 330);
        drawPowerUpIcon(ctx, kind, 34);
        ctx.restore();
        ctx.textAlign = "left";
        ctx.fillStyle = POWER_UP_INFO[kind].color;
        ctx.font = "900 15px 'Courier New', monospace";
        ctx.fillText(POWER_UP_INFO[kind].name, cx - 46, 326);
        ctx.fillStyle = "rgba(255,255,255,.7)";
        ctx.font = "700 13px Arial";
        ctx.fillText(POWER_UP_INFO[kind].blurb, cx - 46, 344);
      });
      ctx.textAlign = "center";
      ctx.fillStyle = "#b98af0";
      ctx.font = "700 15px Arial";
      ctx.fillText("HAUNTED STRETCHES at 500 m, 1,500 m, 2,500 m… double your points · The WITCH attacks every 1,000 m", WORLD_WIDTH / 2, 372);
    } else {
      ctx.fillText("KEYCHRON DASH", WORLD_WIDTH / 2, 240);
      ctx.fillStyle = "#ffd84e";
      ctx.font = "900 28px Arial";
      ctx.fillText("RACE TO PAX AUS 2026", WORLD_WIDTH / 2, 288);
      ctx.fillStyle = "rgba(255,255,255,.82)";
      ctx.font = "700 21px Arial";
      ctx.fillText("Dodge the obstacles, grab switches and spell K-E-Y-C-H-R-O-N!", WORLD_WIDTH / 2, 340);
    }
    ctx.fillStyle = HALLOWEEN ? "#ff7a1a" : "#f5b21f";
    roundedRect(ctx, WORLD_WIDTH / 2 - 210, 390, 420, 82, 18);
    ctx.fill();
    ctx.fillStyle = "#1b1d22";
    ctx.font = "900 29px 'Courier New', monospace";
    ctx.fillText(IS_TOUCH_DEVICE ? "TAP HERE TO START" : "PRESS ENTER TO START", WORLD_WIDTH / 2, 441);
    ctx.fillStyle = "rgba(255,255,255,.74)";
    ctx.font = "700 17px Arial";
    ctx.fillText(
      HALLOWEEN
        ? IS_TOUCH_DEVICE
          ? "Buttons below:  ← → move   ↓ slide   ↑ jump   🍬 throw candy / knock"
          : "W / ↑ jump    S / ↓ slide    A D / ← → move    SPACE throw candy / knock on doors"
        : IS_TOUCH_DEVICE
          ? "Use the buttons below:  ← → move    ↓ slide    ↑ jump"
          : "SPACE / W / ↑ jump    S / ↓ slide    A D / ← → move",
      WORLD_WIDTH / 2,
      520,
    );
    if (HALLOWEEN) {
      ctx.fillStyle = "rgba(255,255,255,.62)";
      ctx.font = "700 15px Arial";
      ctx.fillText("Stomp pumpkins · Grind rails · Take the rooftop route · Knock on doors · Complete missions", WORLD_WIDTH / 2, 548);
    }
  }

  if (mode === "paused") {
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "900 58px Arial";
    ctx.fillText("PAUSED", WORLD_WIDTH / 2, 310);
    ctx.fillStyle = "#ffd84e";
    ctx.font = "900 25px 'Courier New', monospace";
    ctx.fillText(IS_TOUCH_DEVICE ? "TAP TO CONTINUE" : "PRESS P TO CONTINUE", WORLD_WIDTH / 2, 365);
  }
  ctx.textAlign = "left";
}

function getPlayerHitbox(player: Player) {
  return player.sliding
    ? {
        x: player.x + 20,
        y: player.y + 15,
        width: player.width - 32,
        height: player.height - 18,
      }
    : {
        x: player.x + 27,
        y: player.y + 13,
        width: player.width - 43,
        height: player.height - 20,
      };
}

function PizzaDashGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const gameRef = useRef<GameState>(freshGame());
  if (__DEBUG__) (window as unknown as { __game: typeof gameRef }).__game = gameRef;
  const modeRef = useRef<GameMode>("ready");
  const gameOverViewRef = useRef<GameOverView>("entry");
  const keysRef = useRef({ left: false, right: false, down: false });
  const audioBusRef = useRef<AudioBus | null>(null);
  const musicTimerRef = useRef<number | null>(null);
  const musicStepRef = useRef(0);
  const musicNextTimeRef = useRef(0);
  const soundEnabledRef = useRef(true);
  const highScoreRef = useRef(0);
  const lastHudUpdateRef = useRef(0);
  const [mode, setMode] = useState<GameMode>("ready");
  const [gameOverView, setGameOverView] = useState<GameOverView>("entry");
  const [playerName, setPlayerName] = useState("");
  // Contact details stay filled in between runs so players can replay quickly
  const [playerEmail, setPlayerEmail] = useState("");
  const [playerPhone, setPlayerPhone] = useState("");
  const [playerConsent, setPlayerConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardError, setLeaderboardError] = useState("");
  const [lastSavedEntryId, setLastSavedEntryId] = useState<string | null>(null);
  const [playerRank, setPlayerRank] = useState<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [highScore, setHighScore] = useState(0);
  const [hud, setHud] = useState<Hud>({ score: 0, pizzas: 0, lives: 3, distance: 0 });
  // Halloween: the touch candy button becomes "Knock" while passing a door
  const [atDoor, setAtDoor] = useState(false);
  // Halloween: the round Keychron logo as a jack-o'-lantern (made once the logo loads)
  const [brandLogoUrl, setBrandLogoUrl] = useState(keychronLogoUrl);
  useEffect(() => {
    if (!HALLOWEEN) return;
    const image = new window.Image();
    image.onload = () => {
      const pumpkin = makePumpkinKeychronLogo(image);
      if (pumpkin) setBrandLogoUrl(pumpkin);
    };
    image.src = keychronLogoUrl;
  }, []);
  const atDoorRef = useRef(false);

  const changeMode = useCallback((nextMode: GameMode) => {
    modeRef.current = nextMode;
    setMode(nextMode);
  }, []);

  const changeGameOverView = useCallback((nextView: GameOverView) => {
    gameOverViewRef.current = nextView;
    setGameOverView(nextView);
  }, []);

  const ensureAudio = useCallback(() => {
    if (typeof window === "undefined") return null;
    try {
      if (audioBusRef.current) {
        if (audioBusRef.current.context.state === "suspended") {
          void audioBusRef.current.context.resume();
        }
        return audioBusRef.current;
      }
      const AudioCtor = window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return null;
      const context = new AudioCtor();
      const music = context.createGain();
      const sfx = context.createGain();
      const master = context.createGain();
      const compressor = context.createDynamicsCompressor();
      const noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
      const noiseData = noise.getChannelData(0);
      for (let index = 0; index < noiseData.length; index += 1) {
        noiseData[index] = Math.random() * 2 - 1;
      }
      music.gain.value = 0.0001;
      sfx.gain.value = 0.76;
      master.gain.value = 0.72;
      compressor.threshold.value = -18;
      compressor.knee.value = 12;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.22;
      music.connect(master);
      sfx.connect(master);
      master.connect(compressor);
      compressor.connect(context.destination);
      audioBusRef.current = { context, music, sfx, noise };
      if (context.state === "suspended") void context.resume();
      return audioBusRef.current;
    } catch {
      return null;
    }
  }, []);

  const playSound = useCallback(
    (effect: SoundEffect, combo = 0) => {
      if (!soundEnabledRef.current) return;
      const bus = ensureAudio();
      if (!bus) return;
      const { context, sfx } = bus;
      const now = context.currentTime + 0.006;
      if (HALLOWEEN && playHalloweenSound(bus, effect, combo, now)) return;

      if (effect === "jump") {
        scheduleNoise(bus, sfx, now, 0.19, 0.075, 1150, "bandpass", 0.65);
        scheduleTone(context, sfx, now, 0.17, 260, 760, 0.105, "triangle", -7);
        scheduleTone(context, sfx, now + 0.018, 0.13, 520, 1180, 0.035, "sine", 8);
      } else if (effect === "hit") {
        const hitBoost = context.createGain();
        hitBoost.gain.setValueAtTime(1.55, now);
        hitBoost.gain.setValueAtTime(1.55, now + 0.32);
        hitBoost.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
        hitBoost.connect(sfx);

        const currentMusicGain = Math.max(0.0001, bus.music.gain.value);
        bus.music.gain.cancelScheduledValues(now);
        bus.music.gain.setValueAtTime(currentMusicGain, now);
        bus.music.gain.exponentialRampToValueAtTime(0.13, now + 0.025);
        bus.music.gain.setValueAtTime(0.13, now + 0.24);
        bus.music.gain.exponentialRampToValueAtTime(0.5, now + 0.46);

        scheduleNoise(bus, hitBoost, now, 0.3, 0.22, 290, "lowpass", 0.75);
        scheduleNoise(bus, hitBoost, now + 0.01, 0.18, 0.095, 2050, "bandpass", 1.25);
        scheduleTone(context, hitBoost, now, 0.34, 185, 46, 0.21, "sine");
        scheduleTone(context, hitBoost, now, 0.16, 122, 64, 0.07, "sawtooth", -10);
        scheduleYelp(bus, hitBoost, now + 0.035);
        window.setTimeout(() => hitBoost.disconnect(), 650);
      } else if (effect === "pizza") {
        const lift = Math.min(combo, 8) * 9;
        [659.25, 830.61, 987.77].forEach((frequency, index) => {
          const noteStart = now + index * 0.045;
          scheduleTone(
            context,
            sfx,
            noteStart,
            0.11,
            frequency + lift,
            (frequency + lift) * 1.012,
            0.055 - index * 0.008,
            "triangle",
            index * 4,
          );
          scheduleTone(
            context,
            sfx,
            noteStart,
            0.08,
            (frequency + lift) * 2,
            (frequency + lift) * 2.02,
            0.012,
            "sine",
            -index * 3,
          );
        });
        scheduleNoise(bus, sfx, now + 0.08, 0.11, 0.024, 6800, "highpass", 0.4);
      } else if (effect === "gameover") {
        [246.94, 196, 146.83].forEach((frequency, index) => {
          scheduleTone(
            context,
            sfx,
            now + index * 0.1,
            0.32,
            frequency,
            frequency * 0.92,
            0.065,
            index === 2 ? "sawtooth" : "triangle",
          );
        });
        scheduleTone(context, sfx, now + 0.19, 0.42, 105, 48, 0.1, "sine");
        scheduleNoise(bus, sfx, now + 0.2, 0.2, 0.04, 420, "lowpass", 0.7);
      } else if (effect === "start") {
        [392, 523.25, 659.25].forEach((frequency, index) => {
          scheduleTone(
            context,
            sfx,
            now + index * 0.055,
            0.14,
            frequency,
            frequency * 1.015,
            0.045,
            "triangle",
          );
        });
        scheduleNoise(bus, sfx, now + 0.08, 0.1, 0.018, 6200, "highpass", 0.35);
      } else if (effect === "keycap") {
        [523.25, 659.25, 830.61, 1046.5].forEach((frequency, index) => {
          const noteStart = now + index * 0.05;
          scheduleTone(
            context,
            sfx,
            noteStart,
            0.16,
            frequency,
            frequency * 1.02,
            0.06,
            "square",
            index * 3,
          );
        });
        scheduleNoise(bus, sfx, now + 0.12, 0.14, 0.03, 5200, "highpass", 0.5);
      } else if (effect === "graze") {
        scheduleNoise(bus, sfx, now, 0.09, 0.05, 2600, "bandpass", 0.9);
        scheduleTone(context, sfx, now, 0.07, 900, 1400, 0.018, "sine");
      } else if (effect === "keychron") {
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((frequency, index) => {
          const noteStart = now + index * 0.07;
          scheduleTone(
            context,
            sfx,
            noteStart,
            0.22,
            frequency,
            frequency * 1.01,
            0.075,
            "triangle",
            index * 2,
          );
          scheduleTone(
            context,
            sfx,
            noteStart,
            0.16,
            frequency * 2,
            frequency * 2.01,
            0.02,
            "sine",
          );
        });
        scheduleNoise(bus, sfx, now + 0.2, 0.2, 0.035, 6400, "highpass", 0.4);
      } else if (effect === "bigpizza") {
        [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
          const noteStart = now + index * 0.055;
          scheduleTone(
            context,
            sfx,
            noteStart,
            0.32,
            frequency,
            frequency * 1.02,
            0.1,
            "triangle",
            index * 2,
          );
          scheduleTone(
            context,
            sfx,
            noteStart,
            0.22,
            frequency * 2,
            frequency * 2.02,
            0.035,
            "sine",
          );
        });
        scheduleNoise(bus, sfx, now + 0.04, 0.3, 0.06, 4200, "bandpass", 0.65);
        scheduleTone(context, sfx, now + 0.24, 0.5, 1318.5, 1567.98, 0.08, "triangle");
      } else if (effect === "miss") {
        scheduleTone(context, sfx, now, 0.22, 330, 210, 0.05, "sine");
        scheduleTone(context, sfx, now + 0.16, 0.26, 240, 150, 0.045, "sine");
      } else if (effect === "powerup") {
        // Magic shimmer: quick rising arpeggio
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((frequency, index) => {
          scheduleTone(context, sfx, now + index * 0.05, 0.14, frequency, frequency * 1.01, 0.04, "triangle", index * 4);
        });
      } else if (effect === "haunted") {
        // Spooky "ooo-OOO": a wobbling low glide plus a thunder rumble
        scheduleTone(context, sfx, now, 0.9, 196, 330, 0.06, "sine", -12);
        scheduleTone(context, sfx, now + 0.05, 0.85, 207.65, 311.13, 0.035, "triangle", 14);
        scheduleNoise(bus, sfx, now + 0.1, 0.8, 0.08, 220, "lowpass", 0.8);
      } else if (effect === "shieldbreak") {
        scheduleNoise(bus, sfx, now, 0.22, 0.09, 900, "bandpass", 0.9);
        scheduleTone(context, sfx, now, 0.25, 420, 160, 0.06, "square");
      } else if (effect === "throw") {
        scheduleNoise(bus, sfx, now, 0.12, 0.05, 2400, "bandpass", 0.8);
        scheduleTone(context, sfx, now, 0.1, 500, 900, 0.03, "triangle");
      } else if (effect === "zap") {
        scheduleTone(context, sfx, now, 0.18, 1200, 300, 0.05, "square", 6);
        scheduleNoise(bus, sfx, now, 0.2, 0.05, 3200, "highpass", 0.6);
      } else if (effect === "stomp") {
        scheduleTone(context, sfx, now, 0.14, 220, 90, 0.09, "square");
        scheduleNoise(bus, sfx, now, 0.16, 0.08, 700, "lowpass", 0.8);
        scheduleTone(context, sfx, now + 0.06, 0.12, 660, 990, 0.035, "triangle");
      } else if (effect === "boss") {
        // Witch cackle: quick wobbling high notes
        for (let k = 0; k < 6; k += 1) {
          scheduleTone(context, sfx, now + k * 0.09, 0.08, 880 - k * 40, 700 - k * 40, 0.04, "sawtooth", k * 9);
        }
        scheduleNoise(bus, sfx, now, 0.7, 0.06, 260, "lowpass", 0.8);
      } else if (effect === "treat") {
        [659.25, 783.99, 1046.5].forEach((frequency, index) => {
          scheduleTone(context, sfx, now + index * 0.07, 0.18, frequency, frequency, 0.05, "triangle");
        });
      } else if (effect === "trick") {
        scheduleTone(context, sfx, now, 0.5, 300, 140, 0.05, "sawtooth", -20);
        scheduleTone(context, sfx, now + 0.05, 0.45, 315, 150, 0.03, "sawtooth", 20);
      } else if (effect === "grind") {
        scheduleNoise(bus, sfx, now, 0.15, 0.03, 4200, "bandpass", 1.6);
      } else if (effect === "thunder") {
        // Real thunder: a sharp crack, then a rolling rumble that swells a few
        // times while its tone sinks, lasting about 3 seconds
        scheduleNoise(bus, sfx, now, 0.3, 0.14, 1800, "highpass", 0.5, 0.004);
        scheduleNoise(bus, sfx, now + 0.06, 0.25, 0.09, 1200, "highpass", 0.5, 0.004);
        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const envelope = context.createGain();
        source.buffer = bus.noise;
        source.loop = true;
        source.playbackRate.value = 0.6;
        filter.type = "lowpass";
        filter.Q.value = 0.9;
        filter.frequency.setValueAtTime(900, now);
        filter.frequency.exponentialRampToValueAtTime(140, now + 3);
        envelope.gain.setValueAtTime(0.0001, now);
        // Peak kept moderate so the master compressor doesn't duck the music
        // and then "pump" it back in little bursts after the thunder
        envelope.gain.exponentialRampToValueAtTime(0.24, now + 0.15);
        envelope.gain.exponentialRampToValueAtTime(0.1, now + 0.6);
        envelope.gain.exponentialRampToValueAtTime(0.17, now + 0.95); // second roll
        envelope.gain.exponentialRampToValueAtTime(0.07, now + 1.5);
        envelope.gain.exponentialRampToValueAtTime(0.1, now + 1.85); // last, softer roll
        envelope.gain.exponentialRampToValueAtTime(0.0001, now + 3.4); // one long smooth fade
        const t = now + 3.4;
        source.connect(filter);
        filter.connect(envelope);
        envelope.connect(sfx);
        source.start(now);
        source.stop(t + 0.65);
      } else if (effect === "milestone") {
        scheduleTone(context, sfx, now, 0.12, 784, 784, 0.04, "triangle");
        scheduleTone(context, sfx, now + 0.09, 0.16, 1046.5, 1046.5, 0.045, "triangle");
      } else {
        scheduleTone(context, sfx, now, 0.08, 540, 760, 0.04, "triangle");
        scheduleTone(context, sfx, now + 0.03, 0.08, 760, 940, 0.022, "sine");
      }
    },
    [ensureAudio],
  );

  const scheduleMusic = useCallback(() => {
    if (!soundEnabledRef.current || modeRef.current !== "running") return;
    const bus = ensureAudio();
    if (!bus) return;
    const stepLength = 60 / (HALLOWEEN ? SPOOKY_BPM : 136) / 4;
    if (musicNextTimeRef.current < bus.context.currentTime - stepLength) {
      musicNextTimeRef.current = bus.context.currentTime + 0.05;
    }
    while (musicNextTimeRef.current < bus.context.currentTime + 0.24) {
      scheduleMusicStep(
        bus,
        musicStepRef.current,
        musicNextTimeRef.current,
        stepLength,
      );
      musicStepRef.current = (musicStepRef.current + 1) % 32;
      musicNextTimeRef.current += stepLength;
    }
  }, [ensureAudio]);

  const startMusic = useCallback(() => {
    if (!soundEnabledRef.current || musicTimerRef.current !== null) return;
    const bus = ensureAudio();
    if (!bus) return;
    const now = bus.context.currentTime;
    bus.music.gain.cancelScheduledValues(now);
    bus.music.gain.setValueAtTime(Math.max(0.0001, bus.music.gain.value), now);
    bus.music.gain.exponentialRampToValueAtTime(0.5, now + 0.18);
    musicNextTimeRef.current = now + 0.05;
    scheduleMusic();
    musicTimerRef.current = window.setInterval(scheduleMusic, 80);
  }, [ensureAudio, scheduleMusic]);

  const stopMusic = useCallback(() => {
    if (musicTimerRef.current !== null) {
      window.clearInterval(musicTimerRef.current);
      musicTimerRef.current = null;
    }
    const bus = audioBusRef.current;
    if (!bus) return;
    const now = bus.context.currentTime;
    bus.music.gain.cancelScheduledValues(now);
    bus.music.gain.setValueAtTime(Math.max(0.0001, bus.music.gain.value), now);
    bus.music.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  }, []);

  const startGame = useCallback(() => {
    const next = freshGame();
    gameRef.current = next;
    keysRef.current = { left: false, right: false, down: false };
    void startRun();
    setSaveError("");
    setLastSavedEntryId(null);
    setPlayerRank(null);
    changeGameOverView("entry");
    setHud({ score: 0, pizzas: 0, lives: 3, distance: 0 });
    changeMode("running");
    playSound("start");
  }, [changeGameOverView, changeMode, playSound]);

  const saveScore = useCallback(async () => {
    if (modeRef.current !== "gameover" || gameOverViewRef.current !== "entry") return;
    const name = normalizePlayerName(playerName);
    const email = playerEmail.trim();
    const phone = playerPhone.trim();
    if (!name) {
      setSaveError("Please enter your name");
      nameInputRef.current?.focus();
      return;
    }
    if (isBlockedName(name)) {
      setSaveError("Please choose a different name");
      nameInputRef.current?.focus();
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setSaveError("Please enter a valid email");
      return;
    }
    if (!/^\+?[0-9 ()-]{6,20}$/.test(phone)) {
      setSaveError("Please enter a valid phone number");
      return;
    }
    if (!playerConsent) {
      setSaveError("Please tick the box to agree to be contacted");
      return;
    }
    const game = gameRef.current;
    setSaving(true);
    setSaveError("");
    try {
      const saved = await addScore({
        name,
        email,
        phone,
        consent: true,
        score: Math.floor(game.score),
        switches: game.pizzasCollected,
        distance: Math.floor(game.distance),
      });
      setLastSavedEntryId(saved.id);
      setPlayerRank(saved.rank || null);
      changeGameOverView("leaderboard");
    } catch (error) {
      setSaveError(error instanceof SubmitError ? error.message : "Couldn't save your score. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [changeGameOverView, playerConsent, playerEmail, playerName, playerPhone]);

  const jump = useCallback(() => {
    if (modeRef.current !== "running") return;
    if (HALLOWEEN && gameRef.current.broomLift > 0) return;
    const player = gameRef.current.player;
    if (player.grounded) {
      if (player.sliding) {
        player.sliding = false;
        player.height = 116;
        player.y = GROUND_Y - player.height;
      }
      player.velocityY = -1030;
      player.grounded = false;
      const from = gameRef.current.platforms.find((p) => p.id === gameRef.current.onPlatform);
      gameRef.current.jumpedFromRoof = from && from.kind === "roof" ? from.id : null;
      gameRef.current.onPlatform = null; // jumping off a rail or rooftop
      playSound("jump");
    }
  }, [playSound]);

  const togglePause = useCallback(() => {
    if (modeRef.current === "running") changeMode("paused");
    else if (modeRef.current === "paused") changeMode("running");
  }, [changeMode]);

  const toggleSound = useCallback(() => {
    const next = !soundEnabledRef.current;
    soundEnabledRef.current = next;
    setSoundEnabled(next);
    if (next) playSound("toggle");
    else stopMusic();
  }, [playSound, stopMusic]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) await stageRef.current?.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      // Fullscreen can be blocked by embedded browsers.
    }
  }, []);

  const setControl = useCallback(
    (control: "left" | "right" | "down", pressed: boolean) => {
      keysRef.current[control] = pressed;
    },
    [],
  );

  const holdControl = (
    control: "left" | "right" | "down",
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    setControl(control, true);
    try {
      // Keep receiving this finger's "up" even if it slides off the button
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture can fail for synthetic or already-ended pointers; the button still works
    }
  };

  // Load the board once for the BEST score, then keep it fresh only while the
  // game-over screens are showing (no server requests during a run).
  const onLeaderboard = useCallback((entries: LeaderboardEntry[]) => {
    setLeaderboard(entries);
    setLeaderboardError("");
    const topScore = entries[0]?.score ?? 0;
    highScoreRef.current = topScore;
    setHighScore(topScore);
  }, []);
  useEffect(
    () => subscribeLeaderboard(onLeaderboard, (message) => setLeaderboardError(message), { poll: false }),
    [onLeaderboard],
  );
  useEffect(() => {
    if (mode !== "gameover") return;
    return subscribeLeaderboard(onLeaderboard, (message) => setLeaderboardError(message), { poll: true });
  }, [mode, onLeaderboard]);

  useEffect(() => {
    if (mode !== "gameover" || gameOverView !== "entry") return;
    // Inside an auto-height iframe on a phone, the host page scrolls the score
    // entry into view, so focusing must not jump the page on its own.
    const framed = document.documentElement.classList.contains("framed");
    const frame = window.requestAnimationFrame(() => {
      nameInputRef.current?.focus({ preventScroll: framed });
      if (framed && window.innerWidth <= 680) window.dispatchEvent(new Event("keychron-dash:show-stage"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [gameOverView, mode]);

  useEffect(() => {
    if (mode === "running" && soundEnabled) startMusic();
    else stopMusic();
  }, [mode, soundEnabled, startMusic, stopMusic]);

  useEffect(
    () => () => {
      if (musicTimerRef.current !== null) {
        window.clearInterval(musicTimerRef.current);
      }
      const audio = audioBusRef.current?.context;
      if (audio && audio.state !== "closed") void audio.close();
    },
    [],
  );

  useEffect(() => {
    let lastRestartKeyAt = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;

      const isMovementKey =
        isLeftKey(event) || isRightKey(event) || isUpKey(event) || isDownKey(event);
      if (isMovementKey || event.code === "Enter" || event.code === "Space") {
        event.preventDefault();
      }

      if (
        event.code === "Enter" &&
        !event.repeat &&
        (
          modeRef.current === "ready" ||
          (modeRef.current === "gameover" && gameOverViewRef.current === "leaderboard")
        )
      ) {
        startGame();
      }
      if (((!HALLOWEEN && event.code === "Space") || isUpKey(event)) && !event.repeat) jump();
      if (isLeftKey(event)) keysRef.current.left = true;
      if (isRightKey(event)) keysRef.current.right = true;
      if (isDownKey(event)) keysRef.current.down = true;
      if (event.code === "KeyP" && !event.repeat) togglePause();
      if (HALLOWEEN && isActionKey(event) && !event.repeat && modeRef.current === "running") {
        gameRef.current.actionQueued = true;
      }
      // Restart needs R pressed twice quickly: players type K-E-Y-C-H-R-O-N on
      // the keyboard while playing, and a single R used to wipe their run.
      if (
        event.code === "KeyR" &&
        !event.repeat &&
        (modeRef.current === "running" || modeRef.current === "paused")
      ) {
        const now = performance.now();
        if (now - lastRestartKeyAt < RESTART_DOUBLE_PRESS_MS) {
          lastRestartKeyAt = 0;
          startGame();
        } else {
          lastRestartKeyAt = now;
        }
      }
      if (event.code === "KeyF" && !event.repeat) void toggleFullscreen();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (isLeftKey(event)) keysRef.current.left = false;
      if (isRightKey(event)) keysRef.current.right = false;
      if (isDownKey(event)) keysRef.current.down = false;
    };
    const onVisibility = () => {
      if (document.hidden && modeRef.current === "running") {
        changeMode("paused");
      }
      keysRef.current = { left: false, right: false, down: false };
    };
    const onBlur = () => {
      keysRef.current = { left: false, right: false, down: false };
    };
    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [changeMode, jump, startGame, toggleFullscreen, togglePause]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const loadImage = (src: string) => {
      const image = new window.Image();
      image.decoding = "async";
      image.src = src;
      return image;
    };
    const images: GameImages = {
      pax: loadImage(paxLogoUrl),
      paxFlags: loadImage(paxFlagsLogoUrl),
      keychron: loadImage(keychronLogoUrl),
    };
    ctx.imageSmoothingEnabled = false;
    let frameId = 0;
    let previous = gameClock();
    // FPS meter for checking the booth computer: open the link with #fps,
    // or press the ` key (left of 1) to toggle it.
    let showFps = window.location.hash === "#fps";
    let fpsFrames = 0;
    let fpsWorst = 0;
    let fpsWindowStart = previous;
    let fpsLabel = "";
    const onFpsKey = (event: KeyboardEvent) => {
      if (event.code === "Backquote" && !event.repeat) showFps = !showFps;
    };
    window.addEventListener("keydown", onFpsKey);

    const addParticles = (x: number, y: number, color: string, count: number) => {
      const game = gameRef.current;
      for (let index = 0; index < count; index += 1) {
        game.particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 260,
          vy: -80 - Math.random() * 220,
          life: 0.45 + Math.random() * 0.42,
          maxLife: 0.9,
          size: 5 + Math.random() * 8,
          color,
        });
      }
    };

    const finishGame = () => {
      const game = gameRef.current;
      game.shake = 3;
      const finalScore = Math.floor(game.score);
      setSaveError("");
      setLastSavedEntryId(null);
      changeGameOverView("entry");
      setHud({
        score: finalScore,
        pizzas: game.pizzasCollected,
        lives: 0,
        distance: Math.floor(game.distance),
      });
      changeMode("gameover");
      playSound("gameover");
    };

    const spawnObstacle = (game: GameState) => {
      const available = OBSTACLE_TABLE.filter((entry) => game.distance >= entry.from);
      // Haunted stretch: ghosts (drone) and bats come out more often. Same spawn rate overall.
      const weightOf = (entry: (typeof OBSTACLE_TABLE)[number]) => {
        if (HALLOWEEN && game.platforms.length > 0 && OVERHEAD_KINDS.has(entry.kind)) return 0;
        return HALLOWEEN && game.haunted > 0 && (entry.kind === "drone" || entry.kind === "bats") ? entry.weight * 2.5 : entry.weight;
      };
      let roll = Math.random() * available.reduce((sum, entry) => sum + weightOf(entry), 0);
      let kind: ObstacleKind = available[0].kind;
      for (const entry of available) {
        roll -= weightOf(entry);
        if (roll < 0) {
          kind = entry.kind;
          break;
        }
      }
      const specs: Record<ObstacleKind, { w: number; h: number; y: number }> = {
        cone: { w: 58, h: 66, y: GROUND_Y - 64 },
        barrier: { w: 106, h: 80, y: GROUND_Y - 78 },
        puddle: { w: 122, h: 25, y: GROUND_Y - 16 },
        sign: { w: 118, h: 51, y: GROUND_Y - 151 },
        plane: { w: 148, h: 58, y: GROUND_Y - 174 },
        boxes: { w: 78, h: 104, y: GROUND_Y - 102 },
        // Hangs from the top of the screen down to GROUND_Y - 92: a standing or
        // jumping rider hits it, only sliding gets under.
        banner: { w: 170, h: GROUND_Y - 92, y: 0 },
        drone: { w: 92, h: 36, y: GROUND_Y - 128 },
        // Hitbox sized so the jump window at the start speed (6.6) matches the
        // box stack (~0.26 s); it is drawn 25% bigger, close to the plane's size.
        truck: { w: 110, h: 74, y: GROUND_Y - 74 },
        // Halloween: same hitboxes as the cone (jump) and the drone (slide)
        hand: { w: 58, h: 66, y: GROUND_Y - 64 },
        bats: { w: 92, h: 36, y: GROUND_Y - 128 },
        bomb: { w: BOMB_SIZE, h: BOMB_SIZE, y: GROUND_Y - BOMB_SIZE }, // only dropped by the boss
        spider: { w: SPIDER_W, h: SPIDER_H, y: GROUND_Y - SPIDER_H }, // only from a torn cobweb
      };
      const spec = specs[kind];
      const spawnX = WORLD_WIDTH + 50;
      const minClearPx = game.speed * 58 * MIN_CLEAR_SECONDS;
      const tooClose = game.obstacles.some(
        (obstacle) => spawnX - (obstacle.x + obstacle.width) < minClearPx,
      );

      if (tooClose) return false;

      game.obstacles.push({
        id: game.nextId++,
        kind,
        x: spawnX,
        y: spec.y,
        width: spec.w,
        height: spec.h,
        hit: false,
        grazed: false,
      });
      return true;
    };

    const spawnPowerUp = (game: GameState) => {
      const choices = (["broom", "shield", "magnet", "ghost"] as PowerUpKind[]).filter(
        (kind) => kind !== game.activePower?.kind && !(kind === "shield" && game.pumpkinShield > 0),
      );
      const kind = choices[Math.floor(Math.random() * choices.length)];
      game.powerUps.push({
        id: game.nextId++,
        kind,
        x: WORLD_WIDTH + 60,
        y: Math.random() > 0.5 ? GROUND_Y - 205 : GROUND_Y - 100,
        size: 52,
        phase: Math.random() * Math.PI * 2,
        collected: false,
      });
    };

    const spawnKeycap = (game: GameState) => {
      const remainingLetters = KEYCHRON_LETTERS.filter(
        (letter) => !game.collectedLetters.has(letter),
      );
      const pool = remainingLetters.length > 0 ? remainingLetters : KEYCHRON_LETTERS;
      const letter = pool[Math.floor(Math.random() * pool.length)];
      const high = Math.random() > 0.5;
      game.keycaps.push({
        id: game.nextId++,
        x: WORLD_WIDTH + 60,
        y: high ? GROUND_Y - 210 : GROUND_Y - 90,
        size: 46,
        collected: false,
        phase: Math.random() * Math.PI * 2,
        letter,
      });
    };

    const spawnBigPizza = (game: GameState) => {
      const tier = Math.min(game.keychronCompletions, 5);
      const size = 92 + (tier - 1) * 10;
      game.bigPizzaBonus = 1000 + (tier - 1) * 400;
      game.bigPizza = {
        id: game.nextId++,
        x: WORLD_WIDTH + 80,
        y: GROUND_Y - 150 - (tier - 1) * 6,
        size,
        collected: false,
        phase: Math.random() * Math.PI * 2,
        color: "#f5b21f",
      };
    };

    const spawnPizzaPattern = (game: GameState) => {
      const pattern = Math.random();
      const count = pattern > 0.72 ? 4 : pattern > 0.28 ? 2 : 1;
      const high = pattern > 0.42;
      for (let index = 0; index < count; index += 1) {
        const arc = count > 2 ? Math.sin((index / (count - 1)) * Math.PI) * 70 : 0;
        game.pizzas.push({
          id: game.nextId++,
          x: WORLD_WIDTH + 60 + index * 76,
          y: high ? GROUND_Y - 184 - arc : GROUND_Y - 76 - arc * 0.35,
          size: 48,
          collected: false,
          phase: Math.random() * Math.PI * 2,
          color: SWITCH_COLORS[Math.floor(Math.random() * SWITCH_COLORS.length)],
        });
      }
    };

    const update = (dt: number, now: number) => {
      const game = gameRef.current;
      const player = game.player;
      game.elapsed += dt;
      game.speed = Math.min(MAX_SPEED, START_SPEED + game.distance / SPEED_GAIN_METRES);
      const worldMove = game.speed * 58 * dt;
      game.scroll += worldMove;
      game.distance += game.speed * dt * 1.25;
      // Halloween haunted stretch doubles every point earned while it lasts
      const mult = HALLOWEEN && game.haunted > 0 ? HAUNTED_POINTS_MULTIPLIER : 1;
      game.score += game.speed * dt * 4 * mult;
      // Halloween missions: count progress (paused while "MISSION COMPLETE" shows)
      const missionEvent = (kind: MissionKind, amount = 1) => {
        if (!HALLOWEEN || game.missionFlash > 0 || game.mission.kind !== kind) return;
        game.mission.progress = kind === "combo" ? Math.max(game.mission.progress, amount) : game.mission.progress + amount;
      };

      const rawSteer = Number(keysRef.current.right) - Number(keysRef.current.left);
      const mirrored = HALLOWEEN && game.curse?.kind === "mirror";
      const steer = mirrored ? -rawSteer : rawSteer;
      const onRailNow =
        HALLOWEEN && game.onPlatform !== null && game.platforms.some((p) => p.id === game.onPlatform && p.kind === "rail");
      const horizontal = onRailNow ? 0 : steer * 330 * dt; // on a rail, ← → balance instead
      player.x = clamp(player.x + horizontal, 92, 420);

      const wantsSlide = keysRef.current.down && player.grounded && !(HALLOWEEN && game.onPlatform !== null);
      if (wantsSlide && !player.sliding) {
        player.sliding = true;
        player.height = 74;
        player.y = GROUND_Y - player.height;
      } else if (!wantsSlide && player.sliding) {
        player.sliding = false;
        player.height = 116;
        player.y = GROUND_Y - player.height;
      }

      // Board span used for landing on rails and rooftops
      const feetLeft = player.x + 30;
      const feetRight = player.x + 122;
      if (!player.grounded) {
        const feetBefore = player.y + player.height;
        player.velocityY += 2450 * dt;
        if (keysRef.current.down) player.velocityY += 1350 * dt;
        player.y += player.velocityY * dt;
        const feetAfter = player.y + player.height;
        const landOn =
          HALLOWEEN && player.velocityY > 0
            ? game.platforms.find(
                (p) => feetRight > p.x && feetLeft < p.x + p.width && feetBefore <= p.top + 2 && feetAfter >= p.top,
              )
            : undefined;
        if (landOn) {
          player.y = landOn.top - player.height;
          player.velocityY = 0;
          player.grounded = true;
          game.onPlatform = landOn.id;
          if (landOn.kind === "rail") {
            game.grindBalance = (Math.random() - 0.5) * 0.3;
            game.grindDrift = (Math.random() - 0.5) * 0.8;
            game.grindLevel = 1;
            game.grindSteady = 0;
          }
          if (landOn.kind === "roof" && game.jumpedFromRoof !== null && game.jumpedFromRoof !== landOn.id) {
            // Cleared the gap between two roofs
            const name = TRICK_NAMES[skateTrick.trick] ?? "OLLIE";
            const points = GAP_POINTS * mult;
            game.score += points;
            game.scorePopups.push({ x: player.x + 75, y: player.y - 20, text: `${name} GAP! +${points}`, timer: 1.2, duration: 1.2, color: "#ffd84e" });
            addParticles(player.x + 75, landOn.top, "#ffd84e", 14);
            playSound("treat");
          }
          game.jumpedFromRoof = null;
          if (landOn.kind === "roof") missionEvent("roof");
          addParticles(player.x + 65, landOn.top, landOn.kind === "rail" ? "#ffd84e" : "#d9c2a6", 6);
        } else if (player.y >= GROUND_Y - player.height) {
          game.onPlatform = null;
          game.jumpedFromRoof = null;
          player.y = GROUND_Y - player.height;
          player.velocityY = 0;
          player.grounded = true;
          addParticles(player.x + 65, GROUND_Y, "#d9eef2", 5);
        }
      } else if (HALLOWEEN && game.onPlatform !== null) {
        const standingOn = game.platforms.find((p) => p.id === game.onPlatform);
        if (!standingOn || feetRight < standingOn.x || feetLeft > standingOn.x + standingOn.width) {
          // Rolled off the end: fall
          player.grounded = false;
          player.velocityY = 0;
          game.onPlatform = null;
        } else {
          player.y = standingOn.top - player.height;
        }
      }

      if (HALLOWEEN) {
        // Broom: ease up to flying height, hold, then ease back down to the road
        const flying = game.activePower?.kind === "broom";
        const liftBefore = game.broomLift;
        game.broomLift = clamp(game.broomLift + (flying ? dt : -dt) / 0.35, 0, 1);
        if (liftBefore > 0 && game.broomLift === 0) player.y = GROUND_Y - player.height; // touch down exactly
        if (game.broomLift > 0) {
          game.onPlatform = null;
          const eased = game.broomLift * game.broomLift * (3 - 2 * game.broomLift);
          player.sliding = false;
          player.height = 116;
          player.velocityY = 0;
          player.grounded = true;
          player.y = GROUND_Y - player.height - BROOM_HEIGHT * eased;
        }
        if (game.activePower) {
          game.activePower.timer -= dt;
          if (game.activePower.timer <= 0) game.activePower = null;
        }
        game.pumpkinShield = Math.max(0, game.pumpkinShield - dt);
        const wasHaunted = game.haunted > 0;
        game.haunted = Math.max(0, game.haunted - dt);
        if (wasHaunted && game.haunted === 0 && !game.boss) {
          game.boss = {
            kind: "pumpkin", maxHp: MINI_BOSS_HP, fightSeconds: MINI_BOSS_FIGHT_SECONDS,
            phase: "enter", timer: 1.5, hp: MINI_BOSS_HP, x: WORLD_WIDTH + 80, y: 200, bombTimer: 1.8, hurt: 0, defeated: false,
          };
          game.milestoneFlash = 1.6;
          game.milestoneLabel = "PUMPKIN GHOST!";
          playSound("boss");
        }
        game.lightningAge += dt;
        if (game.haunted > 0) {
          game.nextLightning -= dt;
          if (game.nextLightning <= 0) {
            // Strike somewhere across the sky, with thunder
            game.lightningAge = 0;
            game.lightningX = 160 + Math.random() * (WORLD_WIDTH - 320);
            game.lightningSeed = 1 + Math.floor(Math.random() * 2147483000);
            playSound("thunder");
            game.nextLightning = 2.2 + Math.random() * 1.2;
          }
        }
        game.throwCooldown = Math.max(0, game.throwCooldown - dt);
        if (game.curse) {
          game.curse.timer -= dt;
          if (game.curse.timer <= 0) game.curse = null;
        }
        if (game.doorResult) {
          game.doorResult.timer -= dt;
          if (game.doorResult.timer <= 0) game.doorResult = null;
        }
        if (player.grounded && game.broomLift === 0) game.stompChain = 0;
        // Grinding a rail: points every second, sparks at the board
        const onRail = game.onPlatform !== null && game.platforms.some((p) => p.id === game.onPlatform && p.kind === "rail");
        if (onRail) {
          // Balance: the needle drifts and tips away from the centre; ← → push it back
          game.grindDrift = clamp(game.grindDrift + (Math.random() - 0.5) * 6 * dt, -1.2, 1.2);
          game.grindBalance += (game.grindDrift * 0.9 + game.grindBalance * 1.1) * dt + steer * 2.4 * dt;
          if (Math.abs(game.grindBalance) >= 1) {
            // Lost balance: hop off the rail (no life lost, points so far are kept)
            game.onPlatform = null;
            player.grounded = false;
            player.velocityY = -380;
            game.grindBalance = 0;
            game.scorePopups.push({ x: player.x + 75, y: player.y - 30, text: "BAILED!", timer: 0.9, duration: 0.9, color: "#ff6b8a" });
            playSound("miss");
          } else {
            if (Math.abs(game.grindBalance) < 0.35) {
              game.grindSteady += dt;
              if (game.grindSteady >= GRIND_LEVEL_UP_SECONDS && game.grindLevel < 3) {
                game.grindLevel += 1;
                game.grindSteady = 0;
                game.scorePopups.push({ x: player.x + 75, y: player.y - 50, text: `GRIND x${game.grindLevel}!`, timer: 0.9, duration: 0.9, color: "#ffd84e" });
              }
            } else {
              game.grindSteady = Math.max(0, game.grindSteady - dt);
            }
            const points = GRIND_POINTS_PER_SECOND * game.grindLevel * dt * mult;
            game.score += points;
            game.grindPoints += points;
            missionEvent("grind", dt);
            // Sparks stream off the back of the board, and a scraping sound
            for (let k = 0; k < 2; k += 1) addParticles(player.x + 20 + Math.random() * 30, player.y + player.height, k ? "#ffd84e" : "#ffffff", 1);
            game.grindSoundTimer -= dt;
            if (game.grindSoundTimer <= 0) {
              playSound("grind");
              game.grindSoundTimer = HALLOWEEN ? 0.3 : 0.16;
            }
          }
        } else if (game.grindPoints > 0) {
          game.scorePopups.push({ x: player.x + 75, y: player.y - 10, text: `GRIND +${Math.round(game.grindPoints)}`, timer: 1, duration: 1, color: "#ffd84e" });
          game.grindPoints = 0;
        }
        // Missions: complete -> reward, then a new, slightly harder one
        if (game.missionFlash > 0) {
          game.missionFlash -= dt;
          if (game.missionFlash <= 0) game.mission = makeMission(game.mission.level + 1, game.mission.kind);
        } else if (game.mission.progress >= game.mission.target) {
          const reward = (MISSION_POINTS_BASE + MISSION_POINTS_PER_LEVEL * game.mission.level) * mult;
          game.score += reward;
          game.candyAmmo = Math.min(MAX_AMMO, game.candyAmmo + MISSION_AMMO);
          game.missionFlash = 1.8;
          // Below the combo / haunted / boss banners so they never overlap
          game.scorePopups.push({ x: WORLD_WIDTH / 2, y: 236, text: `MISSION COMPLETE! +${reward} · +${MISSION_AMMO} CANDY`, timer: 1.6, duration: 1.6, color: "#7ee04a" });
          playSound("keychron");
        }
        // Smashed obstacles fade out; witch bombs fall until they hit the road
        for (const obstacle of game.obstacles) {
          if (obstacle.smashed !== undefined) obstacle.smashed += dt;
          if (obstacle.vy !== undefined && obstacle.y + obstacle.height < GROUND_Y) {
            obstacle.vy += 1300 * dt;
            obstacle.y = Math.min(GROUND_Y - obstacle.height, obstacle.y + obstacle.vy * dt);
          }
        }
        // Witch boss
        const boss = game.boss;
        if (boss) {
          boss.hurt = Math.max(0, boss.hurt - dt);
          boss.timer -= dt;
          if (boss.phase === "enter") {
            // Stays below the score and lives panels
            boss.x += (880 - boss.x) * Math.min(1, dt * 3);
            boss.y = 200 + Math.sin(game.elapsed * 2) * 14;
            if (boss.timer <= 0) {
              boss.phase = "fight";
              boss.timer = boss.fightSeconds;
            }
          } else if (boss.phase === "fight") {
            boss.x = 870 + Math.sin(game.elapsed * 0.9) * 60;
            boss.y = 200 + Math.sin(game.elapsed * 2.1) * 22;
            boss.bombTimer -= dt;
            if (boss.bombTimer <= 0) {
              game.obstacles.push({
                id: game.nextId++,
                kind: "bomb",
                x: boss.x + 20,
                y: boss.y + BOSS_H - 20,
                width: BOMB_SIZE,
                height: BOMB_SIZE,
                hit: false,
                grazed: false,
                vy: 60,
              });
              boss.bombTimer = boss.kind === "pumpkin" ? 1.9 + Math.random() * 0.8 : 1.4 + Math.random() * 0.7;
            }
            if (boss.timer <= 0) {
              boss.phase = "leave";
              boss.timer = 1.6;
              const survive = (boss.kind === "pumpkin" ? MINI_BOSS_SURVIVE_POINTS : BOSS_SURVIVE_POINTS) * mult;
              game.score += survive;
              game.scorePopups.push({ x: WORLD_WIDTH / 2, y: 250, text: `SURVIVED! +${survive}`, timer: 1.4, duration: 1.4, color: "#7ee04a" });
            }
          } else {
            boss.x += 560 * dt;
            boss.y -= 170 * dt;
            if (boss.timer <= 0) game.boss = null;
          }
        }
      }

      player.invincible = Math.max(0, player.invincible - dt);
      player.shield = Math.max(0, player.shield - dt);
      game.comboTimer = Math.max(0, game.comboTimer - dt);
      if (game.comboTimer === 0) game.combo = 0;
      game.shake = Math.max(0, game.shake - dt);
      game.keychronCelebration = Math.max(0, game.keychronCelebration - dt);
      game.bigPizzaMissed = Math.max(0, game.bigPizzaMissed - dt);
      game.grazeSoundCooldown = Math.max(0, game.grazeSoundCooldown - dt);
      game.milestoneFlash = Math.max(0, game.milestoneFlash - dt);
      game.letterFlashTimer = Math.max(0, game.letterFlashTimer - dt);
      if (game.letterFlyEffects.length > 0) {
        for (let i = game.letterFlyEffects.length - 1; i >= 0; i -= 1) {
          game.letterFlyEffects[i].timer -= dt;
          if (game.letterFlyEffects[i].timer <= 0) {
            game.letterFlyEffects.splice(i, 1);
          }
        }
      }
      if (game.scorePopups.length > 0) {
        for (let i = game.scorePopups.length - 1; i >= 0; i -= 1) {
          const popup = game.scorePopups[i];
          popup.timer -= dt;
          popup.y -= 42 * dt;
          if (popup.timer <= 0) {
            game.scorePopups.splice(i, 1);
          }
        }
      }

      const milestoneStep = 500;
      const currentMilestone = Math.floor(game.distance / milestoneStep) * milestoneStep;
      if (currentMilestone > game.lastMilestone) {
        game.lastMilestone = currentMilestone;
        game.milestoneFlash = 1.6;
        game.milestoneLabel = `${currentMilestone}M!`;
        addParticles(player.x + player.width / 2, player.y - 20, "#ffd84e", 14);
        if (HALLOWEEN && currentMilestone % BOSS_EVERY_METRES === 0) {
          game.boss = {
            kind: "witch", maxHp: BOSS_HP, fightSeconds: BOSS_FIGHT_SECONDS,
            phase: "enter", timer: 1.5, hp: BOSS_HP, x: WORLD_WIDTH + 80, y: 200, bombTimer: 1.4, hurt: 0, defeated: false,
          };
          game.milestoneLabel = `${currentMilestone}M · WITCH ATTACK!`;
          playSound("boss");
        } else if (HALLOWEEN && currentMilestone % HAUNTED_EVERY_METRES === 0) {
          game.haunted = HAUNTED_SECONDS;
          game.nextLightning = 0.6;
          game.milestoneLabel = `${currentMilestone}M · HAUNTED!`;
          playSound("haunted");
        } else {
          playSound("milestone");
        }
      }

      game.obstacleTimer -= dt;
      if (game.obstacleTimer <= 0 && !(HALLOWEEN && game.boss)) {
        if (spawnObstacle(game)) {
          const difficulty = clamp(game.distance / OBSTACLE_RAMP_METRES, 0, OBSTACLE_GAP_MIN_CUT);
          game.obstacleTimer = OBSTACLE_GAP_BASE - difficulty + Math.random() * OBSTACLE_GAP_RANDOM;
        } else {
          game.obstacleTimer = 0.22;
        }
      }
      game.pizzaTimer -= dt;
      if (game.pizzaTimer <= 0) {
        spawnPizzaPattern(game);
        game.pizzaTimer = 1.1 + Math.random() * 1.4;
      }
      game.keycapTimer -= dt;
      if (game.keycapTimer <= 0) {
        spawnKeycap(game);
        game.keycapTimer = 7 + Math.random() * 5;
      }
      if (HALLOWEEN) {
        game.powerUpTimer -= dt;
        if (game.powerUpTimer <= 0) {
          spawnPowerUp(game);
          game.powerUpTimer = POWER_UP_GAP_MIN + Math.random() * POWER_UP_GAP_RANDOM;
        }
        game.powerUps.forEach((item) => {
          item.x -= worldMove;
        });
        game.doorTimer -= dt;
        if (game.doorTimer <= 0 && !game.boss) {
          game.doors.push({ id: game.nextId++, x: WORLD_WIDTH + 40, knocked: false, result: null, resultTimer: 0, treat: false });
          game.doorTimer = DOOR_GAP_MIN + Math.random() * DOOR_GAP_RANDOM;
        }
        game.doors.forEach((door) => {
          door.x -= worldMove;
        });
        // Rails and rooftop routes
        game.platformTimer -= dt;
        if (game.platformTimer <= 0 && !game.boss && game.platforms.length === 0) {
          if (Math.random() < 0.55) {
            // Long enough for a 1.5-2 s grind at the starting speed
            game.platforms.push({ id: game.nextId++, kind: "rail", x: WORLD_WIDTH + 60, width: 700 + Math.random() * 300, top: RAIL_TOP });
          } else {
            let cursor = WORLD_WIDTH + 60;
            const roofs = Math.random() < 0.5 ? 2 : 3;
            for (let k = 0; k < roofs; k += 1) {
              const width = 420 + Math.random() * 140;
              game.platforms.push({ id: game.nextId++, kind: "roof", x: cursor, width, top: ROOF_TOP });
              // Candy up on the high route
              for (let c = 0; c < 5; c += 1) {
                game.pizzas.push({
                  id: game.nextId++,
                  x: cursor + 40 + (c * (width - 120)) / 4,
                  y: ROOF_TOP - 80 - Math.sin((c / 4) * Math.PI) * 26,
                  size: 48,
                  collected: false,
                  phase: Math.random() * Math.PI * 2,
                  color: SWITCH_COLORS[c % SWITCH_COLORS.length],
                });
              }
              cursor += width + 150 + Math.random() * 50; // gap to jump
            }
          }
          game.platformTimer = PLATFORM_GAP_MIN + Math.random() * PLATFORM_GAP_RANDOM;
        }
        game.platforms.forEach((platform) => {
          platform.x -= worldMove;
        });
        game.platforms = game.platforms.filter((platform) => platform.x + platform.width > -60);
        game.doors = game.doors.filter((door) => door.x + DOOR_W > -120);
        const nowAtDoor = game.doors.some(
          (d) => !d.knocked && d.x < player.x + 130 && d.x + DOOR_W > player.x + 20,
        );
        if (nowAtDoor !== atDoorRef.current) {
          atDoorRef.current = nowAtDoor;
          setAtDoor(nowAtDoor);
        }
      }

      game.obstacles.forEach((obstacle) => {
        obstacle.x -= worldMove;
      });
      game.pizzas.forEach((pizza) => {
        pizza.x -= worldMove;
      });
      game.keycaps.forEach((keycap) => {
        keycap.x -= worldMove;
      });
      if (game.bigPizza) {
        game.bigPizza.x -= worldMove;
      }

      const playerBox = getPlayerHitbox(player);
      // Flying on the broom or in ghost mode, obstacles can't touch the rider
      const passThrough = HALLOWEEN && (game.broomLift > 0 || game.activePower?.kind === "ghost");
      for (const obstacle of game.obstacles) {
        if (passThrough) {
          if (game.activePower?.kind === "ghost" && !obstacle.grazed && !obstacle.hit && overlaps(playerBox, obstacle)) {
            obstacle.grazed = true;
            game.score += GHOST_PASS_POINTS * mult;
            game.scorePopups.push({
              x: obstacle.x + obstacle.width / 2,
              y: obstacle.y,
              text: `BOO! +${GHOST_PASS_POINTS * mult}`,
              timer: 0.8,
              duration: 0.8,
              color: "#b8f0ff",
            });
          }
          continue;
        }
        if (
          HALLOWEEN &&
          STOMPABLE.has(obstacle.kind) &&
          obstacle.smashed === undefined &&
          !obstacle.hit &&
          !player.grounded &&
          player.velocityY > 0 &&
          overlaps(playerBox, obstacle) &&
          playerBox.y + playerBox.height - obstacle.y < 34
        ) {
          // Landed on top: smash it and bounce. Chains until you touch the road.
          obstacle.hit = true;
          obstacle.smashed = 0;
          game.stompChain += 1;
          missionEvent("smash");
          const points = STOMP_POINTS * game.stompChain * mult;
          game.score += points;
          player.velocityY = STOMP_BOUNCE;
          addParticles(obstacle.x + obstacle.width / 2, obstacle.y, "#ff7a1a", 14);
          game.scorePopups.push({
            x: obstacle.x + obstacle.width / 2,
            y: obstacle.y - 10,
            text: game.stompChain > 1 ? `STOMP x${game.stompChain}! +${points}` : `STOMP! +${points}`,
            timer: 0.9,
            duration: 0.9,
            color: "#ff7a1a",
          });
          playSound("stomp");
          continue;
        }
        if (!obstacle.hit && player.invincible <= 0 && player.shield <= 0 && overlaps(playerBox, obstacle)) {
          if (HALLOWEEN && game.pumpkinShield > 0) {
            // The pumpkin shield takes the hit instead of a life
            obstacle.hit = true;
            game.pumpkinShield = 0;
            player.invincible = 1;
            game.shake = 0.2;
            addParticles(player.x + player.width / 2, player.y + player.height / 2, "#ff7a1a", 18);
            game.scorePopups.push({
              x: player.x + player.width / 2,
              y: player.y - 10,
              text: "SHIELD!",
              timer: 0.9,
              duration: 0.9,
              color: "#ff7a1a",
            });
            playSound("shieldbreak");
            continue;
          }
          obstacle.hit = true;
          player.invincible = HIT_INVINCIBLE_SECONDS;
          game.lives -= 1;
          game.combo = 0;
          game.shake = 0.32;
          addParticles(player.x + player.width / 2, player.y + player.height / 2, "#e31837", 14);
          playSound("hit");
          if (game.lives <= 0) {
            finishGame();
            return;
          }
        }
      }

      const NEAR_MISS_MARGIN = 13;
      for (const obstacle of game.obstacles) {
        if (obstacle.hit || obstacle.grazed) continue;
        const horizontallyAligned =
          playerBox.x < obstacle.x + obstacle.width && playerBox.x + playerBox.width > obstacle.x;
        if (!horizontallyAligned) continue;
        const verticalGap =
          obstacle.y >= playerBox.y + playerBox.height
            ? obstacle.y - (playerBox.y + playerBox.height)
            : playerBox.y >= obstacle.y + obstacle.height
              ? playerBox.y - (obstacle.y + obstacle.height)
              : -1;
        if (verticalGap >= 0 && verticalGap <= NEAR_MISS_MARGIN) {
          obstacle.grazed = true;
          game.score += 40 * mult;
          addParticles(player.x + player.width / 2, player.y + player.height / 2, "#8eddf1", 6);
          if (game.grazeSoundCooldown <= 0) {
            playSound("graze");
            game.grazeSoundCooldown = 0.35;
          }
        }
      }

      if (HALLOWEEN) {
        if (game.activePower?.kind === "magnet") {
          // Candy and letters within reach drift into the rider
          const px = playerBox.x + playerBox.width / 2;
          const py = playerBox.y + playerBox.height / 2;
          for (const item of [...game.pizzas, ...game.keycaps]) {
            const dx = px - (item.x + item.size / 2);
            const dy = py - (item.y + item.size / 2);
            const dist = Math.hypot(dx, dy);
            if (dist > 1 && dist < MAGNET_RADIUS) {
              const pull = Math.min(dist, 900 * dt) / dist;
              item.x += dx * pull;
              item.y += dy * pull;
            }
          }
        }
        for (const item of game.powerUps) {
          const box = {
            x: item.x + 4,
            y: item.y + Math.sin(game.elapsed * 4 + item.phase) * 7 + 4,
            width: item.size - 8,
            height: item.size - 8,
          };
          if (item.collected || !overlaps(playerBox, box)) continue;
          item.collected = true;
          missionEvent("powerup");
          const info = POWER_UP_INFO[item.kind];
          if (item.kind === "shield") game.pumpkinShield = info.seconds;
          else game.activePower = { kind: item.kind, timer: info.seconds, duration: info.seconds };
          addParticles(item.x + item.size / 2, item.y + item.size / 2, info.color, 18);
          game.scorePopups.push({
            x: item.x + item.size / 2,
            y: item.y,
            text: `${info.name}!`,
            timer: 1.1,
            duration: 1.1,
            color: info.color,
          });
          playSound("powerup");
        }
        game.powerUps = game.powerUps.filter((item) => !item.collected && item.x + item.size > -80);

        // X / candy button: knock on a door you're passing, otherwise throw a candy
        if (game.actionQueued) {
          game.actionQueued = false;
          const door = game.doors.find(
            (d) => !d.knocked && d.x < player.x + 130 && d.x + DOOR_W > player.x + 20,
          );
          if (door) {
            door.knocked = true;
            missionEvent("door");
            const treat = Math.random() < 0.6;
            door.treat = treat;
            let text: string;
            if (treat) {
              const roll = Math.floor(Math.random() * 4);
              if (roll === 0 || (roll === 3 && game.lives >= 3)) {
                game.score += TREAT_POINTS * mult;
                text = `TREAT! +${TREAT_POINTS * mult}`;
              } else if (roll === 1) {
                game.candyAmmo = Math.min(MAX_AMMO, game.candyAmmo + 5);
                text = "TREAT! +5 CANDY";
              } else if (roll === 2) {
                const kinds: Exclude<PowerUpKind, "shield">[] = ["broom", "magnet", "ghost"];
                const kind = kinds[Math.floor(Math.random() * kinds.length)];
                const info = POWER_UP_INFO[kind];
                game.activePower = { kind, timer: info.seconds, duration: info.seconds };
                text = `TREAT! ${info.name}`;
              } else {
                game.lives += 1;
                text = "TREAT! +1 LIFE";
              }
              addParticles(door.x + DOOR_W / 2, 400, "#ffd84e", 20);
              playSound("treat");
            } else {
              const roll = Math.floor(Math.random() * 3);
              if (roll === 0) {
                game.curse = { kind: "mirror", timer: CURSE_SECONDS };
                text = "TRICK! LEFT ↔ RIGHT";
              } else if (roll === 1) {
                game.curse = { kind: "fog", timer: CURSE_SECONDS };
                text = "TRICK! FOG";
              } else {
                game.candyAmmo = Math.max(0, game.candyAmmo - 3);
                text = "TRICK! CANDY STOLEN";
              }
              addParticles(door.x + DOOR_W / 2, 400, "#b98af0", 20);
              playSound("trick");
            }
            game.doorResult = { text, treat, timer: 1.6 };
          } else if (game.candyAmmo > 0 && game.throwCooldown <= 0) {
            game.candyAmmo -= 1;
            game.throwCooldown = THROW_COOLDOWN;
            // Auto-aim at the nearest ghost, bat or witch ahead (or the boss)
            const fromX = player.x + 112;
            const fromY = player.y + (player.sliding ? 30 : 44);
            let targetId: number | null = null;
            let best = Infinity;
            for (const obstacle of game.obstacles) {
              if (!ZAPPABLE.has(obstacle.kind) || obstacle.smashed !== undefined || obstacle.hit) continue;
              const ahead = obstacle.x + obstacle.width / 2 - fromX;
              if (ahead > 0 && ahead < WORLD_WIDTH && ahead < best) {
                best = ahead;
                targetId = obstacle.id;
              }
            }
            if (game.boss && !game.boss.defeated && game.boss.phase !== "leave" && game.boss.x + BOSS_W / 2 - fromX < best) {
              targetId = -1;
            }
            game.projectiles.push({ id: game.nextId++, x: fromX, y: fromY, vx: 1050, vy: -40, spin: 0, targetId });
            playSound("throw");
          }
        }

        // Thrown candy: zap ghosts, bats and witches; hit the boss
        for (const shot of game.projectiles) {
          // Home in on the target if it is still there; otherwise fly on with a little drop
          let aim: { x: number; y: number } | null = null;
          if (shot.targetId === -1 && game.boss && !game.boss.defeated && game.boss.phase !== "leave") {
            aim = { x: game.boss.x + BOSS_W / 2, y: game.boss.y + BOSS_H / 2 };
          } else if (shot.targetId !== null && shot.targetId >= 0) {
            const target = game.obstacles.find((o) => o.id === shot.targetId && o.smashed === undefined && !o.hit);
            if (target) aim = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
          }
          if (aim) {
            const dx = aim.x - shot.x;
            const dy = aim.y - shot.y;
            const dist = Math.hypot(dx, dy) || 1;
            const turn = Math.min(1, dt * 12);
            shot.vx += ((dx / dist) * 1050 - shot.vx) * turn;
            shot.vy += ((dy / dist) * 1050 - shot.vy) * turn;
          } else {
            shot.vy += 160 * dt;
          }
          shot.x += shot.vx * dt;
          shot.y += shot.vy * dt;
          shot.spin += 14 * dt;
          const shotBox = { x: shot.x - 12, y: shot.y - 9, width: 24, height: 18 };
          for (const obstacle of game.obstacles) {
            if (!ZAPPABLE.has(obstacle.kind) || obstacle.smashed !== undefined || obstacle.hit) continue;
            if (!overlaps(shotBox, obstacle)) continue;
            obstacle.hit = true;
            obstacle.smashed = 0;
            shot.x = WORLD_WIDTH + 999; // used up
            missionEvent("zap");
            if (obstacle.kind === "banner") {
              // The web comes down and its spider drops onto the road
              game.obstacles.push({
                id: game.nextId++,
                kind: "spider",
                x: obstacle.x + obstacle.width / 2 - SPIDER_W / 2,
                y: obstacle.y + obstacle.height - 10,
                width: SPIDER_W,
                height: SPIDER_H,
                hit: false,
                grazed: false,
                vy: 0,
              });
            }
            game.score += ZAP_POINTS * mult;
            game.scorePopups.push({
              x: obstacle.x + obstacle.width / 2,
              y: obstacle.y,
              text: `+${ZAP_POINTS * mult}`,
              timer: 0.8,
              duration: 0.8,
              color: "#ffd84e",
            });
            playSound("zap");
            break;
          }
          const boss = game.boss;
          if (boss && !boss.defeated && boss.phase !== "leave" && shot.x < WORLD_WIDTH + 500) {
            const bossBox = { x: boss.x + 20, y: boss.y - 20, width: BOSS_W - 30, height: BOSS_H + 10 };
            if (overlaps(shotBox, bossBox)) {
              shot.x = WORLD_WIDTH + 999;
              boss.hp -= 1;
              boss.hurt = 0.5;
              addParticles(boss.x + BOSS_W / 2, boss.y + BOSS_H / 2, "#7ee04a", 14);
              playSound("zap");
              if (boss.hp <= 0) {
                boss.defeated = true;
                boss.phase = "leave";
                boss.timer = 1.6;
                const defeat = (boss.kind === "pumpkin" ? MINI_BOSS_DEFEAT_POINTS : BOSS_DEFEAT_POINTS) * mult;
                game.score += defeat;
                game.shake = Math.max(game.shake, 0.4);
                game.scorePopups.push({
                  x: WORLD_WIDTH / 2,
                  y: 250,
                  text: `${boss.kind === "pumpkin" ? "PUMPKIN GHOST" : "WITCH"} DEFEATED! +${defeat}`,
                  timer: 1.6,
                  duration: 1.6,
                  color: "#7ee04a",
                });
                playSound("bigpizza");
              }
            }
          }
        }
        game.projectiles = game.projectiles.filter(
          (shot) => shot.x < WORLD_WIDTH + 60 && shot.x > -60 && shot.y < GROUND_Y + 20 && shot.y > -60,
        );
      }

      for (const pizza of game.pizzas) {
        const pizzaBox = {
          x: pizza.x + 5,
          y: pizza.y + Math.sin(game.elapsed * 5 + pizza.phase) * 6 + 5,
          width: pizza.size - 10,
          height: pizza.size - 10,
        };
        if (!pizza.collected && overlaps(playerBox, pizzaBox)) {
          pizza.collected = true;
          game.pizzasCollected += 1;
          game.combo += 1;
          game.comboTimer = HALLOWEEN ? HALLOWEEN_COMBO_WINDOW : 2.4;
          const comboForPoints = HALLOWEEN ? Math.min(game.combo, COMBO_CAP) : game.combo;
          game.score += (100 + Math.max(0, comboForPoints - 1) * 20) * mult;
          if (HALLOWEEN) {
            game.candyAmmo = Math.min(MAX_AMMO, game.candyAmmo + 1);
            missionEvent("candy");
            missionEvent("combo", game.combo);
          }
          addParticles(pizza.x + 24, pizza.y + 24, "#ffd84e", 12);
          playSound("pizza", game.combo);
        }
      }

      for (const keycap of game.keycaps) {
        const keycapBox = {
          x: keycap.x + 6,
          y: keycap.y + Math.sin(game.elapsed * 4 + keycap.phase) * 5 + 6,
          width: keycap.size - 12,
          height: keycap.size - 12,
        };
        if (!keycap.collected && overlaps(playerBox, keycapBox)) {
          keycap.collected = true;
          addParticles(keycap.x + 23, keycap.y + 23, "#8eddf1", 16);
          if (!game.collectedLetters.has(keycap.letter)) {
            game.collectedLetters.add(keycap.letter);
            game.letterFlashLetter = keycap.letter;
            game.letterFlashTimer = 0.9;
            game.letterFlyEffects.push({
              letter: keycap.letter,
              fromX: keycap.x + 23,
              fromY: keycap.y + 23,
              timer: 0.55,
              duration: 0.55,
            });
            game.score += 70 * mult;
            playSound("keycap");
            if (game.collectedLetters.size >= KEYCHRON_LETTERS.length) {
              game.collectedLetters.clear();
              game.keychronCompletions += 1;
              game.score += (250 + (Math.min(game.keychronCompletions, 5) - 1) * 100) * mult;
              game.keychronCelebration = 1.8;
              game.shake = Math.max(game.shake, 0.45);
              player.shield = Math.max(player.shield, KEYCHRON_SHIELD_SECONDS);
              spawnBigPizza(game);
              playSound("keychron");
              addParticles(player.x + player.width / 2, player.y, "#ffd84e", 12);
              addParticles(player.x + player.width / 2, player.y, "#8eddf1", 12);
              addParticles(player.x + player.width / 2, player.y, "#e31837", 12);
            }
          } else {
            game.score += 20 * mult;
            playSound("keycap");
          }
        }
      }

      if (game.bigPizza && !game.bigPizza.collected) {
        const bigPizzaBox = {
          x: game.bigPizza.x + 10,
          y: game.bigPizza.y + Math.sin(game.elapsed * 4 + game.bigPizza.phase) * 6 + 10,
          width: game.bigPizza.size - 20,
          height: game.bigPizza.size - 20,
        };
        if (overlaps(playerBox, bigPizzaBox)) {
          game.bigPizza.collected = true;
          game.score += game.bigPizzaBonus * mult;
          game.pizzasCollected += 1;
          addParticles(
            game.bigPizza.x + game.bigPizza.size / 2,
            game.bigPizza.y + game.bigPizza.size / 2,
            "#ffd84e",
            26,
          );
          game.scorePopups.push({
            x: game.bigPizza.x + game.bigPizza.size / 2,
            y: game.bigPizza.y,
            text: `+${game.bigPizzaBonus * mult}`,
            timer: 1.1,
            duration: 1.1,
            color: "#ffd84e",
          });
          playSound("bigpizza");
          game.bigPizza = null;
        }
      }

      game.obstacles = game.obstacles.filter((item) => item.x + item.width > -120);
      game.pizzas = game.pizzas.filter((item) => item.x + item.size > -80 && !item.collected);
      game.keycaps = game.keycaps.filter((item) => item.x + item.size > -80 && !item.collected);
      if (game.bigPizza && !game.bigPizza.collected && game.bigPizza.x + game.bigPizza.size < -120) {
        game.bigPizza = null;
        game.bigPizzaMissed = 1.4;
        playSound("miss");
      }
      game.particles.forEach((particle) => {
        particle.life -= dt;
        particle.vy += 500 * dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
      });
      game.particles = game.particles.filter((particle) => particle.life > 0);

      if (now - lastHudUpdateRef.current > 250) {
        lastHudUpdateRef.current = now;
        setHud({
          score: Math.floor(game.score),
          pizzas: game.pizzasCollected,
          lives: game.lives,
          distance: Math.floor(game.distance),
        });
      }
    };

    const render = () => {
      const game = gameRef.current;
      ctx.save();
      if (game.shake > 0) {
        ctx.translate((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 9);
      }
      drawBackground(ctx, game, images);
      if (HALLOWEEN) {
        const p = game.player;
        game.doors.forEach((door) => {
          const canKnock = !door.knocked && door.x < p.x + 130 && door.x + DOOR_W > p.x + 20;
          drawDoor(ctx, door, game.elapsed, canKnock, IS_TOUCH_DEVICE ? "🚪" : ACTION_KEY_LABEL);
        });
        game.platforms.forEach((platform) => {
          if (platform.kind === "rail") drawRail(ctx, platform, game.elapsed, game.onPlatform === platform.id);
          else drawRooftop(ctx, platform, game.elapsed);
        });
        game.pizzas.forEach((pizza) => drawCandy(ctx, pizza, game.elapsed));
        game.keycaps.forEach((keycap) => drawPumpkinKeycap(ctx, keycap, game.elapsed));
        game.powerUps.forEach((item) => drawPowerUpItem(ctx, item, game.elapsed));
      } else {
        game.pizzas.forEach((pizza) => drawPizza(ctx, pizza, game.elapsed));
        game.keycaps.forEach((keycap) => drawKeycap(ctx, keycap, game.elapsed));
      }
      if (game.bigPizza) drawBigPizza(ctx, game.bigPizza, game.elapsed);
      if (HALLOWEEN) {
        game.obstacles.forEach((obstacle) => drawHalloweenObstacle(ctx, obstacle, game.elapsed));
        if (game.boss) drawWitchBoss(ctx, game.boss, game.elapsed);
      } else {
        game.obstacles.forEach((obstacle) => drawObstacle(ctx, obstacle));
      }
      drawPlayer(ctx, game, images.keychron);
      if (HALLOWEEN && game.onPlatform !== null && game.platforms.some((p) => p.id === game.onPlatform && p.kind === "rail")) {
        drawBalanceMeter(ctx, game.player.x + 76, game.player.y - 62, game.grindBalance, game.grindLevel);
      }
      if (HALLOWEEN && game.curse?.kind === "mirror") {
        drawSwappedSign(ctx, game.player.x + 76, game.player.y - 40, game.elapsed);
      }
      if (HALLOWEEN) {
        game.projectiles.forEach((shot) => drawProjectile(ctx, shot));
        if (game.curse?.kind === "fog") drawFogCurse(ctx, game.elapsed, Math.min(1, game.curse.timer));
      }
      drawParticles(ctx, game.particles);
      drawScorePopups(ctx, game.scorePopups);
      drawHud(ctx, game, highScoreRef.current);
      if (HALLOWEEN) {
        drawPowerUpHud(ctx, game.activePower, game.pumpkinShield);
        drawMissionHud(ctx, game.mission, game.missionFlash);
        drawAmmoHud(ctx, game.candyAmmo, IS_TOUCH_DEVICE ? "🍬 BUTTON" : ACTION_KEY_LABEL);
        if (game.boss) drawBossHud(ctx, game.boss, IS_TOUCH_DEVICE ? "🍬" : ACTION_KEY_LABEL);
        else drawHauntedBanner(ctx, game.haunted, game.elapsed);
        if (game.curse) {
          drawCurseBanner(ctx, game.curse.kind === "mirror" ? "TRICK: LEFT ↔ RIGHT SWAPPED" : "TRICK: FOG", game.curse.timer, game.elapsed);
        }
        if (game.doorResult) {
          drawDoorResult(ctx, game.doorResult.text, game.doorResult.treat, game.doorResult.timer);
        } else if (game.doors.some((d) => !d.knocked && d.x < game.player.x + 130 && d.x + DOOR_W > game.player.x + 20)) {
          drawKnockHint(ctx, IS_TOUCH_DEVICE ? "Tap 🚪 Knock: trick or treat?" : "Press SPACE to knock: trick or treat?", game.elapsed);
        }
      }
      if (game.keychronCelebration > 0) drawKeychronCelebration(ctx, game);
      if (game.bigPizzaMissed > 0) drawBigPizzaMissed(ctx, game);
      drawOverlay(ctx, modeRef.current);
      ctx.restore();
      if (showFps && fpsLabel) {
        ctx.font = "900 16px 'Courier New', monospace";
        ctx.fillStyle = "rgba(0,0,0,.75)";
        ctx.fillRect(WORLD_WIDTH / 2 - 150, 4, 300, 26);
        ctx.fillStyle = "#7CFC9A";
        ctx.textAlign = "center";
        ctx.fillText(fpsLabel, WORLD_WIDTH / 2, 23);
        ctx.textAlign = "left";
      }
    };

    const loop = () => {
      const now = gameClock();
      const frameMs = now - previous;
      const dt = Math.min(frameMs / 1000, MAX_STEP_SECONDS);
      previous = now;
      fpsFrames += 1;
      fpsWorst = Math.max(fpsWorst, frameMs);
      if (now - fpsWindowStart >= 1000) {
        const fps = (fpsFrames * 1000) / (now - fpsWindowStart);
        fpsLabel = `${fps.toFixed(0)} FPS · slowest ${fpsWorst.toFixed(0)} ms`;
        fpsFrames = 0;
        fpsWorst = 0;
        fpsWindowStart = now;
      }
      if (modeRef.current === "running") {
        let remaining = Math.min(frameMs / 1000, MAX_CATCH_UP_SECONDS);
        while (remaining > 0 && modeRef.current === "running") {
          const step = Math.min(remaining, MAX_STEP_SECONDS);
          update(step, now);
          remaining -= step;
        }
      } else if (modeRef.current === "gameover") {
        gameRef.current.shake = Math.max(0, gameRef.current.shake - dt);
      }
      render();
      frameId = window.requestAnimationFrame(loop);
    };
    if (__DEBUG__) {
      const game = () => gameRef.current;
      (window as unknown as { __bench: Record<string, () => void> }).__bench = {
        render,
        update: () => update(1 / 60, performance.now()),
        background: () => drawBackground(ctx, game(), images),
        hud: () => drawHud(ctx, game(), highScoreRef.current),
        player: () => drawPlayer(ctx, game(), images.keychron),
        items: () => {
          game().pizzas.forEach((pizza) => drawPizza(ctx, pizza, game().elapsed));
          game().keycaps.forEach((keycap) => drawKeycap(ctx, keycap, game().elapsed));
          game().obstacles.forEach((obstacle) => drawObstacle(ctx, obstacle));
        },
      };
    }
    frameId = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", onFpsKey);
    };
  }, [changeGameOverView, changeMode, playSound]);

  const primaryAction =
    mode === "running"
      ? "Restart"
      : mode === "paused"
        ? "Resume"
        : mode === "gameover"
          ? gameOverView === "entry"
            ? "Save score"
            : "Play again"
          : "Start game";
  const onPrimaryAction = () => {
    if (mode === "paused") togglePause();
    else if (mode === "gameover" && gameOverView === "entry") void saveScore();
    else startGame();
  };
  const playerInTopTen = leaderboard.some((entry) => entry.id === lastSavedEntryId);

  return (
    <main className="site-shell">
      <nav className="topbar" aria-label="Event brands">
        <div className="brand-lockup">
          <img className={HALLOWEEN ? "keychron-logo pumpkin-logo" : "keychron-logo"} src={brandLogoUrl} alt="" width={40} height={40} />
          <span>KEYCHRON</span>
          <b>×</b>
          {HALLOWEEN ? (
            <span className="halloween-tag">🎃 HALLOWEEN</span>
          ) : (
            <img className="pax-logo" src={paxLogoUrl} alt="PAX Aus" height={34} />
          )}
          <span>2026</span>
        </div>
        <div className="topbar-actions">
          <div className="best-score" aria-label={`Best score ${highScore}`}>BEST {String(highScore).padStart(5, "0")}</div>
          <button className="icon-button" type="button" onClick={toggleSound} aria-label={soundEnabled ? "Mute sound" : "Turn sound on"}>
            {soundEnabled ? "♪ ON" : "♪ OFF"}
          </button>
          <button className="icon-button" type="button" onClick={() => void toggleFullscreen()} aria-label="Toggle full screen">
            ⛶ FULL
          </button>
        </div>
      </nav>

      <header className="game-heading">
        <div>
          <p className="eyebrow">{HALLOWEEN ? "HALLOWEEN 2026 / HAUNTED MELBOURNE / TRICK OR TREAT" : "PAX AUS 2026 / MCEC MELBOURNE / 9-11 OCT"}</p>
          <h1>KEYCHRON <span>DASH</span></h1>
        </div>
        <p className="heading-copy">
          {HALLOWEEN
            ? "Skate through haunted Melbourne on Halloween night. Dodge pumpkins, ghosts and witches, grab candy and power-ups, spell K-E-Y-C-H-R-O-N for a spooky keyboard bonus, and top the leaderboard."
            : "Race through Melbourne to PAX Aus. Dodge the obstacles, grab switches, spell K-E-Y-C-H-R-O-N to win a keyboard bonus, and top the leaderboard."}
        </p>
      </header>

      <section className="game-stage" ref={stageRef} aria-label="Keychron Dash runner game">
        <div className="screen-bezel">
          <canvas
            ref={canvasRef}
            className="game-canvas"
            width={WORLD_WIDTH}
            height={WORLD_HEIGHT}
            aria-label={HALLOWEEN
              ? "Game screen. Press Enter to start, W or Up to jump, S or Down to slide, A D or Left and Right to move, Space to throw candy."
              : "Game screen. Press Enter to start, Space or Up to jump, Down to slide, Left and Right to move."}
            onPointerDown={() => {
              if (modeRef.current === "ready") startGame();
              else if (modeRef.current === "paused") togglePause();
            }}
          />
          {mode === "gameover" && (
            <div className="result-overlay" aria-live="polite">
              <div className={`result-card ${gameOverView === "leaderboard" ? "leaderboard-card" : ""}`}>
                <div className="result-brand-lockup" aria-label={HALLOWEEN ? "Keychron Halloween 2026" : "Keychron and PAX Aus 2026"}>
                  <img className={HALLOWEEN ? "result-keychron-logo pumpkin-logo" : "result-keychron-logo"} src={brandLogoUrl} alt="Keychron" />
                  <span>×</span>
                  {HALLOWEEN ? (
                    <span className="result-halloween-tag">🎃 HALLOWEEN</span>
                  ) : (
                    <img className="result-pax-logo" src={paxLogoUrl} alt="PAX Aus" />
                  )}
                </div>

                {gameOverView === "entry" ? (
                  <div className="score-entry-view">
                    <p className="result-kicker">GAME OVER</p>
                    <h2>Nice run!</h2>
                    <strong className="final-score">{String(hud.score).padStart(5, "0")}</strong>
                    <p className="result-summary">
                      {hud.pizzas} {HALLOWEEN ? "candy" : "switches"} · {hud.distance} m
                    </p>
                    <form
                      className="name-entry-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveScore();
                      }}
                    >
                      <label htmlFor="player-name">Save your score to the worldwide leaderboard</label>
                      <div className="name-entry-row name-entry-row--spaced">
                        <input
                          ref={nameInputRef}
                          id="player-name"
                          type="text"
                          value={playerName}
                          onChange={(event) => setPlayerName(event.target.value)}
                          maxLength={12}
                          autoComplete="nickname"
                          spellCheck={false}
                          placeholder="Name (shown on the board)"
                          aria-label="Player name"
                        />
                        <button type="submit" disabled={saving}>
                          {saving ? "Saving…" : "SAVE ⏎"}
                        </button>
                      </div>
                      <div className="name-entry-row name-entry-row--spaced">
                        <input
                          id="player-email"
                          type="email"
                          value={playerEmail}
                          onChange={(event) => setPlayerEmail(event.target.value)}
                          maxLength={120}
                          autoComplete="email"
                          placeholder="Email"
                          aria-label="Email"
                        />
                        <input
                          id="player-phone"
                          type="tel"
                          value={playerPhone}
                          onChange={(event) => setPlayerPhone(event.target.value)}
                          maxLength={20}
                          autoComplete="tel"
                          placeholder="Phone"
                          aria-label="Phone"
                        />
                      </div>
                      <label className="consent-row" htmlFor="player-consent">
                        <input
                          id="player-consent"
                          type="checkbox"
                          checked={playerConsent}
                          onChange={(event) => setPlayerConsent(event.target.checked)}
                        />
                        <span>I agree that Keychron may contact me about this competition.</span>
                      </label>
                      <small>
                        Only your name and score are shown publicly. Email and phone are used to contact winners and are never published.{" "}
                        <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer">
                          Privacy Policy
                        </a>
                      </small>
                      {saveError && <p className="name-entry-error">{saveError}</p>}
                    </form>
                  </div>
                ) : (
                  <div className="leaderboard-view">
                    <div className="leaderboard-heading">
                      <div>
                        <p className="result-kicker">WORLDWIDE · TOP 10</p>
                        <h2>Leaderboard</h2>
                      </div>
                      <div className="current-score-chip">
                        <small>{playerRank ? `Your rank #${playerRank}` : "Your score"}</small>
                        <strong>{String(hud.score).padStart(5, "0")}</strong>
                      </div>
                    </div>

                    {leaderboardError && <p className="name-entry-error">{leaderboardError}</p>}

                    {leaderboard.length > 0 ? (
                      <ol className="leaderboard-list">
                        {leaderboard.map((entry, index) => (
                          <li
                            key={entry.id}
                            className={`${index < 3 ? `podium rank-${index + 1}` : ""} ${entry.id === lastSavedEntryId ? "is-current-player" : ""}`}
                          >
                            <span className="rank-mark">
                              {index < 3 ? (
                                <span
                                  className={`trophy trophy-${index + 1}`}
                                  role="img"
                                  aria-label={index === 0 ? "Gold" : index === 1 ? "Silver" : "Bronze"}
                                >
                                  🏆
                                </span>
                              ) : (
                                index + 1
                              )}
                            </span>
                            <span className="leader-name">{entry.name}</span>
                            <span className="leader-detail">
                              {entry.switches} {HALLOWEEN ? "candy" : "switches"} · {entry.distance}m
                            </span>
                            <strong>{String(entry.score).padStart(5, "0")}</strong>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <div className="empty-leaderboard">No scores yet. Be the first on the board!</div>
                    )}

                    {!playerInTopTen && playerRank && (
                      <p className="rank-note">You placed #{playerRank}. Have another go to break into the top 10!</p>
                    )}

                    <div className="leaderboard-actions">
                      <button type="button" className="play-again-button" onClick={startGame}>
                        ENTER · PLAY AGAIN
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="screen-corner corner-left" aria-hidden="true">KEYCHRON</div>
          <div className="screen-corner corner-right" aria-hidden="true">{HALLOWEEN ? "HALLOWEEN 2026" : "PAX AUS 2026"}</div>
        </div>

        <section className="touch-panel" aria-label="Touch controls">
          <div className="touch-group">
            <button
              type="button"
              className="touch-key"
              aria-label="Move left"
              onPointerDown={(event) => holdControl("left", event)}
              onPointerUp={() => setControl("left", false)}
              onPointerCancel={() => setControl("left", false)}
              onLostPointerCapture={() => setControl("left", false)}
              onContextMenu={(event) => event.preventDefault()}
            >←<span>Left</span></button>
            <button
              type="button"
              className="touch-key"
              aria-label="Move right"
              onPointerDown={(event) => holdControl("right", event)}
              onPointerUp={() => setControl("right", false)}
              onPointerCancel={() => setControl("right", false)}
              onLostPointerCapture={() => setControl("right", false)}
              onContextMenu={(event) => event.preventDefault()}
            >→<span>Right</span></button>
          </div>
          <div className="touch-group">
            {HALLOWEEN && (
              <button
                type="button"
                className="touch-key candy-key"
                aria-label="Throw candy or knock on a door"
                onPointerDown={(event) => {
                  event.preventDefault();
                  if (modeRef.current === "running") gameRef.current.actionQueued = true;
                }}
                onContextMenu={(event) => event.preventDefault()}
              >{atDoor ? "🚪" : "🍬"}<span>{atDoor ? "Knock" : "Throw"}</span></button>
            )}
            <button
              type="button"
              className="touch-key"
              aria-label="Slide"
              onPointerDown={(event) => holdControl("down", event)}
              onPointerUp={() => setControl("down", false)}
              onPointerCancel={() => setControl("down", false)}
              onLostPointerCapture={() => setControl("down", false)}
              onContextMenu={(event) => event.preventDefault()}
            >↓<span>Slide</span></button>
            <button
              type="button"
              className="touch-key jump-key"
              aria-label="Jump"
              onPointerDown={(event) => { event.preventDefault(); jump(); }}
              onContextMenu={(event) => event.preventDefault()}
            >↑<span>Jump</span></button>
          </div>
        </section>
        <div className="game-toolbar">
          <div className="live-stats" aria-live="off">
            <span><small>SCORE</small>{String(hud.score).padStart(5, "0")}</span>
            <span><small>{HALLOWEEN ? "CANDY" : "SWITCHES"}</small>× {hud.pizzas}</span>
            <span><small>LIVES</small>{"●".repeat(clamp(hud.lives, 0, 3))}{"○".repeat(3 - clamp(hud.lives, 0, 3))}</span>
            <span><small>DISTANCE</small>{hud.distance}m</span>
          </div>
          <div className="toolbar-buttons">
            <button className="pause-button" type="button" onClick={togglePause} disabled={mode === "ready" || mode === "gameover"}>
              {mode === "paused" ? "Resume" : "Pause"}
            </button>
            <button className="start-button" type="button" onClick={onPrimaryAction}>{primaryAction}</button>
          </div>
        </div>
      </section>

      <section className="controls-section" aria-label="How to play">
        <div className="control-copy">
          <p className="section-kicker">HOW TO PLAY</p>
          {HALLOWEEN ? (
            <>
              <h2>Survive Halloween night</h2>
              <p>You skate automatically and speed up the further you go. Jump over pumpkins, gravestones, slime, coffins, skeleton hands and the hearse, or jump right ON pumpkins, coffins and hands to smash them. Slide under signs, cobwebs, ghosts and bats, and stay low under flying witches. Every candy you grab is ammo: press Space to throw it and zap ghosts, bats and witches, or tear down a cobweb (then stomp the spider that drops out). When the thunder stops, the Pumpkin Ghost attacks (hit it twice), and every 1,000 m the witch attacks: dodge their pumpkin bombs or hit her 3 times. Knock on doors for a treat (or a trick!), grab power-ups, and enjoy double points in the haunted stretches. Jump onto graveyard rails to grind (keep your balance with ← → for up to x3 points), take the rooftop route for extra candy and gap-jump tricks, and complete the missions at the top of the screen.</p>
            </>
          ) : (
            <>
              <h2>Get to PAX in one piece</h2>
              <p>You run automatically and speed up the further you go. Jump over cones, barriers, puddles, delivery trucks and stacks of boxes. Stay low under planes, and slide under signs, banners and drones. Collect all eight KEYCHRON keycaps for a shield and a big keyboard bonus.</p>
            </>
          )}
        </div>
        <div className="keyboard-guide">
          <div className="guide-item">
            <kbd>{HALLOWEEN ? "W / ↑" : "SPACE"}</kbd>
            <div><b>Jump</b><span>{HALLOWEEN ? "Pumpkins, slime, gravestones, coffins, skeleton hands, the hearse" : "Cones, puddles, barriers, trucks, boxes"}</span></div>
          </div>
          <div className="guide-item">
            <div className="key-cluster">{HALLOWEEN ? <><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></> : <><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></>}</div>
            <div><b>Slide &amp; dodge</b><span>{HALLOWEEN ? "Hold S / ↓ to slide under signs, cobwebs, ghosts and bats. A D or ← → move" : "Hold ↓ to slide under signs, banners and drones"}</span></div>
          </div>
          {HALLOWEEN && (
            <div className="guide-item">
              <kbd>SPACE</kbd>
              <div><b>Throw candy / knock</b><span>Zap ghosts, bats, cobwebs and bosses. At a door, Space knocks instead</span></div>
            </div>
          )}
          <div className="guide-item compact-guide">
            <kbd>ENTER</kbd><div><b>Start / save score</b><span>After the run, type your name and press Enter</span></div>
          </div>
        </div>
      </section>


      <footer className="site-footer">
        <span>{HALLOWEEN ? "KEYCHRON × HALLOWEEN 2026" : "KEYCHRON × PAX AUS 2026"}</span>
        <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer">
          PRIVACY POLICY
        </a>
        <span>{HALLOWEEN ? "TRICK. OR. TYPE." : "READY. SET. TYPE."}</span>
      </footer>
    </main>
  );
}

export default PizzaDashGame;
