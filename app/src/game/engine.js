// Game engine: physics, level logic and canvas rendering.
// It owns the game loop; everything the UI shows is pushed to ./store.js and drawn by the React components.
import { LEVELS, ACTS } from "./levels.js";
import { BONUS } from "./bonus.js";
import { getState, setState, update } from "./store.js";
import { CHAPTERS, EPILOGUE, chapterAt } from "./story.js";

// ---------- constants ----------
const TS = 32, VW = 960, VH = 540;
const MAXFALL = 860, ACC_G = 2600, ACC_A = 1700, JUMP = 520;
const HOOK_SPEED = 2100, REEL = 280, ROPE_MIN = 22;
let HOOK_RANGE = 384, ROPE_MAX = 420; // scaled by the 청록 scarf
let GRAV = 1700, RUN = 220; // changed by daily-challenge twists
const SWING_ACC = 1150, PULL_SPEED = 430;
const SPRING = 930, WIND_UP = 300, WIND_ACC = 2600;
const VIS_HALF = 0.48;
// Difficulty-dependent tuning; applyDifficulty() sets these for normal or hard mode.
// Each scarf carries one small ability; unlocked by total stars.
// `theme` recolours the rope, hook, grab sparks and the menu accent to match the scarf.
const SKINS = [
  { name: "붉은 스카프", need: 0, color: "#c8423b", theme: { rope: "#e0785f", hook: "#f0c4b4", ui: "#e8846a" }, desc: "발판 끝 점프 여유 +60%", coyote: 1.6 },
  { name: "청록 스카프", need: 30, color: "#3fa7a0", theme: { rope: "#4fc1b8", hook: "#bdf0ea", ui: "#5ccfc5" }, desc: "갈고리 사거리 +25%", hook: 1.25 },
  { name: "금빛 스카프", need: 90, color: "#e0b04a", theme: { rope: "#e8c15a", hook: "#fff0b8", ui: "#ebc45e" }, desc: "금화·열쇠·파워업 자석", magnet: 34 },
  { name: "보랏빛 스카프", need: 180, color: "#a77ae8", theme: { rope: "#b48cf0", hook: "#e4d4ff", ui: "#bf9cf4" }, desc: "파워업 지속 +60%", power: 1.6 },
  { name: "달빛 스카프", need: 300, color: "#e8e4f0", theme: { rope: "#c9d3ea", hook: "#ffffff", ui: "#d4dcf0" }, desc: "경비 시야 거리 -20%", vis: 0.8 },
  { name: "무지개 스카프", need: 450, color: "rainbow", theme: { rope: "rainbow", hook: "#ffffff", ui: "#f29ac4" }, desc: "출발할 때마다 수호 부적 1회", shield: true },
];
const skin = () => SKINS[save.skin || 0] || SKINS[0];
let VIS = 210, SEE_LIMIT = 0.45, CRACK_T = 1.6, REGROW_T = 4, PATROL_V = 55, WATCH_T = 2.6;
const PW = 18, PH = 28;
const STEP = 1 / 120;

// ---------- save ----------
const SAVE_KEY = "rope-assassin-v1";
// Stages whose maps were rebuilt (1-based). Records and ghosts saved on the old maps no longer apply.
const MAP_REV = 2;
const REBUILT = [43, 58, 66, 70, 92, 98, 107, 112, 113, 119, 121, 125, 126, 127, 132, 133, 137, 143, 144, 145, 146, 152, 166, 169, 172, 174, 180, 184, 188, 204, 205, 207, 208];
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (s && typeof s.unlocked === "number") return { unlocked: s.unlocked, best: s.best || {}, sr: s.sr || {}, bestH: s.bestH || {}, srH: s.srH || {}, hard: !!s.hard, diff: typeof s.diff === "number" ? s.diff : (s.hard ? 1 : 0), bestM: s.bestM || {}, srM: s.srM || {}, big: !!s.big, skin: s.skin || 0, left: !!s.left, fade: !!s.fade, vib: s.vib !== false, ghost: s.ghost !== false, daily: s.daily || null, streak: s.streak || 0, dailyLast: s.dailyLast || "", stats: s.stats || {}, ach: s.ach || {}, mapRev: s.mapRev || 1, story: s.story || {}, bonus: s.bonus || {}, bonusGhost: !!s.bonusGhost };
  } catch (e) {}
  return { unlocked: 1, best: {}, sr: {}, bestH: {}, srH: {}, bestM: {}, srM: {}, hard: false, diff: 0, vib: true, ghost: true, stats: {}, ach: {}, mapRev: MAP_REV, story: {}, bonus: {}, bonusGhost: true };
}
function writeSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
  setState({ rev: getState().rev + 1 }); // the menu re-reads records and settings
}
const save = loadSave();

// Save transfer: the whole save as one copyable code ("RA1." + base64 of the JSON + "." + checksum).
// Ghost replays stay behind; they are large and rebuild themselves as you play.
const CODE_PREFIX = "RA1.";
function fnv(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0; return h.toString(36); }
export function exportCode() {
  const bytes = new TextEncoder().encode(JSON.stringify(save));
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  const body = btoa(bin);
  return CODE_PREFIX + body + "." + fnv(body);
}
// Checks a pasted code and, if it is good, replaces the save and reloads the game. Returns an error message otherwise.
export function importCode(text) {
  const code = String(text || "").replace(/\s+/g, "");
  if (!code.startsWith(CODE_PREFIX)) return "저장 코드가 아니다. RA1. 로 시작하는 코드를 붙여 넣어라.";
  const [body, sum] = code.slice(CODE_PREFIX.length).split(".");
  if (!body || fnv(body) !== sum) return "코드가 잘렸거나 틀렸다. 처음부터 끝까지 다시 복사해 보라.";
  let data;
  try { data = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(body), (c) => c.charCodeAt(0)))); } catch (e) { return "코드를 읽을 수 없다."; }
  if (!data || typeof data.unlocked !== "number" || typeof data.best !== "object") return "진행 기록이 들어 있지 않은 코드다.";
  data.unlocked = Math.max(1, Math.min(LEVELS.length, Math.floor(data.unlocked)));
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { return "이 브라우저에는 저장할 수 없다."; }
  setTimeout(() => location.reload(), 600); // loadSave() and the map migration run on the fresh start
  return "";
}
// Daily challenge: one stage and one twist per calendar day; clearing it on consecutive days builds a streak.
const DAILY_MODS = [
  { name: "저중력", desc: "몸이 가볍다 · 중력 70%" },
  { name: "경비 강화", desc: "경비가 빠르고 금방 알아챈다" },
  { name: "질풍", desc: "달리기 속도 +30%" },
  { name: "칠흑", desc: "등불 하나만 비춘다" },
];
let daily = null; // the challenge being played right now, or null
function dayKey(off = 0) { const d = new Date(Date.now() + off * 864e5); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
function todaysDaily() {
  const today = dayKey();
  if (!save.daily || save.daily.date !== today) {
    let h = 2166136261; for (const c of today) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    const pool = Math.max(5, Math.min(LEVELS.length, save.unlocked));
    save.daily = { date: today, lvl: h % pool, mod: (h >>> 8) % DAILY_MODS.length, best: null };
    writeSave();
  }
  return save.daily;
}
todaysDaily();
// Ghosts: your best run of each stage, replayed as a shadow you race against.
// Positions are sampled 15 times per in-game second and kept in their own key so the save stays small.
const GHOST_KEY = "rope-assassin-ghost-v1", GHOST_HZ = 15, GHOST_MAX = 60;
let ghosts = {};
try { ghosts = JSON.parse(localStorage.getItem(GHOST_KEY) || "{}") || {}; } catch (e) {}
if (save.mapRev < MAP_REV) {
  for (const n of REBUILT) {
    for (const tbl of [save.best, save.bestH, save.bestM]) delete tbl[n - 1];
    for (const tbl of [save.sr, save.srH, save.srM])
      for (const k in tbl) { const [a, b] = k.split("-").map(Number); if (a <= n - 1 && n - 1 <= b) delete tbl[k]; }
    for (const d of [0, 1, 2]) delete ghosts[d + ":" + (n - 1)];
  }
  save.mapRev = MAP_REV;
  try { localStorage.setItem(GHOST_KEY, JSON.stringify(ghosts)); } catch (e) {}
  writeSave();
}
const ghostId = (i) => diff + ":" + (i === BONUS_I ? "bonus" : i);
// The bonus ghost was first stored under index 300 (one past the campaign, which then ended at 300); give it its fixed key.
if (!save.bonusGhost) {
  for (const d of [0, 1, 2]) if (ghosts[d + ":300"] && save.bonus && save.bonus[d]) { ghosts[d + ":bonus"] = ghosts[d + ":300"]; delete ghosts[d + ":300"]; }
  save.bonusGhost = true;
  try { localStorage.setItem(GHOST_KEY, JSON.stringify(ghosts)); } catch (e) {}
}
function storeGhost(i, pts) {
  if (pts.length < 4 || pts.length > GHOST_HZ * 2 * 240) return;
  ghosts[ghostId(i)] = { at: Date.now(), d: pts.map((v) => v.toString(36)).join(",") };
  const ids = Object.keys(ghosts).sort((a, b) => ghosts[b].at - ghosts[a].at);
  for (const k of ids.slice(GHOST_MAX)) delete ghosts[k];
  for (let tries = 0; tries < 20; tries++) {
    try { localStorage.setItem(GHOST_KEY, JSON.stringify(ghosts)); return; } catch (e) {
      const old = Object.keys(ghosts).sort((a, b) => ghosts[a].at - ghosts[b].at)[0];
      if (!old || old === ghostId(i)) return; delete ghosts[old];
    }
  }
}
let ghostRec = [], ghostPlay = null;
// 0 normal, 1 hard, 2 master. `hard` stays true for master so every hard rule also applies there.
let diff = save.diff, hard = diff >= 1, master = diff === 2;
const DIFF_NAME = ["일반", "하드", "마스터"];
const bestTable = () => [save.best, save.bestH, save.bestM][diff];
const srTable = () => [save.sr, save.srH, save.srM][diff];
function applyDifficulty() {
  const sk = skin();
  if (typeof document !== "undefined") document.documentElement.style.setProperty("--rope", sk.theme.ui);
  VIS = [210, 270, 300][diff] * (sk.vis || 1);
  HOOK_RANGE = 384 * (sk.hook || 1); ROPE_MAX = 420 * (sk.hook || 1);
  SEE_LIMIT = [0.38, 0.2, 0.08][diff];
  CRACK_T = [1.6, 1.1, 0.75][diff];
  REGROW_T = [4, 6, 8][diff];
  PATROL_V = [60, 85, 115][diff];
  WATCH_T = [2.6, 1.6, 1.1][diff];
  const m = daily ? daily.mod : -1;
  GRAV = m === 0 ? 1190 : 1700;
  RUN = m === 2 ? 286 : 220;
  if (m === 1) { PATROL_V *= 1.5; WATCH_T *= 0.6; SEE_LIMIT *= 0.5; }
}
applyDifficulty();

// ---------- canvas ----------
let cv = null, ctx = null;
// Lowered step by step on devices that cannot keep up, trading sharpness for a steady frame rate.
let dprCap = 2, slowFrames = 0, sampleFrames = 0;
let dpr = 1, scale = 1, viewW = VW, viewH = VH;
let touchMode = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches && !matchMedia("(pointer: fine)").matches);
let touchAim = null;
function resize() {
  if (!cv) return;
  dpr = Math.min(touchMode ? 1.75 : 2, dprCap, window.devicePixelRatio || 1);
  const w = window.innerWidth, h = window.innerHeight;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  // Phones get a closer camera; in portrait the base is square so the world is not shrunk to a sliver.
  const portrait = h > w;
  const bw = touchMode ? (portrait ? 500 : 620) : VW, bh = touchMode ? (portrait ? 500 : 349) : VH;
  scale = Math.min(w / bw, h / bh);
  viewW = w / scale; viewH = h / scale;
}

// ---------- audio ----------
let actx = null, muted = false;
function ensureAudio() {
  // iOS/Android start the context suspended until a user gesture, and suspend it again after the app is backgrounded.
  if (actx) { if (actx.state !== "running" && actx.resume) actx.resume().catch(() => {}); return; }
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
  if (actx && actx.state !== "running" && actx.resume) actx.resume().catch(() => {});
}
function tone(freq, dur, type, vol, slide, delay) {
  if (!actx || muted) return;
  const t = actx.currentTime + (delay || 0);
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type || "square";
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(vol || 0.06, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(actx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
const sfx = {
  fire: () => tone(900, 0.08, "triangle", 0.05, 300),
  attach: () => { tone(220, 0.05, "square", 0.05); tone(160, 0.08, "triangle", 0.05, 0, 0.03); },
  clank: () => tone(1400, 0.07, "square", 0.03, 700),
  toggle: () => { tone(660, 0.08, "triangle", 0.06); tone(990, 0.12, "triangle", 0.05, 0, 0.07); },
  key: () => { tone(880, 0.08, "sine", 0.07); tone(1320, 0.14, "sine", 0.06, 0, 0.08); },
  door: () => tone(140, 0.25, "sawtooth", 0.04, 70),
  kill: () => { tone(1200, 0.06, "sawtooth", 0.04, 200); tone(90, 0.18, "sine", 0.08, 50, 0.04); },
  die: () => tone(200, 0.4, "sawtooth", 0.06, 40),
  alert: () => { tone(1000, 0.08, "square", 0.05); tone(1000, 0.08, "square", 0.05, 0, 0.12); },
  jump: () => tone(380, 0.09, "triangle", 0.035, 620),
  pull: () => tone(300, 0.12, "triangle", 0.04, 520),
  crack: () => { tone(180, 0.15, "sawtooth", 0.05, 60); tone(90, 0.2, "triangle", 0.05); },
  plate: () => tone(260, 0.08, "square", 0.035),
  spring: () => tone(240, 0.16, "triangle", 0.06, 720),
  warp: () => { tone(500, 0.12, "sine", 0.05, 1200); tone(1200, 0.12, "sine", 0.04, 400, 0.06); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, "triangle", 0.06, 0, i * 0.09)),
};

// ---------- input ----------
const keys = {};
let jumpQueued = false;
const mouse = { sx: VW / 2, sy: VH / 2 };
function onKeyDown(e) {
  ensureAudio();
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if (e.repeat) { keys[e.code] = true; return; }
  keys[e.code] = true;
  if (mode === "play" || mode === "dead") {
    if (e.code === "Space") jumpQueued = true;
    if (e.code === "KeyR") restartLevel();
    if (e.code === "KeyQ") releaseHook();
    if (e.code === "Escape" || e.code === "KeyP") pauseGame();
  } else if (mode === "pause") {
    // preventDefault keeps Enter from also "clicking" the focused overlay button
    if (e.code === "Escape" || e.code === "KeyP" || e.code === "Enter") { e.preventDefault(); resumeGame(); }
    if (e.code === "KeyR") { resumeGame(); restartLevel(); }
  } else if (mode === "story") {
    if (e.code === "Enter" || e.code === "Space" || e.code === "Escape") { e.preventDefault(); storyContinue(); }
  } else if (mode === "win" && !(run && !run.done)) {
    if (e.code === "Enter" || e.code === "Space") { e.preventDefault(); winNext(); }
    if (e.code === "KeyR") winRetry();
    if (e.code === "Escape") showMenu();
  }
  if (e.code === "KeyM") toggleMute();
}
function toggleMute() {
  muted = !muted;
  setState({ muted });
  toast(muted ? "소리 끔" : "소리 켬");
}
function setTouchMode(on) {
  if (touchMode === on && getState().touch === on) return;
  touchMode = on;
  setState({ touch: on });
  syncHintText();
  resize();
}
function setMode(m) {
  mode = m;
  if (getState().mode !== m) setState({ mode: m });
}

// virtual stick and buttons (rendered by React, driven from here): left/right moves, up/down reels the rope
export function stickMove(dx, dy) {
  keys.TouchLeft = dx < -0.3; keys.TouchRight = dx > 0.3;
  keys.TouchUp = dy < -0.5; keys.TouchDown = dy > 0.5;
}
export function stickEnd() {
  keys.TouchLeft = keys.TouchRight = keys.TouchUp = keys.TouchDown = false;
}
// lets go of every touch control, e.g. when the app is backgrounded
function resetTouch() {
  stickEnd();
  setState({ stickReset: getState().stickReset + 1 });
}
export function jumpPress() { ensureAudio(); buzz(8); keys.Space = true; if (mode === "play") jumpQueued = true; }
export function jumpRelease() { keys.Space = false; }
export function releasePress() { ensureAudio(); buzz(8); if (mode === "play") releaseHook(); }
function buzz(ms) { if (save.vib && touchMode && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} } }

// ---------- install as an app ----------
let installEvt = null;
const standalone = () => (window.matchMedia && matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches) || navigator.standalone === true;
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const ua = navigator.userAgent;
const inApp = /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp|; wv\)/i.test(ua);
const isSamsung = /SamsungBrowser/i.test(ua);
function installHelp() {
  if (location.protocol === "file:") return "파일로 직접 연 상태에서는 설치할 수 없다. https://creamsoda-siwoo.github.io/roasssin/ 주소로 열어라.";
  if (inApp) return "카카오톡·네이버 같은 앱 안의 브라우저에서는 설치가 안 된다. 오른쪽 위 메뉴에서 '다른 브라우저로 열기'를 눌러 " + (isIOS ? "사파리" : "크롬") + "에서 연 뒤 다시 눌러라.";
  if (isIOS) return /CriOS|FxiOS|EdgiOS/.test(ua) ? "아이폰은 사파리에서만 설치할 수 있다. 사파리로 이 주소를 연 뒤, 아래쪽 공유 버튼 → '홈 화면에 추가'를 눌러라." : "아래쪽(또는 위쪽) 공유 버튼 □↑ → '홈 화면에 추가' → '추가'를 눌러라.";
  if (isSamsung) return "아래쪽 메뉴 ≡ → '현재 페이지 추가' → '홈 화면'을 눌러라.";
  return "크롬 오른쪽 위 ⋮ 메뉴 → '앱 설치' 또는 '홈 화면에 추가'를 눌러라. 메뉴에 없으면 페이지를 한 번 새로고침한 뒤 다시 시도해라.";
}
export function installClick() {
  if (installEvt) { installEvt.prompt(); installEvt.userChoice.finally(() => { installEvt = null; }); return; }
  update("install", { note: installHelp(), noteShown: !getState().install.noteShown });
}
export const canFullscreen = () => { const el = document.documentElement; return !!(el.requestFullscreen || el.webkitRequestFullscreen); };
export function fullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req) { toast("이 브라우저는 전체 화면을 지원하지 않습니다"); return; }
  Promise.resolve(req.call(el)).then(() => {
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {}); } catch (err) {}
  }).catch(() => toast("전체 화면을 열 수 없습니다"));
}

// ---------- helpers ----------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

// ---------- level state ----------
let L = null, cur = 0, mode = "menu";
// The bonus stage sits just past the campaign's last index so ghosts and the level flow can treat it like any stage.
const BONUS_I = LEVELS.length;
const lvAt = (i) => (i === BONUS_I ? BONUS : LEVELS[i]);
const actAt = (i) => (i === BONUS_I ? "보너스" : ACTS[i]);
let runTime = 0, runDeaths = 0, deadT = 0;
const cam = { x: 0, y: 0 };

function buildLevel(i) {
  const def = lvAt(i);
  const rows = def.map;
  const H = rows.length, W = Math.max(...rows.map((r) => r.length));
  const st = { i, W, H, grid: [], crates: [], guards: [], keys: [], plates: [], portals: { O: [], Q: [] }, flags: [], powers: [], coins: [], vents: [], crushers: [], lamps: [], lampSee: 0, chase: null, checkpoint: null, exit: null, flip: false, plateOpen: false, particles: [], crack: {}, regrow: {}, start: { x: 64, y: 64 }, needKey: false, msgCool: 0, sky: null, layer: null };
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) {
      let c = rows[y][x] || " ";
      if (c === "P") { st.start = { x: x * TS + (TS - PW) / 2, y: y * TS + TS - PH }; c = " "; }
      else if (c === "B") { st.crates.push({ x: x * TS + 1, y: y * TS + 2, w: 30, h: 30, vx: 0, vy: 0, ground: false, pulled: false, stuck: 0 }); c = " "; }
      else if (c === "K") { st.keys.push({ x: x * TS + 16, y: y * TS + 18, taken: false, t: x }); st.needKey = true; c = " "; }
      else if ("TYUV".includes(c)) {
        st.guards.push({ x: x * TS + 6, y: y * TS + TS - 30, w: 20, h: 30, dir: c === "U" ? 1 : -1, kind: c === "T" ? "patrol" : c === "V" ? "watch" : "static", alive: true, wait: 0, seeT: 0, turnT: WATCH_T, anim: hash(x, y) * 10, deadT: 0, alert: 0 });
        c = " ";
      }
      else if (c === "_") st.plates.push({ tx: x, ty: y, pressed: false });
      else if (c === "E") st.exit = { x: x * TS, y: y * TS, w: TS, h: TS };
      else if (c === "O" || c === "Q") st.portals[c].push({ tx: x, ty: y });
      else if (c === "o") { st.coins.push({ x: x * TS + 16, y: y * TS + 16, taken: false }); c = " "; }
      else if (c === "A") st.vents.push({ tx: x, ty: y });
      else if (c === "M") st.crushers.push({ tx: x, ty: y, reach: 0 });
      else if (c === "L") { st.lamps.push({ x: x * TS + 16, y: y * TS + 12 }); c = " "; }
      else if (c === "F") { if (!hard) st.flags.push({ tx: x, ty: y, on: false }); c = " "; }
      else if ((c === "*" || c === "+" || c === "$") && hard && !def.needsPower) c = " ";
      else if (c === "*" || c === "+" || c === "$") { st.powers.push({ kind: c, x: x * TS + 16, y: y * TS + 16, taken: false }); c = " "; }
      if (c === "D") st.needKey = true;
      row.push(c);
    }
    st.grid.push(row);
  }
  if (def.chase) st.chase = { x: st.start.x - 200, v: def.chase * [1, 1.15, 1.3][diff] };
  st.player = { cloak: 0, boots: 0, airJump: false, shield: false, invul: 0, x: st.start.x, y: st.start.y, w: PW, h: PH, vx: 0, vy: 0, ground: false, coyote: 0, jbuf: 0, face: 1, keys: 0, run: 0, scarf: [] };
  for (let k = 0; k < 8; k++) st.player.scarf.push({ x: st.start.x + PW / 2, y: st.start.y + 8 });
  st.hook = { state: "idle", x: 0, y: 0, dx: 0, dy: 0, dist: 0, ax: 0, ay: 0, len: 0, crate: null };
  st.sky = makeSky(i, W);
  // the prerendered map only holds tiles that never change, so a retry reuses it instead of repainting
  const R = touchMode ? 1.5 : 2;
  if (!layerCache || layerCache.i !== i || layerCache.R !== R) layerCache = { i, R, c: prerender(st, R) };
  st.layer = layerCache.c;
  return st;
}

function tileAt(tx, ty) {
  if (tx < 0 || tx >= L.W || ty < 0) return "X";
  if (ty >= L.H) return " ";
  return L.grid[ty][tx];
}
function solidChar(c) {
  switch (c) {
    case "#": case "X": case "D": case "S": case "C": case "J": case "I": case "A": case "N": case ">": case "<": case "M": return true;
    case "G": return !L.flip;
    case "g": return L.flip;
    case "H": return !L.plateOpen;
    default: return false;
  }
}
const isSolid = (tx, ty) => solidChar(tileAt(tx, ty));

// Conveyors (> and <) carry whoever stands on them at BELT_V, so you can never stand still on one.
const BELT_V = 130;
// Crumbling floor (N): cracks FLOOR_CRACK seconds after you step on it, falls away, then regrows like a rotten beam.
const FLOOR_CRACK = 0.45;
// Flame vents (A): a grate in the floor that fires a column of flame up to VENT_H tiles high.
// Each vent runs the same cycle shifted by its column, so a row of vents fires as a wave.
const VENT_T = 2.8, VENT_ON = 1.1, VENT_WARN = 0.45, VENT_H = 3;
// 0 quiet, 1 about to fire, 2 firing
function ventState(tx, t) {
  const u = (t + tx * 0.35) % VENT_T;
  return u < VENT_ON ? 2 : u > VENT_T - VENT_WARN ? 1 : 0;
}
// How many tiles of flame rise above a vent before something solid stops them.
function ventReach(v) {
  let h = 0;
  while (h < VENT_H && !isSolid(v.tx, v.ty - h - 1)) h++;
  return h;
}
// Searchlights (L): a lamp hung from above whose beam sweeps left and right. Standing in the beam
// for LAMP_SEE seconds gets you spotted; walls and roofs cast shadows, and the cloak hides you.
const LAMP_T = 5, LAMP_SWING = 0.6, LAMP_HALF = 0.18, LAMP_LEN = 15 * TS;
const lampAngle = (l, t) => LAMP_SWING * Math.sin((t / LAMP_T) * Math.PI * 2 + l.x * 0.004); // 0 = straight down, + = right
function inLamp(l, px, py, t) {
  const dx = px - l.x, dy = py - l.y;
  if (dy <= 0 || Math.hypot(dx, dy) > LAMP_LEN) return false;
  if (Math.abs(Math.atan2(dx, dy) - lampAngle(l, t)) > LAMP_HALF) return false;
  return segClear(l.x, l.y, px, py, 10, 4, true);
}
// True when no beam touches a player standing anywhere on columns x0..x1 of row ty during the next `secs` seconds (for tests).
function lightClear(x0, x1, ty, secs) {
  for (const l of L.lamps) for (let s = 0; s <= secs; s += 0.05)
    for (let x = x0; x <= x1 + 0.01; x += 0.25) if (inLamp(l, x * TS + 16, ty * TS + 14, runTime + s)) return false;
  return true;
}
// Crushers (M): an iron mount in the ceiling with a stone weight that rests up, shakes, slams down to the
// floor below, sits there, then winches back up. Each column runs the cycle shifted, like the vents.
const CRUSH_T = 3.4, CRUSH_REST = 1.3, CRUSH_WARN = 0.45, CRUSH_FALL = 0.15, CRUSH_SIT = 0.5;
// 0 = fully up, 1 = on the floor
function crushPos(tx, t) {
  const u = (t + tx * 0.5) % CRUSH_T, a = CRUSH_REST + CRUSH_WARN;
  if (u < a) return 0;
  if (u < a + CRUSH_FALL) { const k = (u - a) / CRUSH_FALL; return k * k; }
  if (u < a + CRUSH_FALL + CRUSH_SIT) return 1;
  return 1 - (u - a - CRUSH_FALL - CRUSH_SIT) / (CRUSH_T - a - CRUSH_FALL - CRUSH_SIT);
}
const crushWarn = (tx, t) => { const u = (t + tx * 0.5) % CRUSH_T; return u >= CRUSH_REST && u < CRUSH_REST + CRUSH_WARN; };
// The weight's box; reach = empty tiles below the mount (measured once, when first needed).
function crushBox(c, t) {
  if (!c.reach) { let h = 0; while (h < 30 && !isSolid(c.tx, c.ty + h + 1)) h++; c.reach = Math.max(1, h); }
  const y = (c.ty + 1) * TS + crushPos(c.tx, t) * (c.reach - 1) * TS;
  return { x: c.tx * TS + 2, y, w: TS - 4, h: TS };
}
// True when no crusher in columns x0..x1 leaves its resting place within the next `secs` seconds (for tests).
function crushClear(x0, x1, secs) {
  for (const c of L.crushers) if (c.tx >= x0 && c.tx <= x1)
    for (let s = 0; s <= secs; s += 0.05) if (crushPos(c.tx, runTime + s) > 0) return false;
  return true;
}
// True when a runner leaving column x0 now at v tiles/s (negative = leftward) reaches column x1 without
// passing under a weight that is off its rest; checked at a few speeds around v for slack (for tests).
function crushRun(x0, x1, v) {
  for (const k of [0.7, 0.85, 1, 1.15]) {
    const sp = v * k, T = Math.abs((x1 - x0) / sp);
    for (let s = 0; s <= T; s += 0.03) {
      const x = x0 + sp * s + 0.28;
      for (const c of L.crushers) if (Math.abs(c.tx + 0.5 - x) < 1.15 && crushPos(c.tx, runTime + s) > 0) return false;
    }
  }
  return true;
}
// True when no vent in columns x0..x1 fires within the next `secs` seconds (used by tests to time a crossing).
function ventClear(x0, x1, secs) {
  for (const v of L.vents) if (v.tx >= x0 && v.tx <= x1)
    for (let s = 0; s <= secs; s += 0.05) if (ventState(v.tx, runTime + s) === 2) return false;
  return true;
}

// ---------- collision ----------
function blockers(box, self) {
  const out = [];
  const x0 = Math.floor(box.x / TS), x1 = Math.floor((box.x + box.w - 0.001) / TS);
  const y0 = Math.floor(box.y / TS), y1 = Math.floor((box.y + box.h - 0.001) / TS);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++)
      if (isSolid(tx, ty)) out.push({ x: tx * TS, y: ty * TS, w: TS, h: TS, tile: true });
  for (const c of L.crates) if (c !== self && overlap(box, c)) out.push(c);
  return out;
}
// Moves a box along one axis in small steps. Anything the box already overlapped is ignored,
// so a gate that closes on top of you never traps you.
function moveAxis(b, axis, amt) {
  let remaining = amt;
  const size = axis === "x" ? "w" : "h";
  while (Math.abs(remaining) > 1e-6) {
    const s = clamp(remaining, -6, 6);
    // shrunk copy of the old box: float-sized overlaps must not count as "already inside"
    const core = { x: b.x + 0.5, y: b.y + 0.5, w: b.w - 1, h: b.h - 1 };
    b[axis] += s;
    let bl = blockers(b, b).filter((r) => !overlap(core, r));
    if (bl.length && b === L.player && axis === "x" && bl.every((r) => !r.tile)) {
      for (const c of bl) moveAxis(c, "x", s);
      bl = blockers(b, b).filter((r) => !overlap(core, r));
    }
    if (bl.length) {
      if (s > 0) b[axis] = Math.min(...bl.map((r) => r[axis])) - b[size];
      else b[axis] = Math.max(...bl.map((r) => r[axis] + r[size]));
      return true;
    }
    remaining -= s;
  }
  return false;
}
const onGround = (b) => blockers({ x: b.x, y: b.y + 1, w: b.w, h: b.h }, b).some((r) => !overlap(b, r));

function pointBlocked(x, y, withCrates) {
  if (isSolid(Math.floor(x / TS), Math.floor(y / TS))) return true;
  if (withCrates) for (const c of L.crates) if (inRect(x, y, c)) return true;
  return false;
}
function segClear(x0, y0, x1, y1, skipA, skipB, withCrates) {
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy);
  if (d < 1) return true;
  for (let t = skipA; t < d - skipB; t += 5) if (pointBlocked(x0 + dx * t / d, y0 + dy * t / d, withCrates)) return false;
  return true;
}
function rayLen(x, y, dx, dy, max) {
  for (let t = 0; t < max; t += 5) if (pointBlocked(x + dx * t, y + dy * t, true)) return t;
  return max;
}

// ---------- hook ----------
function handPos() { const p = L.player; return { x: p.x + p.w / 2, y: p.y + p.h / 2 - 4 }; }
function mouseWorld() { return { x: mouse.sx / scale + cam.x, y: mouse.sy / scale + cam.y }; }

function testPoint(x, y) {
  for (const c of L.crates) if (inRect(x, y, c)) return { kind: "crate", c };
  for (const g of L.guards) if (g.alive && inRect(x, y, g)) return { kind: "guard", g };
  const tx = Math.floor(x / TS), ty = Math.floor(y / TS), ch = tileAt(tx, ty);
  if (solidChar(ch)) return { kind: ch === "#" || ch === "C" ? "anchor" : ch === "S" ? "switch" : "steel", tx, ty };
  return null;
}
function probeDir(o, ang) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  for (let t = 4; t <= HOOK_RANGE; t += 4) {
    const x = o.x + dx * t, y = o.y + dy * t, hit = testPoint(x, y);
    if (hit) {
      if (hit.kind === "guard") hit.back = hit.g.dir * (o.x - (hit.g.x + hit.g.w / 2)) < 0;
      return { x, y, ox: o.x, oy: o.y, dx, dy, hit };
    }
  }
  return { x: o.x + dx * HOOK_RANGE, y: o.y + dy * HOOK_RANGE, ox: o.x, oy: o.y, dx, dy, hit: null };
}
const usefulHit = (h) => !!h && (h.kind === "anchor" || h.kind === "switch" || h.kind === "crate" || (h.kind === "guard" && h.back));
// A fingertip is imprecise, so on touch screens the aim snaps to the nearest useful target within ~16 degrees.
function probeAim() {
  const o = handPos(), m = mouseWorld();
  const base = Math.atan2(m.y - o.y, m.x - o.x);
  const a = probeDir(o, base);
  if (touchMode && !usefulHit(a.hit)) {
    for (let k = 1; k <= 8; k++) for (const sg of [1, -1]) {
      const b = probeDir(o, base + sg * k * 0.035);
      if (usefulHit(b.hit)) return b;
    }
  }
  return a;
}

// Auto-aim for the touch hook button: sweep the upper half-circle and pick the best target,
// favouring wooden anchors up and ahead of the player and skipping the beam already held.
function autoTarget() {
  const o = handPos(), p = L.player, h = L.hook;
  const dir = keys.TouchLeft ? -1 : keys.TouchRight ? 1 : p.face || 1;
  const want = -Math.PI / 2 + dir * 0.75;
  let best = null, bestScore = Infinity;
  for (let a = -Math.PI - 0.25; a <= 0.25; a += 0.02) {
    const r = probeDir(o, a);
    if (!usefulHit(r.hit)) continue;
    const d = Math.hypot(r.x - o.x, r.y - o.y);
    if (d < 40) continue;
    if (h.state === "attached" && Math.hypot(r.x - h.ax, r.y - h.ay) < 56) continue;
    let diff = Math.abs(a - want); if (diff > Math.PI) diff = 2 * Math.PI - diff;
    let score = diff * 2 + Math.abs(d - 200) / 160 + (r.hit.kind === "anchor" ? 0 : 1.2);
    if (h.state === "attached" && dir * (r.x - h.ax) < 32) score += 1.5;
    if (score < bestScore) { bestScore = score; best = r; }
  }
  return best;
}
function fireAuto() {
  if (mode !== "play") return;
  const a = autoTarget();
  if (!a) { sfx.clank(); return; }
  const h = L.hook, o = handPos();
  if (h.state === "pulling" && h.crate) h.crate.pulled = false;
  Object.assign(h, { state: "flying", x: o.x, y: o.y, dx: a.dx, dy: a.dy, dist: 0, crate: null, ox: o.x });
  sfx.fire();
}
function fireHook() {
  const h = L.hook, o = handPos(), m = mouseWorld();
  if (Math.hypot(m.x - o.x, m.y - o.y) < 2) return;
  const a = probeAim();
  if (h.state === "pulling" && h.crate) h.crate.pulled = false;
  Object.assign(h, { state: "flying", x: o.x, y: o.y, dx: a.dx, dy: a.dy, dist: 0, crate: null, ox: o.x });
  sfx.fire();
}
function releaseHook() {
  if (!L) return;
  const h = L.hook;
  if (h.state === "attached") { h.state = "retract"; h.x = h.ax; h.y = h.ay; }
  else if (h.state === "pulling") { if (h.crate) h.crate.pulled = false; h.state = "retract"; }
  else if (h.state === "flying") h.state = "retract";
}

function updateHook(dt) {
  const h = L.hook, p = L.player, o = handPos();
  if (h.state === "flying") {
    let travel = HOOK_SPEED * dt;
    while (travel > 0) {
      const s = Math.min(4, travel); travel -= s;
      h.x += h.dx * s; h.y += h.dy * s; h.dist += s;
      const hit = testPoint(h.x, h.y);
      if (hit) { onHookHit(hit); return; }
      if (h.dist >= HOOK_RANGE) { h.state = "retract"; return; }
    }
  } else if (h.state === "retract") {
    const dx = o.x - h.x, dy = o.y - h.y, d = Math.hypot(dx, dy);
    const s = 2600 * dt;
    if (d <= s + 6) h.state = "idle";
    else { h.x += dx / d * s; h.y += dy / d * s; }
  } else if (h.state === "attached") {
    if (!segClear(o.x, o.y, h.ax, h.ay, 10, 7, false)) { h.state = "retract"; h.x = h.ax; h.y = h.ay; burst(h.ax, h.ay, 6, ropeColor(runTime), 120); }
  } else if (h.state === "pulling") {
    const c = h.crate;
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    const dx = o.x - cx, dy = o.y - cy, d = Math.hypot(dx, dy);
    h.x = cx; h.y = cy;
    if (d < 50 || !segClear(o.x, o.y, cx, cy, 10, 20, false)) {
      c.pulled = false; c.vx = (dx / d) * 40; c.vy = 0; h.state = "retract";
    } else {
      c.vx = (dx / d) * PULL_SPEED; c.vy = (dy / d) * PULL_SPEED;
      if (c.moved < 0.3) { c.stuck += dt; if (c.stuck > 0.3) { c.pulled = false; h.state = "retract"; } }
      else c.stuck = 0;
    }
  }
}

function onHookHit(hit) {
  buzz(12);
  const h = L.hook, o = handPos();
  if (hit.kind === "anchor") {
    let ax = h.x, ay = h.y;
    for (let k = 0; k < 8 && pointBlocked(ax, ay, false); k++) { ax -= h.dx; ay -= h.dy; }
    h.ax = ax; h.ay = ay; h.state = "attached"; h.tx = hit.tx; h.ty = hit.ty;
    if (tileAt(hit.tx, hit.ty) === "C") { const k = hit.tx + "," + hit.ty; if (!(k in L.crack)) L.crack[k] = CRACK_T; }
    h.len = clamp(Math.hypot(o.x - ax, o.y - ay), ROPE_MIN, ROPE_MAX);
    bump("hooks");
    burst(ax, ay, 5, ropeColor(runTime), 90);
    sfx.attach();
  } else if (hit.kind === "switch") {
    L.flip = !L.flip;
    h.state = "retract";
    burst(h.x, h.y, 12, L.flip ? "#d0583f" : "#3fa7a0", 160);
    sfx.toggle();
  } else if (hit.kind === "crate") {
    h.state = "pulling"; h.crate = hit.c; hit.c.pulled = true; hit.c.stuck = 0; hit.c.moved = 1;
    sfx.pull();
  } else if (hit.kind === "guard") {
    const g = hit.g;
    h.state = "retract";
    if (g.dir * (o.x - (g.x + g.w / 2)) < 0) killGuard(g);
    else { g.seeT = SEE_LIMIT; detected(g); }
  } else {
    h.state = "retract";
    burst(h.x - h.dx * 3, h.y - h.dy * 3, 6, "#c9d3ea", 140);
    sfx.clank();
  }
}

// ---------- player ----------
function updatePlayer(dt) {
  const p = L.player, h = L.hook;
  const left = keys.KeyA || keys.ArrowLeft || keys.TouchLeft, right = keys.KeyD || keys.ArrowRight || keys.TouchRight;
  const up = keys.KeyW || keys.ArrowUp || keys.TouchUp, down = keys.KeyS || keys.ArrowDown || keys.TouchDown;
  const ix = (right ? 1 : 0) - (left ? 1 : 0);
  const hooked = h.state === "attached";
  p.ground = onGround(p);
  // crumbling floor (N): the slab under your feet starts to crack the moment you stand on it
  if (p.ground) {
    const ty = Math.floor((p.y + p.h + 1) / TS);
    for (let tx = Math.floor(p.x / TS); tx <= Math.floor((p.x + p.w - 0.01) / TS); tx++)
      if (tileAt(tx, ty) === "N") { const k = tx + "," + ty; if (!(k in L.crack)) { L.crack[k] = FLOOR_CRACK; sfx.crack(); } }
  }

  if (jumpQueued) { p.jbuf = 0.18; jumpQueued = false; } else p.jbuf -= dt;
  if (p.ground) p.coyote = 0.15 * (skin().coyote || 1); else p.coyote -= dt;

  if (p.ground) {
    // ice: slow to start, slow to stop
    const fy = Math.floor((p.y + p.h + 1) / TS);
    const onIce = tileAt(Math.floor((p.x + p.w / 2) / TS), fy) === "I";
    p.vx = onIce ? approach(p.vx, ix * RUN * 1.1, (ix ? 520 : 260) * dt) : approach(p.vx, ix * RUN, ACC_G * dt);
  } else if (hooked) {
    if (ix) {
      const o = handPos();
      let nx = o.x - h.ax, ny = o.y - h.ay; const d = Math.hypot(nx, ny) || 1; nx /= d; ny /= d;
      let tx = -ny, ty = nx; if (tx < 0) { tx = -tx; ty = -ty; }
      p.vx += tx * ix * SWING_ACC * dt; p.vy += ty * ix * SWING_ACC * dt;
    }
  } else if (ix) {
    if (Math.sign(p.vx) !== ix || Math.abs(p.vx) < RUN) p.vx = approach(p.vx, ix * RUN, ACC_A * dt);
  } else {
    p.vx = approach(p.vx, 0, 700 * dt);
  }
  if (ix) p.face = ix; else if (Math.abs(p.vx) > 40) p.face = Math.sign(p.vx);

  p.vy = Math.min(p.vy + GRAV * dt, MAXFALL);

  if (p.jbuf > 0) {
    if (hooked) {
      releaseHook();
      p.vy = Math.min(p.vy - 160, -470); p.vx *= 1.08; p.hookJump = true;
      p.jbuf = 0; sfx.jump();
      burst(p.x + p.w / 2, p.y + p.h, 6, "#e9e3d3", 80);
    } else if (p.coyote > 0) {
      p.vy = -JUMP; p.coyote = 0; p.jbuf = 0; sfx.jump();
    } else if (p.boots > 0 && p.airJump) {
      p.vy = -JUMP * 0.95; p.airJump = false; p.jbuf = 0; sfx.jump();
      burst(p.x + p.w / 2, p.y + p.h, 10, "#9fe0ff", 120);
    }
  }
  if (p.ground) { p.hookJump = false; p.airJump = true; }
  if (hooked) p.airJump = true;
  if (p.cloak > 0) p.cloak -= dt;
  if (p.boots > 0) p.boots -= dt;
  if (p.invul > 0) p.invul -= dt;
  if (p.vy >= 0) p.boost = false;
  if (!keys.Space && p.vy < -260 && !hooked && !p.ground && !p.hookJump && !p.boost) p.vy += GRAV * 0.9 * dt;

  if (hooked) {
    if (up) h.len = Math.max(ROPE_MIN, h.len - REEL * dt);
    if (down) h.len = Math.min(ROPE_MAX, h.len + REEL * dt);
    const o = handPos();
    let nx = o.x - h.ax, ny = o.y - h.ay; const d = Math.hypot(nx, ny) || 1; nx /= d; ny /= d;
    if (d >= h.len - 0.5) {
      const vr = p.vx * nx + p.vy * ny;
      if (vr > 0) { p.vx -= nx * vr; p.vy -= ny * vr; }
    }
  }

  // updraft: rising air pushes you up while you are inside it
  let inWind = false;
  for (let ty = Math.floor(p.y / TS); ty <= Math.floor((p.y + p.h - 1) / TS); ty++)
    for (let tx = Math.floor(p.x / TS); tx <= Math.floor((p.x + p.w - 1) / TS); tx++)
      if (tileAt(tx, ty) === "W") inWind = true;
  // falling bodies are caught hard so a drop into the column is never a straight fall-through
  if (inWind) { p.vy = approach(p.vy, -WIND_UP, (p.vy > 0 ? WIND_ACC * 3 : WIND_ACC) * dt); p.boost = true; }
  // with no input the air column holds you in place instead of letting momentum carry you out
  if (inWind && !ix && !hooked) p.vx = approach(p.vx, 0, 1400 * dt);

  // conveyor (> or <): standing on it carries you along on top of your own running
  // and leaving it (by jumping or running off the end) keeps the belt's speed as momentum
  if (p.ground && !hooked) {
    const belt = tileAt(Math.floor((p.x + p.w / 2) / TS), Math.floor((p.y + p.h + 1) / TS));
    p.carry = belt === ">" ? BELT_V : belt === "<" ? -BELT_V : 0;
    if (p.carry) moveAxis(p, "x", p.carry * dt);
  } else if (p.carry) { p.vx += p.carry; p.carry = 0; }
  const fallV = p.vy;
  if (moveAxis(p, "x", p.vx * dt)) p.vx = 0;
  if (moveAxis(p, "y", p.vy * dt)) p.vy = 0;
  // spring pad: landing on top throws you high
  if (fallV > 0 && p.vy === 0) {
    const fy = Math.floor((p.y + p.h + 1) / TS);
    for (let tx = Math.floor((p.x + 2) / TS); tx <= Math.floor((p.x + p.w - 3) / TS); tx++)
      if (tileAt(tx, fy) === "J") {
        p.vy = -SPRING; p.boost = true; p.coyote = 0; sfx.spring();
        L.springT = L.springT || {}; L.springT[tx + "," + fy] = 0.25;
        burst(p.x + p.w / 2, p.y + p.h, 8, "#7fd1c4", 120);
        break;
      }
  }
  // teleport doors: stepping into one puts you at its twin; you must leave the door before it works again
  {
    const cx = Math.floor((p.x + p.w / 2) / TS), cy = Math.floor((p.y + p.h / 2) / TS), ch = tileAt(cx, cy);
    if ((ch === "O" || ch === "Q") && !p.portalLock) {
      const twin = L.portals[ch].find((q) => q.tx !== cx || q.ty !== cy);
      if (twin) {
        burst(p.x + p.w / 2, p.y + p.h / 2, 12, ch === "O" ? "#b48cf0" : "#f0a0c0", 160);
        p.x = twin.tx * TS + (TS - p.w) / 2; p.y = twin.ty * TS + TS - p.h - 1;
        if (h.state !== "idle") h.state = "idle";
        p.portalLock = true; sfx.warp();
        burst(p.x + p.w / 2, p.y + p.h / 2, 12, ch === "O" ? "#b48cf0" : "#f0a0c0", 160);
      }
    } else if (ch !== "O" && ch !== "Q") p.portalLock = false;
  }

  if (h.state === "attached") {
    const o = handPos();
    let nx = o.x - h.ax, ny = o.y - h.ay; const d = Math.hypot(nx, ny) || 1; nx /= d; ny /= d;
    if (d > h.len) {
      const k = d - h.len;
      moveAxis(p, "x", -nx * k);
      moveAxis(p, "y", -ny * k);
      const d2 = Math.hypot(handPos().x - h.ax, handPos().y - h.ay);
      if (d2 - h.len > 40) h.len = d2 - 40;
    }
  }

  if (p.ground && Math.abs(p.vx) > 20) p.run += dt * Math.abs(p.vx) / 18;

  // scarf
  const s = p.scarf;
  s[0].x = p.x + p.w / 2 - p.face * 3; s[0].y = p.y + 9;
  for (let k = 1; k < s.length; k++) {
    const a = s[k - 1], b = s[k];
    b.y += 28 * dt; b.x -= p.face * 6 * dt;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    b.x = a.x + dx / d * 3.6; b.y = a.y + dy / d * 3.6;
  }
}

// ---------- world ----------
function updateCrates(dt) {
  for (const c of L.crates) {
    if (!c.pulled) {
      c.vy = Math.min(c.vy + GRAV * dt, MAXFALL);
      if (c.ground) c.vx = approach(c.vx, 0, 1600 * dt);
    }
    const ox = c.x, oy = c.y;
    if (moveAxis(c, "x", c.vx * dt)) c.vx = 0;
    if (moveAxis(c, "y", c.vy * dt)) c.vy = 0;
    c.ground = onGround(c);
    c.moved = Math.hypot(c.x - ox, c.y - oy);
  }
}

function canSee(g) {
  const p = L.player;
  if (p.cloak > 0 || p.invul > 0) return false;
  const ex = g.x + g.w / 2 + g.dir * 4, ey = g.y + 8;
  const pts = [[p.x + p.w / 2, p.y + p.h / 2], [p.x + p.w / 2, p.y + 4]];
  for (const [px, py] of pts) {
    const dx = px - ex, dy = py - ey;
    if (dx * g.dir <= 0) continue;
    if (Math.hypot(dx, dy) > VIS) continue;
    if (Math.atan2(Math.abs(dy), Math.abs(dx)) > VIS_HALF) continue;
    if (segClear(ex, ey, px, py, 0, 0, true)) return true;
  }
  return false;
}

function updateGuards(dt) {
  const p = L.player;
  for (const g of L.guards) {
    if (!g.alive) { g.deadT += dt; continue; }
    g.anim += dt;
    if (g.kind === "patrol") {
      if (g.wait > 0) { g.wait -= dt; if (g.wait <= 0) g.dir *= -1; }
      else {
        const nx = g.x + g.dir * PATROL_V * dt;
        const fx = g.dir > 0 ? nx + g.w + 1 : nx - 1;
        const tx = Math.floor(fx / TS), tyMid = Math.floor((g.y + g.h / 2) / TS), tyFeet = Math.floor((g.y + g.h - 2) / TS), tyBelow = Math.floor((g.y + g.h + 2) / TS);
        const crateAhead = L.crates.some((c) => inRect(fx, g.y + g.h / 2, c));
        const block = isSolid(tx, tyMid) || !isSolid(tx, tyBelow) || tileAt(tx, tyMid) === "!" || tileAt(tx, tyFeet) === "^" || crateAhead;
        if (block) g.wait = 1.1; else g.x = nx;
      }
    } else if (g.kind === "watch") {
      g.turnT -= dt;
      if (g.turnT <= 0) { g.dir *= -1; g.turnT = WATCH_T; }
    }
    if (mode === "play" && canSee(g)) { g.seeT += dt; if (g.seeT >= SEE_LIMIT) detected(g); }
    else g.seeT = Math.max(0, g.seeT - dt * 0.7);

    if (mode === "play" && overlap(p, g)) {
      const behind = g.dir * ((p.x + p.w / 2) - (g.x + g.w / 2)) < 0;
      const above = p.vy > 40 && p.y + p.h - g.y < 16;
      if (behind || above || p.cloak > 0) { killGuard(g); if (above) p.vy = -280; }
      else detected(g);
    }
  }
}

function killGuard(g) {
  if (!g.alive) return;
  g.alive = false; g.deadT = 0; bump("kills");
  burst(g.x + g.w / 2, g.y + 10, 18, "#8f2a2a", 220);
  burst(g.x + g.w / 2, g.y + 10, 8, "#e9e3d3", 160);
  sfx.kill();
  const left = L.guards.filter((q) => q.alive).length;
  toast(left ? `처치 · 남은 경비 ${left}` : "모든 경비 처치");
}
function detected(g) {
  if (mode !== "play" || L.player.invul > 0) return;
  g.alert = 1;
  sfx.alert();
  die("발각되었다");
}
function die(reason) {
  if (mode !== "play") return;
  const fell = reason === "추락했다";
  if (!fell && L.player.invul > 0) return;
  if (!fell && L.player.shield) {
    const q = L.player;
    q.shield = false; q.invul = 1.5; q.vy = -480;
    for (const g of L.guards) g.seeT = 0;
    burst(q.x + q.w / 2, q.y + q.h / 2, 18, "#ffd47a", 200);
    sfx.key(); buzz(25); toast("부적이 막아 주었다");
    return;
  }
  setMode("dead"); deadT = 0; runDeaths++; if (run) run.deaths++;
  bump("deaths"); save.stats.clean = 0; writeSave();
  const p = L.player;
  burst(p.x + p.w / 2, p.y + p.h / 2, 26, "#0d0d12", 260);
  burst(p.x + p.w / 2, p.y + p.h / 2, 10, "#c8423b", 200);
  L.hook.state = "idle";
  sfx.die();
  buzz([30, 40, 30]);
  toast(reason, true);
}

function updateWorld(dt) {
  const p = L.player;
  // plates
  const bodies = [p, ...L.crates];
  let allPressed = L.plates.length > 0;
  for (const pl of L.plates) {
    const r = { x: pl.tx * TS + 2, y: pl.ty * TS + TS - 8, w: TS - 4, h: 8 };
    const was = pl.pressed;
    pl.pressed = bodies.some((b) => overlap(b, r));
    if (pl.pressed !== was) sfx.plate();
    if (!pl.pressed) allPressed = false;
  }
  if (allPressed !== L.plateOpen) { L.plateOpen = allPressed; sfx.door(); }

  if (mode !== "play") return;
  // hazards
  const x0 = Math.floor(p.x / TS), x1 = Math.floor((p.x + p.w) / TS), y0 = Math.floor(p.y / TS), y1 = Math.floor((p.y + p.h) / TS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++)
    if (tileAt(tx, ty) === "^" && overlap(p, { x: tx * TS + 4, y: ty * TS + 16, w: TS - 8, h: TS - 16 })) { die("가시에 찔렸다"); return; }
  if (L.lamps.length) {
    const lit = p.cloak <= 0 && p.invul <= 0 && L.lamps.some((l) => inLamp(l, p.x + p.w / 2, p.y + p.h / 2, runTime) || inLamp(l, p.x + p.w / 2, p.y + 4, runTime));
    L.lampSee = lit ? L.lampSee + dt : Math.max(0, L.lampSee - dt * 0.7);
    if (L.lampSee >= (hard ? 0.18 : 0.25)) { sfx.alert(); die("탐조등에 들켰다"); return; }
  }
  for (const v of L.vents) {
    if (ventState(v.tx, runTime) !== 2) continue;
    const h = ventReach(v);
    if (h && overlap(p, { x: v.tx * TS + 5, y: (v.ty - h) * TS + 4, w: TS - 10, h: h * TS - 4 })) { die("불기둥에 휩싸였다"); return; }
  }
  for (const c of L.crushers) {
    const b = crushBox(c, runTime);
    if (crushPos(c.tx, runTime) > 0 && overlap(p, { x: b.x + 2, y: b.y, w: b.w - 4, h: b.h - 2 })) { die("돌절구에 깔렸다"); return; }
  }
  if (p.y > L.H * TS + 60) { die("추락했다"); return; }

  // coins
  for (const c of L.coins) if (!c.taken && Math.hypot(p.x + p.w / 2 - c.x, p.y + p.h / 2 - c.y) < 22 + (skin().magnet || 0)) {
    c.taken = true; bump("coins"); sfx.plate(); burst(c.x, c.y, 10, "#ffd47a", 120);
    const left = L.coins.filter((q) => !q.taken).length;
    toast(left ? `금화 ${L.coins.length - left}/${L.coins.length}` : "금화를 모두 모았다 · 출구가 열렸다");
  }
  // chasing fire
  if (L.chase) {
    const ch = L.chase;
    // never fall too far behind the player, so idling is never safe
    ch.x = Math.max(ch.x + ch.v * dt, p.x - 360);
    if (p.x + 4 < ch.x) { die("불길에 휩싸였다"); return; }
  }
  // power-ups
  for (const pw of L.powers) if (!pw.taken && Math.hypot(p.x + p.w / 2 - pw.x, p.y + p.h / 2 - pw.y) < 24 + (skin().magnet || 0)) {
    pw.taken = true; sfx.key(); buzz(15);
    burst(pw.x, pw.y, 16, POWER[pw.kind].color, 160);
    if (pw.kind === "*") p.cloak = 8 * (skin().power || 1);
    if (pw.kind === "+") { p.boots = 12 * (skin().power || 1); p.airJump = true; }
    if (pw.kind === "$") p.shield = true;
    toast(POWER[pw.kind].name + " · " + (skin().power && pw.kind !== "$" ? POWER[pw.kind].desc.replace(/\d+초/, (m) => Math.round(parseInt(m) * skin().power) + "초") : POWER[pw.kind].desc));
  }
  // checkpoint flags
  for (const f of L.flags) if (!f.on && overlap(p, { x: f.tx * TS + 6, y: f.ty * TS - 16, w: 20, h: 48 })) {
    for (const o of L.flags) o.on = false;
    f.on = true; L.checkpoint = { x: f.tx * TS + (TS - PW) / 2, y: f.ty * TS + TS - PH };
    sfx.key(); toast("체크포인트"); burst(f.tx * TS + 16, f.ty * TS + 4, 12, "#7fd1c4", 120);
  }
  // keys
  for (const k of L.keys) if (!k.taken && Math.hypot(p.x + p.w / 2 - k.x, p.y + p.h / 2 - k.y) < 22 + (skin().magnet || 0)) {
    k.taken = true; p.keys++; burst(k.x, k.y, 14, "#e8c15a", 150); sfx.key(); toast("열쇠를 얻었다");
  }
  // doors
  if (p.keys > 0) {
    const r = { x: p.x - 4, y: p.y - 18, w: p.w + 8, h: p.h + 20 };
    for (let ty = Math.floor(r.y / TS); ty <= Math.floor((r.y + r.h) / TS); ty++)
      for (let tx = Math.floor(r.x / TS); tx <= Math.floor((r.x + r.w) / TS); tx++)
        if (tileAt(tx, ty) === "D" && overlap(r, { x: tx * TS, y: ty * TS, w: TS, h: TS })) { openDoor(tx, ty); p.keys--; return; }
  }
  // exit
  L.msgCool -= dt;
  if (L.exit && overlap(p, L.exit)) {
    const coinsLeft = L.coins.filter((c) => !c.taken).length;
    if (L.guards.some((g) => g.alive)) {
      if (L.msgCool <= 0) { toast("아직 경비가 남아 있다", true); L.msgCool = 2; }
    } else if (coinsLeft) {
      if (L.msgCool <= 0) { toast(`금화가 ${coinsLeft}개 남았다`, true); L.msgCool = 2; }
    } else win();
  }
}
function openDoor(tx, ty) {
  const stack = [[tx, ty]];
  while (stack.length) {
    const [x, y] = stack.pop();
    if (tileAt(x, y) !== "D") continue;
    L.grid[y][x] = " ";
    burst(x * TS + 16, y * TS + 16, 10, "#b88a3e", 140);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  sfx.door(); toast("문이 열렸다");
}

function updateSprings(dt) {
  if (!L.springT) return;
  for (const k in L.springT) { L.springT[k] -= dt; if (L.springT[k] <= 0) delete L.springT[k]; }
}
function updateCrumble(dt) {
  const h = L.hook;
  for (const k in L.crack) {
    L.crack[k] -= dt;
    if (L.crack[k] > 0) continue;
    delete L.crack[k];
    const [x, y] = k.split(",").map(Number);
    const floor = L.grid[y][x] === "N";
    L.grid[y][x] = floor ? "n" : "c"; L.regrow[k] = REGROW_T;
    burst(x * TS + 16, y * TS + 16, 14, floor ? "#7d8db0" : "#8b6a4c", 150);
    sfx.crack();
    if (h.state === "attached" && h.tx === x && h.ty === y) { h.state = "retract"; h.x = h.ax; h.y = h.ay; }
  }
  for (const k in L.regrow) {
    L.regrow[k] -= dt;
    if (L.regrow[k] > 0) continue;
    const [x, y] = k.split(",").map(Number);
    const r = { x: x * TS, y: y * TS, w: TS, h: TS };
    if (overlap(L.player, r) || L.crates.some((c) => overlap(c, r))) continue;
    delete L.regrow[k];
    L.grid[y][x] = L.grid[y][x] === "n" ? "N" : "C";
  }
}

// ---------- particles ----------
function burst(x, y, n, color, spd) {
  if (!L) return;
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, s = spd * (0.3 + Math.random() * 0.7);
    L.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - spd * 0.3, life: 0.5 + Math.random() * 0.5, max: 1, color, size: 1.5 + Math.random() * 2.5 });
  }
}
function updateParticles(dt) {
  const ps = L.particles;
  for (let k = ps.length - 1; k >= 0; k--) {
    const q = ps[k];
    q.vy += 900 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt;
    if (q.life <= 0) ps.splice(k, 1);
  }
}


// ---------- flow ----------
function startLevel(i, keepStats) {
  cur = i;
  L = buildLevel(i);
  if (skin().shield) L.player.shield = true;
  if (!keepStats) {
    runTime = 0; runDeaths = 0; showCard(); ghostRec = [];
    const g = ghosts[ghostId(i)];
    ghostPlay = g && !daily ? g.d.split(",").map((v) => parseInt(v, 36)) : null;
  }
  setMode("play");
  jumpQueued = false;
  setState({ overlay: null, hudShown: true });
  keepAwake(true);
  fadeGoal();
  update("hud", {
    act: (i === BONUS_I ? "보너스 · 초고난도" : ACTS[i] + " / " + LEVELS.length) + (hard ? ` · ${DIFF_NAME[diff]} 모드` : "") + (daily ? ` · 오늘의 도전(${DAILY_MODS[daily.mod].name})` : ""),
    hard, master, name: lvAt(i).name, goal: lvAt(i).goal,
  });
  syncHintText();
  snapCamera();
  hudKey = "";
  updateHUD();
  touchAim = null;
  requestAnimationFrame(() => { measurePads(); snapCameraOnly(); });
  if (!keepStats) showHint();
}
// Pause: the clock (and the speedrun clock) only runs in play/dead, so nothing ticks here.
function pauseGame() {
  if (mode !== "play") return;
  setMode("pause");
  for (const k in keys) keys[k] = false;
  resetTouch(); touchAim = null;
  update("pause", { act: actAt(cur) + " · " + lvAt(cur).name + (run ? ` · 스피드런 ${run.t.toFixed(1)}초` : "") });
  setState({ overlay: "pause" });
}
function resumeGame() {
  if (mode !== "pause") return;
  setMode("play");
  setState({ overlay: null });
}
// Keep the phone screen on while playing.
let wakeLock = null;
function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock && document.visibilityState === "visible") {
      navigator.wakeLock.request("screen").then((l) => { wakeLock = l; l.addEventListener("release", () => { wakeLock = null; }); }).catch(() => {});
    } else if (!on && wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  } catch (e) {}
}
// Dying after a checkpoint keeps the world (keys, doors, defeated guards) and only moves you back.
const POWER = {
  "*": { name: "그림자 망토", desc: "8초 투명 · 아무 쪽에서나 처치", color: "#b48cf0" },
  "+": { name: "바람 신발", desc: "12초 2단 점프", color: "#9fe0ff" },
  "$": { name: "수호 부적", desc: "1회 보호", color: "#ffd47a" },
};
function respawnAtCheckpoint() {
  const p = L.player, c = L.checkpoint;
  Object.assign(p, { x: c.x, y: c.y, vx: 0, vy: 0, coyote: 0, jbuf: 0, boost: false, portalLock: true, cloak: 0, boots: 0, shield: !!skin().shield, invul: 0, carry: 0 });
  for (const pw of L.powers) pw.taken = false;
  if (L.chase) L.chase.x = c.x - 200;
  for (const k of p.scarf) { k.x = p.x + p.w / 2; k.y = p.y + 8; }
  Object.assign(L.hook, { state: "idle", crate: null });
  for (const g of L.guards) { g.seeT = 0; g.alert = 0; }
  jumpQueued = false; touchAim = null;
  setMode("play");
  snapCamera();
}
function restartLevel() { if (L) startLevel(cur, true); }
function nextLevel() {
  if (cur === BONUS_I) showMenu();
  else if (cur === EPILOGUE_AFTER && !save.story.end) { const i = cur + 1; showStory("end", i < LEVELS.length ? () => beginLevel(i) : null); }
  else if (cur + 1 < LEVELS.length) beginLevel(cur + 1);
  else showMenu();
}
// Normal play opens each chapter with its story the first time; speedruns and the daily challenge skip it.
function beginLevel(i) {
  const c = chapterAt(i);
  if (c >= 0 && !save.story[c] && !run && !daily) showStory(c, () => startLevel(i, false));
  else startLevel(i, false);
}
// The epilogue closes the Black Moon story after stage 300; later chapters begin a new one.
const EPILOGUE_AFTER = Math.min(299, LEVELS.length - 1);
let storyThen = null, storyKey = null;
function showStory(key, then) {
  const ch = key === "end" ? EPILOGUE : CHAPTERS[key];
  storyThen = then; storyKey = key;
  setMode("story");
  keepAwake(false);
  update("story", { label: key === "end" ? "에필로그" : `제${key + 1}장`, title: ch.title, lines: ch.lines, n: (getState().story.n || 0) + 1 });
  setState({ overlay: "story", hudShown: false });
}
export function storyContinue() {
  if (mode !== "story") return;
  if (!save.story[storyKey]) { save.story[storyKey] = true; writeSave(); }
  const then = storyThen; storyThen = null;
  if (then) then(); else showMenu();
}
export function readStory(key) { ensureAudio(); showStory(key, null); }
// Speedrun: a range of stages played back to back on one in-game clock.
let run = null;
const SEGMENTS = [[0, LEVELS.length - 1]];
for (let a = 0; a < LEVELS.length; a += 10) SEGMENTS.push([a, Math.min(LEVELS.length, a + 10) - 1]);
const segKey = (a, b) => a + "-" + b;
function startRun(a, b) {
  run = { a, b, t: 0, deaths: 0, done: false };
  startLevel(a, false);
}
function startDaily() {
  run = null; daily = todaysDaily(); applyDifficulty();
  startLevel(daily.lvl, false);
  toast(`오늘의 도전 · ${DAILY_MODS[daily.mod].name} · ${DAILY_MODS[daily.mod].desc}`);
}
function showWin(w) {
  update("win", w);
  setState({ overlay: "win", hudShown: false });
}
function dailyCleared() {
  const d = save.daily, t = runTime, first = save.dailyLast !== d.date;
  if (first) { save.streak = save.dailyLast === dayKey(-1) ? save.streak + 1 : 1; save.dailyLast = d.date; }
  const better = d.best === null || t < d.best;
  if (better) d.best = t;
  writeSave();
  showWin({
    act: `오늘의 도전 · ${ACTS[cur]} · ${DAILY_MODS[d.mod].name}`,
    title: first ? "오늘의 도전 완료" : better ? "오늘의 신기록" : "오늘의 도전 완료",
    stars: null, starNote: `연속 ${save.streak}일째 · 내일 새 도전이 열린다`,
    time: t.toFixed(1) + "초", deaths: runDeaths, best: d.best.toFixed(1) + "초",
    next: "메뉴로", retry: "다시 도전", menuBtn: false,
  });
}
export function winNext() { if (mode !== "win") return; if (daily) { showMenu(); return; } if (run) { run = null; showMenu(); } else nextLevel(); }
export function winRetry() { if (mode !== "win") return; if (run) startRun(run.a, run.b); else startLevel(cur, false); }
function runStageCleared() {
  if (cur < run.b) {
    toast(`${ACTS[cur]} 통과 · ${run.t.toFixed(1)}초`);
    const from = cur;
    setTimeout(() => { if (run && mode === "win" && cur === from) startLevel(from + 1, false); }, 650);
    return;
  }
  run.done = true;
  const k = segKey(run.a, run.b), prev = srTable()[k];
  const better = !prev || run.t < prev.time;
  if (better) { srTable()[k] = { time: run.t, deaths: run.deaths }; writeSave(); }
  showWin({
    act: `${hard ? DIFF_NAME[diff] + " " : ""}스피드런 · ${ACTS[run.a]} – ${ACTS[run.b]}`,
    title: better && prev ? "신기록" : "스피드런 완료",
    stars: null, starNote: "",
    time: run.t.toFixed(1) + "초", deaths: run.deaths,
    best: (better ? run.t : prev.time).toFixed(1) + "초" + (better && prev ? " ★" : ""),
    next: "메뉴로", retry: "다시 도전", menuBtn: false,
  });
}
// Stars: 1 for clearing, 1 for a deathless run, 1 for beating the target time.
function parTime(i) {
  const d = lvAt(i), rows = d.map, t = rows.join("");
  const W = Math.max(...rows.map((r) => r.length)), H = rows.length;
  const count = (re) => (t.match(re) || []).length;
  return Math.round(8 + Math.max(W, H) * 0.32 + count(/[TYUV]/g) * 2.5 + count(/K/g) * 3 + count(/o/g) * 1.5 + count(/B/g) * 4 + count(/[S]/g) * 2);
}
const starsOf = (i, time, deaths) => 1 + (deaths === 0 ? 1 : 0) + (time <= parTime(i) ? 1 : 0);
function totalStars() {
  let n = 0;
  for (const tbl of [save.best, save.bestH, save.bestM]) for (const k in tbl) n += tbl[k].stars || 1;
  return n;
}
// Achievements: lifetime goals checked after each clear; each records when it was earned.
const bump = (k) => { save.stats[k] = (save.stats[k] || 0) + 1; };
const clears = (tbl) => Object.keys(tbl).length;
const ACHIEVEMENTS = [
  { id: "first", name: "첫 임무", desc: "아무 막이나 처음으로 깬다", goal: 1, val: () => clears(save.best) + clears(save.bestH) + clears(save.bestM) },
  { id: "c50", name: "숙련 자객", desc: "일반 모드에서 막 50개를 깬다", goal: 50, val: () => clears(save.best) },
  { id: "call", name: "성채 정복", desc: `일반 모드에서 막 ${LEVELS.length}개를 모두 깬다`, goal: LEVELS.length, val: () => clears(save.best) },
  { id: "h50", name: "붉은 밤", desc: "하드 모드에서 막 50개를 깬다", goal: 50, val: () => clears(save.bestH) },
  { id: "m10", name: "등불 하나", desc: "마스터 모드에서 막 10개를 깬다", goal: 10, val: () => clears(save.bestM) },
  { id: "s300", name: "별 수집가", desc: "별 300개를 모은다", goal: 300, val: () => totalStars() },
  { id: "k100", name: "그림자 사냥꾼", desc: "경비 100명을 처치한다", goal: 100, val: () => save.stats.kills || 0 },
  { id: "k500", name: "전설의 자객", desc: "경비 500명을 처치한다", goal: 500, val: () => save.stats.kills || 0 },
  { id: "o200", name: "금화 수집가", desc: "금화 200개를 줍는다", goal: 200, val: () => save.stats.coins || 0 },
  { id: "hk1000", name: "갈고리 장인", desc: "후크를 1000번 건다", goal: 1000, val: () => save.stats.hooks || 0 },
  { id: "clean10", name: "흠 없는 칼날", desc: "죽지 않고 막 10개를 연달아 깬다", goal: 10, val: () => save.stats.cleanBest || 0 },
  { id: "d7", name: "꾸준한 수행", desc: "오늘의 도전을 7일 연속으로 깬다", goal: 7, val: () => save.streak || 0 },
  { id: "sr", name: "질주 본능", desc: "스피드런 구간 하나를 끝까지 달린다", goal: 1, val: () => clears(save.sr) + clears(save.srH) + clears(save.srM) },
  { id: "dd100", name: "끈질긴 자객", desc: "100번 쓰러지고도 다시 일어선다", goal: 100, val: () => save.stats.deaths || 0 },
  { id: "abyss", name: "심연을 건넌 자", desc: "초고난도 보너스 스테이지를 깬다", goal: 1, val: () => Object.keys(save.bonus).length },
];
function checkAchievements() {
  const fresh = ACHIEVEMENTS.filter((a) => !save.ach[a.id] && a.val() >= a.goal);
  if (!fresh.length) return;
  for (const a of fresh) save.ach[a.id] = Date.now();
  writeSave();
  sfx.key();
  toast(fresh.length > 3 ? `업적 ${fresh.length}개 달성` : `업적 달성 · ${fresh.map((a) => a.name).join(", ")}`);
}
function win() {
  setMode("win");
  sfx.win();
  if (runDeaths === 0) { bump("clean"); save.stats.cleanBest = Math.max(save.stats.cleanBest || 0, save.stats.clean); }
  setTimeout(checkAchievements, 1400); // after the stage's own toasts
  if (daily) { dailyCleared(); return; }
  if (cur === BONUS_I) { bonusCleared(); return; }
  const prev = bestTable()[cur];
  const stars = starsOf(cur, runTime, runDeaths);
  const rec = { time: runTime, deaths: runDeaths, stars: Math.max(stars, (prev && prev.stars) || 0) };
  const better = !prev || runTime < prev.time;
  const beforeStars = totalStars();
  if (better) { bestTable()[cur] = rec; storeGhost(cur, ghostRec); } else if (prev) prev.stars = rec.stars;
  save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, cur + 2));
  writeSave();
  if (run) { runStageCleared(); return; }
  const last = cur + 1 >= LEVELS.length;
  const unlocked = SKINS.filter((sk) => sk.need > beforeStars && sk.need <= totalStars());
  if (unlocked.length) toast(`새 스카프 · ${unlocked.map((u) => `${u.name}(${u.desc})`).join(", ")}`);
  showWin({
    act: ACTS[cur] + " · " + LEVELS[cur].name + (hard ? " · " + DIFF_NAME[diff] : ""),
    title: last ? "성채 탈출" : "임무 완료",
    stars, starNote: `목표 ${parTime(cur)}초 · ${runDeaths ? "죽지 않고 깨면 별 하나 더" : "무사히 통과"}`,
    time: runTime.toFixed(1) + "초", deaths: runDeaths,
    best: (better ? runTime : prev.time).toFixed(1) + "초" + (better && prev ? " ★" : ""),
    next: last ? "메뉴로" : "다음 막", retry: "다시 하기", menuBtn: true,
  });
}
// The bonus keeps one record per difficulty and never touches campaign progress or stars.
function bonusCleared() {
  const prev = save.bonus[diff], better = !prev || runTime < prev.time;
  if (better) { save.bonus[diff] = { time: runTime, deaths: runDeaths }; storeGhost(BONUS_I, ghostRec); }
  writeSave();
  showWin({
    act: "보너스 · " + BONUS.name + (hard ? " · " + DIFF_NAME[diff] : ""),
    title: prev ? (better ? "심연의 신기록" : "심연을 건넜다") : "심연을 건넌 자",
    stars: null, starNote: "초고난도 보너스 · 별 대신 이름이 남는다",
    time: runTime.toFixed(1) + "초", deaths: runDeaths,
    best: (better ? runTime : prev.time).toFixed(1) + "초" + (better && prev ? " ★" : ""),
    next: "메뉴로", retry: "다시 도전", menuBtn: false,
  });
}
export function showMenu() {
  setMode("menu");
  run = null;
  if (daily) { daily = null; applyDifficulty(); }
  keepAwake(false);
  todaysDaily();
  checkAchievements();
  setState({ overlay: "menu", hudShown: false });
  writeSave();
}

// ---------- menu data and actions (read by the React UI) ----------
export function menuInfo() {
  const next = Math.min(LEVELS.length, save.unlocked);
  const dd = save.daily || todaysDaily();
  const have = totalStars(), sk = SKINS[save.skin || 0] || SKINS[0];
  const nextSkin = SKINS.find((s2) => s2.need > have);
  return {
    next,
    cont: next > 1 ? `이어하기 · ${ACTS[next - 1]}` : "시작하기",
    daily: `오늘의 도전 · ${ACTS[dd.lvl]} · ${DAILY_MODS[dd.mod].name}` + (save.dailyLast === dd.date ? " ✓" : ""),
    diffName: DIFF_NAME[diff], hard, master,
    srTitle: hard ? DIFF_NAME[diff] + " 스피드런" : "스피드런",
    starTotal: `모은 별 ★ ${have}` + (nextSkin ? ` · 다음 스카프(${nextSkin.name})까지 ${nextSkin.need - have}개` : " · 모든 스카프를 얻었다"),
    skin: { label: sk.name + " · " + sk.desc, color: sk.color === "rainbow" ? "" : sk.color },
    settings: { big: !!save.big, left: !!save.left, fade: !!save.fade, vib: !!save.vib, ghost: !!save.ghost },
    levels: LEVELS.map((lv, i) => {
      const locked = i >= save.unlocked, best = bestTable()[i];
      return { i, name: lv.name, locked, best: best ? best.time : null, stars: best ? best.stars || 1 : 0 };
    }),
    achievements: ACHIEVEMENTS.map((a) => {
      const v = Math.min(a.val(), a.goal);
      return { id: a.id, name: a.name, desc: a.desc, done: !!save.ach[a.id], pct: Math.round((v / a.goal) * 100), prog: a.goal > 1 ? `${v}/${a.goal}` : "" };
    }),
    chapters: CHAPTERS.map((c, k) => {
      const a = c.from, b = Math.min(LEVELS.length, k + 1 < CHAPTERS.length ? CHAPTERS[k + 1].from : LEVELS.length);
      let clear = 0, stars = 0;
      for (let i = a; i < b; i++) { const r = bestTable()[i]; if (r) { clear++; stars += r.stars || 1; } }
      return { k, a, b, title: c.title, clear, stars, locked: a >= save.unlocked };
    }),
    stats: playStats(),
    bonus: { label: "보너스 · 초고난도" + (save.bonus[diff] ? ` · 최고 ${save.bonus[diff].time.toFixed(1)}초` : ""), cleared: !!save.bonus[diff] },
    story: (() => {
      const list = CHAPTERS.map((c, k) => ({ key: k, label: `제${k + 1}장 · ${c.title}`, open: save.unlocked > c.from }));
      const at = CHAPTERS.findIndex((c) => c.from > EPILOGUE_AFTER);
      list.splice(at < 0 ? list.length : at, 0, { key: "end", label: "에필로그 · " + EPILOGUE.title, open: !!save.story.end || !!save.best[EPILOGUE_AFTER] });
      return list;
    })(),
    segments: SEGMENTS.map(([a, b], idx) => {
      const locked = b >= save.unlocked, best = srTable()[segKey(a, b)];
      return {
        a, b, all: idx === 0, locked,
        label: idx === 0 ? `전 구간 · ${a + 1}–${b + 1}막` : `${a + 1}–${b + 1}막`,
        sub: locked ? "잠김" : best ? "최고 " + best.time.toFixed(1) + "초" : "기록 없음",
      };
    }),
  };
}
function fmtPlayTime(sec) {
  const m = Math.floor(sec / 60), h = Math.floor(m / 60);
  return h ? `${h}시간 ${m % 60}분` : m ? `${m}분 ${Math.floor(sec % 60)}초` : `${Math.floor(sec)}초`;
}
function playStats() {
  const st = save.stats, n = (k) => (st[k] || 0).toLocaleString("ko-KR");
  const cleared = LEVELS.filter((_, i) => bestTable()[i]).length;
  return [
    ["플레이 시간", fmtPlayTime(st.time || 0)],
    ["깬 막 (" + DIFF_NAME[diff] + ")", `${cleared} / ${LEVELS.length}`],
    ["모은 별", String(totalStars())],
    ["줄을 건 횟수", n("hooks")],
    ["쓰러뜨린 경비", n("kills")],
    ["주운 금화", n("coins")],
    ["쓰러진 횟수", n("deaths")],
    ["무사고 연속 최고", n("cleanBest") + "막"],
    ["오늘의 도전 연속", (save.streak || 0) + "일"],
  ];
}
export function playLevel(i) { ensureAudio(); beginLevel(i); }
export function playContinue() { ensureAudio(); beginLevel(Math.min(LEVELS.length, save.unlocked) - 1); }
export function playBonus() { ensureAudio(); run = null; startLevel(BONUS_I, false); }
export function playDaily() { ensureAudio(); startDaily(); }
export function playRun(a, b) { ensureAudio(); startRun(a, b); }
export function soundClick() { ensureAudio(); toggleMute(); }
export function cycleDifficulty() {
  diff = (diff + 1) % 3; hard = diff >= 1; master = diff === 2;
  save.diff = diff; save.hard = hard; writeSave();
  applyDifficulty();
}
export function nextSkin() {
  const have = totalStars();
  let k = save.skin || 0;
  do { k = (k + 1) % SKINS.length; } while (SKINS[k].need > have && k !== 0);
  save.skin = k; writeSave(); applyDifficulty();
}
export function toggleSetting(key) { save[key] = !save[key]; writeSave(); if (key === "vib") buzz(20); }
export function restartClick() { restartLevel(); if (cv) cv.focus(); }
export function pauseClick() { pauseGame(); }
export function resumeClick() { resumeGame(); }
export function pauseRestartClick() { resumeGame(); restartLevel(); }
export function hudNameTap() { showHint(); fadeGoal(); measurePads(); }

function syncHintText() {
  if (!L) return;
  const lv = lvAt(cur);
  update("hud", { hint: touchMode && lv.touchHint ? lv.touchHint : lv.hint });
}
let goalTimer = 0;
function fadeGoal() {
  update("hud", { goalFaded: false, goalHidden: false }); clearTimeout(goalTimer);
  if (touchMode) goalTimer = setTimeout(() => {
    update("hud", { goalFaded: true });
    // once faded, take it out of the layout so the camera can use that space
    goalTimer = setTimeout(() => { update("hud", { goalHidden: true }); requestAnimationFrame(measurePads); }, 650);
  }, 4000);
}
let hintTimer = 0;
function showHint() {
  update("hud", { hintFaded: false });
  clearTimeout(hintTimer);
  if (touchMode) hintTimer = setTimeout(() => update("hud", { hintFaded: true }), 8000);
}

let toastTimer = 0;
function toast(msg, bad) {
  update("toast", { msg, bad: !!bad, show: true });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => update("toast", { show: false }), 1300);
}
let cardTimer = 0;
function showCard() {
  update("card", { act: actAt(cur), name: lvAt(cur).name, show: true });
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => update("card", { show: false }), 1500);
}

// The HUD is pushed to React only when something visible changed (about ten times a second while the clock runs).
let hudKey = "";
function updateHUD() {
  if (!L) return;
  const chips = [];
  if (L.coins.length) { const got = L.coins.filter((c) => c.taken).length; chips.push([`금화 ${got}/${L.coins.length}`, got === L.coins.length]); }
  if (L.chase) chips.push(["불길 추격", false]);
  if (L.needKey) {
    const total = L.keys.length, got = L.keys.filter((k) => k.taken).length;
    const doorsLeft = L.grid.some((r) => r.includes("D"));
    chips.push([`열쇠 ${got}/${total}`, !doorsLeft]);
  }
  if (L.plates.length) chips.push([`발판 ${L.plates.filter((q) => q.pressed).length}/${L.plates.length}`, L.plateOpen]);
  if (L.guards.length) { const dead = L.guards.filter((g) => !g.alive).length; chips.push([`경비 처치 ${dead}/${L.guards.length}`, dead === L.guards.length]); }
  const q = L.player;
  if (q.cloak > 0) chips.push([`망토 ${Math.ceil(q.cloak)}`, true]);
  if (q.boots > 0) chips.push([`신발 ${Math.ceil(q.boots)}`, true]);
  if (q.shield) chips.push(["부적", true]);
  const time = runTime.toFixed(1), rt = run ? run.t.toFixed(1) : null;
  const key = time + "|" + rt + "|" + runDeaths + "|" + chips.map((c) => c.join(":")).join(",");
  if (key !== hudKey) { hudKey = key; update("hud", { time, run: rt, deaths: runDeaths, chips }); }
}

// ---------- camera ----------
// On touch screens the HUD covers the top and the controls cover the bottom, so the camera
// frames the world inside the strip between them and keeps more room above the player.
let padTop = 0, padBot = 0;
function measurePads() {
  padTop = padBot = 0;
  if (!touchMode || !(mode === "play" || mode === "dead" || mode === "pause")) return;
  const hl = document.querySelector(".hud-l"), hr = document.querySelector(".hud-r"), tb = document.querySelector(".tbtns"), sk = document.getElementById("stick");
  if (!tb || !sk) return;
  const top = Math.max(hl ? hl.getBoundingClientRect().bottom : 0, hr ? hr.getBoundingClientRect().bottom : 0);
  const portrait = window.innerHeight > window.innerWidth;
  const tr = tb.getBoundingClientRect(), sr = sk.getBoundingClientRect();
  if (!tr.height && !sr.height) return; // controls not laid out yet
  const bottomUI = portrait ? Math.min(tr.height ? tr.top : Infinity, sr.height ? sr.top : Infinity) : window.innerHeight;
  padTop = Math.max(0, top + 6) / scale;
  padBot = Math.max(0, window.innerHeight - bottomUI + 6) / scale;
}
function camTarget() {
  const p = L.player, ww = L.W * TS, wh = L.H * TS;
  const usable = Math.max(TS * 4, viewH - padTop - padBot);
  let tx = p.x + p.w / 2 - viewW / 2 + p.vx * 0.2;
  let ty = padTop || padBot ? p.y + p.h / 2 - padTop - usable * 0.58 : p.y + p.h / 2 - viewH / 2 + 30;
  tx = ww <= viewW ? (ww - viewW) / 2 : clamp(tx, 0, ww - viewW);
  ty = wh <= usable ? (wh - usable) / 2 - padTop : clamp(ty, -padTop, wh - viewH + padBot);
  return { x: tx, y: ty };
}
function snapCamera() { measurePads(); snapCameraOnly(); }
function snapCameraOnly() { const t = camTarget(); cam.x = t.x; cam.y = t.y; }
function updateCamera(dt) { const t = camTarget(); const k = Math.min(1, dt * 6); cam.x += (t.x - cam.x) * k; cam.y += (t.y - cam.y) * k; }

// ---------- rendering ----------
function makeSky(i, W) {
  const stars = [], roofs = [];
  for (let k = 0; k < 90; k++) stars.push({ x: hash(k, i + 1), y: hash(i + 7, k) * 0.6, r: hash(k, k + i) * 1.3 + 0.3, tw: hash(k + 3, i) * 6 });
  let x = -100;
  while (x < W * TS * 0.4 + 2000) {
    const w = 80 + hash(x | 0, i) * 160, h = 60 + hash(i, x | 0) * 140;
    roofs.push({ x, w, h, tiers: 1 + Math.floor(hash(x | 0, 99) * 3) });
    x += w + 20 + hash(i * 3, x | 0) * 60;
  }
  return { stars, roofs };
}

let layerCache = null;
function prerender(st, R) {
  const c = document.createElement("canvas");
  c.width = st.W * TS * R; c.height = st.H * TS * R;
  const g = c.getContext("2d");
  g.scale(R, R);
  const at = (x, y) => (x < 0 || x >= st.W || y < 0 || y >= st.H ? "X" : st.grid[y][x]);
  const solidStatic = (ch) => ch === "#" || ch === "X";
  for (let y = 0; y < st.H; y++) for (let x = 0; x < st.W; x++) {
    const ch = st.grid[y][x], px = x * TS, py = y * TS;
    const top = !solidStatic(at(x, y - 1));
    if (ch === "#") {
      g.fillStyle = "#3a2a24"; g.fillRect(px, py, TS, TS);
      g.fillStyle = "#2a1d19";
      for (let k = 0; k < 4; k++) g.fillRect(px, py + k * 8 + 7, TS, 1);
      for (let k = 0; k < 4; k++) { const off = ((x + k) % 2) * 16 + Math.floor(hash(x, y + k) * 6); g.fillRect(px + off, py + k * 8, 1, 7); }
      g.fillStyle = "rgba(220,165,74,0.08)";
      for (let k = 0; k < 3; k++) g.fillRect(px + hash(x * 7, y + k) * 28, py + hash(x, y * 5 + k) * 28, 3, 1);
      if (top) { g.fillStyle = "#8b6a4c"; g.fillRect(px, py, TS, 3); g.fillStyle = "#5b4232"; g.fillRect(px, py + 3, TS, 1); }
      if (!solidStatic(at(x - 1, y))) { g.fillStyle = "rgba(139,106,76,0.35)"; g.fillRect(px, py, 2, TS); }
    } else if (ch === "X") {
      g.fillStyle = "#212839"; g.fillRect(px, py, TS, TS);
      g.strokeStyle = "#323c55"; g.lineWidth = 1; g.strokeRect(px + 1.5, py + 1.5, TS - 3, TS - 3);
      g.fillStyle = "#4d5a78";
      for (const [rx, ry] of [[5, 5], [TS - 6, 5], [5, TS - 6], [TS - 6, TS - 6]]) g.fillRect(px + rx, py + ry, 2, 2);
      if (top) { g.fillStyle = "#7d8db0"; g.fillRect(px, py, TS, 2); }
    } else if (ch === "M") {
      g.fillStyle = "#2a2f3e"; g.fillRect(px, py, TS, TS);
      g.fillStyle = "#4d5a78"; g.fillRect(px + 4, py + TS - 8, TS - 8, 8);
      g.fillStyle = "#171a26"; g.beginPath(); g.arc(px + 16, py + TS - 4, 4, 0, Math.PI * 2); g.fill();
    } else if (ch === "A") {
      g.fillStyle = "#2a2226"; g.fillRect(px, py, TS, TS);
      g.strokeStyle = "#45373a"; g.lineWidth = 1; g.strokeRect(px + 1.5, py + 1.5, TS - 3, TS - 3);
      g.fillStyle = "#120c0e";
      for (let k = 0; k < 4; k++) g.fillRect(px + 5 + k * 6, py + 2, 3, 9);
      g.fillStyle = "#6b4b3e"; g.fillRect(px, py, TS, 2);
    } else if (ch === "I") {
      g.fillStyle = "#2b3f55"; g.fillRect(px, py, TS, TS);
      g.fillStyle = "rgba(190,230,255,0.18)";
      g.beginPath(); g.moveTo(px + 4, py + TS - 4); g.lineTo(px + 14, py + 8); g.lineTo(px + 18, py + 8); g.lineTo(px + 8, py + TS - 4); g.fill();
      if (top) { g.fillStyle = "#cfefff"; g.fillRect(px, py, TS, 3); g.fillStyle = "#86b8d6"; g.fillRect(px, py + 3, TS, 1); }
    } else if (ch === "^") {
      g.fillStyle = "#171a26"; g.fillRect(px, py + TS - 5, TS, 5);
      for (let k = 0; k < 4; k++) {
        const bx = px + k * 8;
        g.fillStyle = "#aeb5c4"; g.beginPath(); g.moveTo(bx, py + TS - 4); g.lineTo(bx + 4, py + 14); g.lineTo(bx + 8, py + TS - 4); g.fill();
        g.fillStyle = "#6c7386"; g.beginPath(); g.moveTo(bx + 4, py + 14); g.lineTo(bx + 8, py + TS - 4); g.lineTo(bx + 4, py + TS - 4); g.fill();
      }
    }
  }
  return c;
}

// Full-screen gradients are expensive to rasterise every frame on phones, so they are painted once per
// screen size into an offscreen canvas and blitted.
const bgCache = {};
function cachedLayer(key, paint) {
  const w = cv.width, h = cv.height, id = key + ":" + w + "x" + h;
  let c = bgCache[id];
  if (!c) {
    for (const k in bgCache) if (k.startsWith(key + ":")) delete bgCache[k];
    c = bgCache[id] = document.createElement("canvas");
    c.width = w; c.height = h;
    paint(c.getContext("2d"), w, h);
  }
  return c;
}
function drawSky(t) {
  const w = cv.width / dpr, h = cv.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.drawImage(cachedLayer("sky", (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, "#080a17"); gr.addColorStop(0.6, "#141733"); gr.addColorStop(1, "#2a1f3d");
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }), 0, 0, w, h);
  const sky = L ? L.sky : menuSky;
  for (const s of sky.stars) {
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 1.3 + s.tw);
    ctx.fillStyle = "#ece4cf";
    ctx.fillRect(s.x * w, s.y * h, s.r, s.r);
  }
  ctx.globalAlpha = 1;
  const mx = w * 0.78 - (L ? cam.x * 0.03 * scale : 0), my = h * 0.2;
  const mg = ctx.createRadialGradient(mx, my, 10, mx, my, 160);
  mg.addColorStop(0, "rgba(236,228,207,0.25)"); mg.addColorStop(1, "rgba(236,228,207,0)");
  ctx.fillStyle = mg; ctx.fillRect(mx - 160, my - 160, 320, 320);
  ctx.fillStyle = "#ece4cf"; ctx.beginPath(); ctx.arc(mx, my, 34, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(20,23,51,0.12)"; ctx.beginPath(); ctx.arc(mx - 10, my - 6, 9, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(mx + 12, my + 10, 6, 0, Math.PI * 2); ctx.fill();
  // distant castle roofs
  const par = 0.25, base = h;
  ctx.fillStyle = "#11132a";
  const ox = L ? -cam.x * par * scale : -t * 8;
  for (const r of sky.roofs) {
    const x = r.x * scale * 0.7 + ox, rw = r.w * scale * 0.7, rh = r.h * scale * 0.7;
    if (x > w || x + rw < -40) continue;
    ctx.fillRect(x, base - rh, rw, rh);
    let ty = base - rh, tw = rw;
    for (let k = 0; k < r.tiers; k++) {
      const ext = 14 * scale * 0.7;
      ctx.beginPath();
      ctx.moveTo(x + (rw - tw) / 2 - ext, ty);
      ctx.quadraticCurveTo(x + rw / 2, ty - 26 * scale * 0.7, x + (rw + tw) / 2 + ext, ty);
      ctx.lineTo(x + (rw + tw) / 2 - 6, ty + 4);
      ctx.lineTo(x + (rw - tw) / 2 + 6, ty + 4);
      ctx.fill();
      tw *= 0.62; ty -= 26 * scale * 0.7;
      if (k < r.tiers - 1) ctx.fillRect(x + (rw - tw) / 2, ty, tw, 26 * scale * 0.7);
    }
  }
}

function worldTransform() { ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -cam.x * scale * dpr, -cam.y * scale * dpr); }

function drawLamps(t) {
  for (const l of L.lamps) {
    if (l.x < cam.x - LAMP_LEN || l.x > cam.x + viewW + LAMP_LEN) continue;
    const a = lampAngle(l, runTime);
    // the beam stops at the first wall or roof along each edge
    const edge = (ang) => { const dx = Math.sin(ang), dy = Math.cos(ang), r = rayLen(l.x + dx * 10, l.y + dy * 10, dx, dy, LAMP_LEN); return [l.x + dx * (r + 10), l.y + dy * (r + 10)]; };
    const [ax, ay] = edge(a - LAMP_HALF), [mx, my] = edge(a), [bx, by] = edge(a + LAMP_HALF);
    const hot = L.lampSee > 0;
    const gr = ctx.createRadialGradient(l.x, l.y, 4, l.x, l.y, LAMP_LEN);
    gr.addColorStop(0, hot ? "rgba(255,170,140,0.55)" : "rgba(255,244,200,0.42)"); gr.addColorStop(1, "rgba(255,244,200,0)");
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(ax, ay); ctx.lineTo(mx, my); ctx.lineTo(bx, by); ctx.closePath(); ctx.fill();
    // the lamp itself: a hood on a short chain
    ctx.strokeStyle = "#4d5a78"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(l.x, l.y - 12); ctx.lineTo(l.x, l.y - 4); ctx.stroke();
    ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(-a);
    ctx.fillStyle = "#2c3346"; ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(8, -4); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = hot ? "#ff9a7a" : "#fff1b8"; ctx.fillRect(-4, 4, 8, 2);
    ctx.restore();
  }
}
function drawCrushers(t) {
  for (const c of L.crushers) {
    const px = c.tx * TS, py = c.ty * TS;
    if (px + TS < cam.x - TS || px > cam.x + viewW + TS) continue;
    const b = crushBox(c, runTime), sh = crushWarn(c.tx, runTime) ? Math.sin(t * 60) * 1.5 : 0;
    ctx.fillStyle = "#4d5a78"; ctx.fillRect(px + 13, py + TS - 2, 2, b.y - py - TS + 4); ctx.fillRect(px + 17, py + TS - 2, 2, b.y - py - TS + 4);
    ctx.save(); ctx.translate(sh, 0);
    ctx.fillStyle = "#3b3a42"; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = "#55535e"; ctx.fillRect(b.x + 2, b.y + 2, b.w - 4, 6);
    ctx.fillStyle = "#26252c"; ctx.fillRect(b.x, b.y + b.h - 6, b.w, 6);
    ctx.fillStyle = crushWarn(c.tx, runTime) ? "#ff8a5a" : "#8a8796";
    for (let k = 0; k < 4; k++) ctx.fillRect(b.x + 2 + k * 7, b.y + b.h - 4, 4, 4);
    ctx.restore();
  }
}
function drawVents(t) {
  for (const v of L.vents) {
    const px = v.tx * TS, py = v.ty * TS;
    if (px + TS < cam.x - TS || px > cam.x + viewW + TS) continue;
    const st = ventState(v.tx, runTime);
    if (st === 0) continue;
    if (st === 1) { // warning: the grate glows and sparks
      ctx.fillStyle = `rgba(255,140,60,${0.35 + 0.3 * Math.sin(t * 30)})`;
      for (let k = 0; k < 4; k++) ctx.fillRect(px + 5 + k * 6, py + 2, 3, 9);
      continue;
    }
    const h = ventReach(v) * TS;
    if (!h) continue;
    const top = py - h, fl = 0.85 + 0.15 * Math.sin(t * 40 + v.tx);
    const gr = ctx.createLinearGradient(0, py, 0, top);
    gr.addColorStop(0, "rgba(255,240,170,0.95)"); gr.addColorStop(0.45, "rgba(255,140,40,0.85)"); gr.addColorStop(1, "rgba(200,40,20,0)");
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.moveTo(px + 3, py);
    ctx.quadraticCurveTo(px + 2 + Math.sin(t * 23 + v.tx) * 4, py - h * 0.5, px + TS / 2 + Math.sin(t * 17) * 3, top + h * (1 - fl));
    ctx.quadraticCurveTo(px + TS - 2 + Math.cos(t * 19 + v.tx) * 4, py - h * 0.5, px + TS - 3, py);
    ctx.closePath(); ctx.fill();
  }
}
function drawDynamicTiles(t) {
  const x0 = Math.max(0, Math.floor(cam.x / TS) - 1), x1 = Math.min(L.W - 1, Math.ceil((cam.x + viewW) / TS) + 1);
  const y0 = Math.max(0, Math.floor(cam.y / TS) - 1), y1 = Math.min(L.H - 1, Math.ceil((cam.y + viewH) / TS) + 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const ch = L.grid[y][x], px = x * TS, py = y * TS;
    if (ch === "C") {
      const k = x + "," + y, cr = L.crack[k];
      const sh = cr !== undefined ? (Math.random() - 0.5) * 2 * (1.7 - cr) : 0;
      ctx.save(); ctx.translate(sh, 0);
      ctx.fillStyle = "#5a4636"; ctx.fillRect(px, py, TS, TS);
      ctx.fillStyle = "#3a2c22"; ctx.fillRect(px, py + 10, TS, 1); ctx.fillRect(px, py + 21, TS, 1);
      ctx.strokeStyle = cr !== undefined ? "#e0a050" : "#2a1d16"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(px + 6, py); ctx.lineTo(px + 11, py + 12); ctx.lineTo(px + 8, py + 20); ctx.lineTo(px + 14, py + TS);
      ctx.moveTo(px + 24, py); ctx.lineTo(px + 20, py + 9); ctx.lineTo(px + 26, py + 18); ctx.stroke();
      ctx.fillStyle = "#9a7a58"; ctx.fillRect(px, py, TS, 2);
      ctx.restore();
    } else if (ch === "N") {
      const k = x + "," + y, cr = L.crack[k];
      const sh = cr !== undefined ? (Math.random() - 0.5) * 2 * (1 - cr / FLOOR_CRACK) * 2 : 0;
      ctx.save(); ctx.translate(0, sh);
      ctx.fillStyle = "#2b3247"; ctx.fillRect(px, py, TS, TS);
      ctx.fillStyle = "#3c4560"; ctx.fillRect(px + 1, py + 1, 14, 9); ctx.fillRect(px + 17, py + 1, 14, 9); ctx.fillRect(px + 8, py + 12, 16, 8);
      ctx.strokeStyle = cr !== undefined ? "#e8c88a" : "#1a1f2e"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(px + 9, py + 2); ctx.lineTo(px + 13, py + 11); ctx.lineTo(px + 10, py + 22); ctx.moveTo(px + 22, py + 4); ctx.lineTo(px + 19, py + 14); ctx.lineTo(px + 25, py + 26); ctx.stroke();
      ctx.fillStyle = "#8a96b4"; ctx.fillRect(px, py, TS, 2);
      ctx.restore();
    } else if (ch === ">" || ch === "<") {
      const dir = ch === ">" ? 1 : -1, off = ((t * BELT_V * dir) % 16 + 16) % 16;
      ctx.fillStyle = "#1d2232"; ctx.fillRect(px, py, TS, TS);
      ctx.fillStyle = "#2c3346"; ctx.fillRect(px, py + 3, TS, 8);
      ctx.save(); ctx.beginPath(); ctx.rect(px, py + 3, TS, 8); ctx.clip();
      ctx.strokeStyle = "#c9a45a"; ctx.lineWidth = 2;
      for (let k = -1; k < 3; k++) {
        const cx = px + k * 16 + off;
        ctx.beginPath(); ctx.moveTo(cx - 3 * dir, py + 4); ctx.lineTo(cx + 3 * dir, py + 7); ctx.lineTo(cx - 3 * dir, py + 10); ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = "#4d5a78"; ctx.fillRect(px, py, TS, 3);
      ctx.fillStyle = "#151926"; ctx.beginPath(); ctx.arc(px + 8, py + 21, 4, 0, Math.PI * 2); ctx.arc(px + 24, py + 21, 4, 0, Math.PI * 2); ctx.fill();
    } else if (ch === "n") {
      ctx.strokeStyle = "rgba(125,141,176,0.3)"; ctx.setLineDash([2, 4]); ctx.lineWidth = 1;
      ctx.strokeRect(px + 2.5, py + 2.5, TS - 5, TS - 5); ctx.setLineDash([]);
    } else if (ch === "c") {
      ctx.strokeStyle = "rgba(139,106,76,0.3)"; ctx.setLineDash([2, 4]); ctx.lineWidth = 1;
      ctx.strokeRect(px + 2.5, py + 2.5, TS - 5, TS - 5); ctx.setLineDash([]);
    } else if (ch === "G" || ch === "g") {
      const col = ch === "G" ? "#d0583f" : "#3fa7a0";
      if (solidChar(ch)) {
        ctx.fillStyle = "rgba(10,10,20,0.6)"; ctx.fillRect(px, py, TS, TS);
        ctx.fillStyle = col;
        ctx.fillRect(px, py, TS, 3); ctx.fillRect(px, py + TS - 3, TS, 3);
        for (let k = 0; k < 4; k++) ctx.fillRect(px + 3 + k * 8, py, 3, TS);
      } else {
        ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
        ctx.strokeRect(px + 2.5, py + 2.5, TS - 5, TS - 5); ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
    } else if (ch === "S") {
      ctx.fillStyle = "#212839"; ctx.fillRect(px, py, TS, TS);
      ctx.strokeStyle = "#7d8db0"; ctx.lineWidth = 2; ctx.strokeRect(px + 2, py + 2, TS - 4, TS - 4);
      const col = L.flip ? "#d0583f" : "#3fa7a0";
      const glow = ctx.createRadialGradient(px + 16, py + 16, 2, px + 16, py + 16, 26);
      glow.addColorStop(0, col); glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 0.45 + 0.15 * Math.sin(t * 4); ctx.fillStyle = glow; ctx.fillRect(px - 10, py - 10, TS + 20, TS + 20); ctx.globalAlpha = 1;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px + 16, py + 16, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ece4cf"; ctx.beginPath(); ctx.arc(px + 14, py + 14, 2, 0, Math.PI * 2); ctx.fill();
    } else if (ch === "H") {
      if (L.plateOpen) {
        ctx.fillStyle = "rgba(220,165,74,0.18)"; ctx.fillRect(px + 2, py, 2, TS); ctx.fillRect(px + TS - 4, py, 2, TS);
      } else {
        ctx.fillStyle = "#4a3426"; ctx.fillRect(px + 2, py, TS - 4, TS);
        ctx.fillStyle = "#2c1f17"; for (let k = 0; k < 4; k++) ctx.fillRect(px + 2, py + k * 8 + 6, TS - 4, 2);
        ctx.fillStyle = "#dca54a"; ctx.fillRect(px + 14, py + 12, 4, 8);
      }
    } else if (ch === "D") {
      ctx.fillStyle = "#2a1414"; ctx.fillRect(px, py, TS, TS);
      ctx.fillStyle = "#5c2622"; ctx.fillRect(px + 3, py + 2, TS - 6, TS - 4);
      ctx.fillStyle = "#c9a14e"; ctx.beginPath(); ctx.arc(px + 16, py + 14, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(px + 14, py + 16, 4, 8);
      ctx.fillStyle = "#2a1414"; ctx.fillRect(px + 15, py + 13, 2, 6);
    } else if (ch === "J") {
      const k = x + "," + y, sq = L.springT && L.springT[k] > 0 ? L.springT[k] / 0.25 : 0;
      ctx.fillStyle = "#212839"; ctx.fillRect(px, py + 12, TS, TS - 12);
      ctx.strokeStyle = "#7fd1c4"; ctx.lineWidth = 2; ctx.beginPath();
      const top = py + 4 + sq * 6;
      for (let k2 = 0; k2 < 4; k2++) { ctx.moveTo(px + 6, top + k2 * ((py + 12 - top) / 4)); ctx.lineTo(px + TS - 6, top + (k2 + 0.5) * ((py + 12 - top) / 4)); }
      ctx.stroke();
      ctx.fillStyle = "#7fd1c4"; ctx.fillRect(px + 2, top - 3, TS - 4, 4);
      ctx.fillStyle = "rgba(127,209,196,0.5)"; ctx.fillRect(px + 2, top - 5, TS - 4, 2);
    } else if (ch === "O" || ch === "Q") {
      const col = ch === "O" ? "180,140,240" : "240,160,192";
      const cx = px + 16, cy = py + 12;
      const gl = ctx.createRadialGradient(cx, cy, 2, cx, cy, 26);
      gl.addColorStop(0, `rgba(${col},0.55)`); gl.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = gl; ctx.fillRect(px - 12, py - 16, TS + 24, TS + 24);
      ctx.strokeStyle = `rgba(${col},0.95)`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(cx, cy + 2, 10, 16, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(${col},0.5)`; ctx.lineWidth = 1.5;
      const r = 5 + 3 * Math.sin(t * 4 + x);
      ctx.beginPath(); ctx.ellipse(cx, cy + 2, r * 0.6, r, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (ch === "W") {
      ctx.fillStyle = "rgba(127,209,196,0.07)"; ctx.fillRect(px, py, TS, TS);
      ctx.strokeStyle = "rgba(190,240,232,0.35)"; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let k2 = 0; k2 < 3; k2++) {
        const sx = px + 6 + k2 * 10 + Math.sin(t * 3 + k2 + y) * 2;
        const sy = py + TS - ((t * 70 + k2 * 13 + hash(x, y) * 32) % TS);
        ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 9);
      }
      ctx.stroke();
    } else if (ch === "_") {
      const pl = L.plates.find((q) => q.tx === x && q.ty === y);
      const down = pl && pl.pressed;
      ctx.fillStyle = down ? "#dca54a" : "#6b5a3e";
      ctx.fillRect(px + 3, py + TS - (down ? 3 : 6), TS - 6, down ? 3 : 6);
      if (down) { ctx.fillStyle = "rgba(220,165,74,0.25)"; ctx.fillRect(px - 2, py + TS - 12, TS + 4, 12); }
    } else if (ch === "E") {
      const open = !L.guards.some((g) => g.alive) && !L.coins.some((c) => !c.taken);
      if (open) {
        const gl = ctx.createRadialGradient(px + 16, py + 16, 4, px + 16, py + 16, 60);
        gl.addColorStop(0, "rgba(255,210,140,0.45)"); gl.addColorStop(1, "rgba(255,210,140,0)");
        ctx.fillStyle = gl; ctx.fillRect(px - 50, py - 50, TS + 100, TS + 100);
      }
      ctx.fillStyle = "#1b1310"; ctx.fillRect(px + 2, py - 14, TS - 4, TS + 14);
      ctx.fillStyle = open ? `rgba(255,222,165,${0.85 + 0.1 * Math.sin(t * 3)})` : "#3f3832";
      ctx.fillRect(px + 5, py - 11, TS - 10, TS + 11);
      ctx.fillStyle = "#1b1310";
      ctx.fillRect(px + 15, py - 11, 2, TS + 11);
      for (let k = 0; k < 3; k++) ctx.fillRect(px + 5, py - 11 + 10 + k * 10, TS - 10, 1.5);
      if (!open) { ctx.fillStyle = "#c8423b"; ctx.beginPath(); ctx.arc(px + 16, py + 4, 5, 0, Math.PI * 2); ctx.fill(); }
    }
  }
}

function drawCoins(t) {
  for (const c of L.coins) {
    if (c.taken) continue;
    const w = Math.abs(Math.cos(t * 3 + c.x * 0.1)) * 7 + 1.5, y = c.y + Math.sin(t * 2.5 + c.x) * 2;
    ctx.fillStyle = "rgba(255,212,122,0.25)"; ctx.beginPath(); ctx.arc(c.x, y, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e8b84a"; ctx.beginPath(); ctx.ellipse(c.x, y, w, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff0c2"; ctx.fillRect(c.x - 0.75, y - 4, 1.5, 8);
  }
}
function drawChase(t) {
  if (!L.chase) return;
  const x = L.chase.x, top = cam.y - 20, bot = cam.y + viewH + 20;
  const g = ctx.createLinearGradient(x - 160, 0, x + 24, 0);
  g.addColorStop(0, "rgba(160,30,10,0.92)"); g.addColorStop(0.75, "rgba(230,90,30,0.75)"); g.addColorStop(1, "rgba(255,170,60,0)");
  ctx.fillStyle = g; ctx.fillRect(Math.max(cam.x - 20, x - 2000), top, x + 24 - Math.max(cam.x - 20, x - 2000), bot - top);
  ctx.fillStyle = "rgba(255,200,90,0.85)";
  for (let yy = Math.floor(top / 18) * 18; yy < bot; yy += 18) {
    const f = Math.sin(t * 9 + yy * 0.3) * 8 + Math.sin(t * 5.3 + yy) * 5;
    ctx.beginPath(); ctx.moveTo(x - 6, yy); ctx.quadraticCurveTo(x + 14 + f, yy + 9, x - 6, yy + 18); ctx.fill();
  }
}
function drawFlags(t) {
  for (const f of L.flags) {
    const px = f.tx * TS, py = f.ty * TS;
    ctx.fillStyle = "#6b5a3e"; ctx.fillRect(px + 9, py - 14, 3, TS + 14);
    const wave = Math.sin(t * 5 + f.tx) * 2;
    ctx.fillStyle = f.on ? "#7fd1c4" : "#9d97a8";
    ctx.beginPath(); ctx.moveTo(px + 12, py - 14); ctx.lineTo(px + 28, py - 8 + wave); ctx.lineTo(px + 12, py - 1); ctx.fill();
    if (f.on) {
      const gl = ctx.createRadialGradient(px + 16, py, 2, px + 16, py, 30);
      gl.addColorStop(0, "rgba(127,209,196,0.35)"); gl.addColorStop(1, "rgba(127,209,196,0)");
      ctx.fillStyle = gl; ctx.fillRect(px - 16, py - 30, TS + 32, TS + 40);
    }
  }
}
function drawKeys(t) {
  for (const k of L.keys) {
    if (k.taken) continue;
    const y = k.y + Math.sin(t * 3 + k.t) * 3;
    const gl = ctx.createRadialGradient(k.x, y, 2, k.x, y, 22);
    gl.addColorStop(0, "rgba(232,193,90,0.5)"); gl.addColorStop(1, "rgba(232,193,90,0)");
    ctx.fillStyle = gl; ctx.fillRect(k.x - 22, y - 22, 44, 44);
    ctx.strokeStyle = "#e8c15a"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(k.x - 5, y, 4.5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(k.x - 0.5, y); ctx.lineTo(k.x + 10, y); ctx.moveTo(k.x + 6, y); ctx.lineTo(k.x + 6, y + 4); ctx.moveTo(k.x + 9, y); ctx.lineTo(k.x + 9, y + 3); ctx.stroke();
  }
}

function drawCrates() {
  for (const c of L.crates) {
    ctx.fillStyle = "#6a4a2e"; ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = "#3a2716"; ctx.lineWidth = 2;
    ctx.strokeRect(c.x + 1, c.y + 1, c.w - 2, c.h - 2);
    ctx.beginPath(); ctx.moveTo(c.x + 3, c.y + 3); ctx.lineTo(c.x + c.w - 3, c.y + c.h - 3); ctx.moveTo(c.x + c.w - 3, c.y + 3); ctx.lineTo(c.x + 3, c.y + c.h - 3); ctx.stroke();
    ctx.fillStyle = "#9b7449"; ctx.fillRect(c.x, c.y, c.w, 2);
  }
}

function drawCone(g) {
  const ex = g.x + g.w / 2 + g.dir * 4, ey = g.y + 8;
  const base = g.dir > 0 ? 0 : Math.PI, n = 18;
  const danger = clamp(g.seeT / SEE_LIMIT, 0, 1);
  ctx.beginPath(); ctx.moveTo(ex, ey);
  for (let k = 0; k <= n; k++) {
    const a = base - VIS_HALF + (2 * VIS_HALF * k) / n;
    const dx = Math.cos(a), dy = Math.sin(a), len = rayLen(ex, ey, dx, dy, VIS);
    ctx.lineTo(ex + dx * len, ey + dy * len);
  }
  ctx.closePath();
  const gr = ctx.createRadialGradient(ex, ey, 4, ex, ey, VIS);
  const r = Math.round(255), gg = Math.round(214 - 150 * danger), b = Math.round(120 - 60 * danger);
  gr.addColorStop(0, `rgba(${r},${gg},${b},${0.32 + 0.25 * danger})`); gr.addColorStop(1, `rgba(${r},${gg},${b},0.03)`);
  ctx.fillStyle = gr; ctx.fill();
}

function drawGuards(t) {
  for (const g of L.guards) if (g.alive) drawCone(g);
  for (const g of L.guards) {
    const cx = g.x + g.w / 2;
    if (!g.alive) {
      ctx.save(); ctx.translate(cx, g.y + g.h); ctx.globalAlpha = Math.max(0.35, 1 - g.deadT * 0.4);
      ctx.fillStyle = "#2b3550"; ctx.fillRect(-15, -8, 30, 8);
      ctx.fillStyle = "#a58a52"; ctx.beginPath(); ctx.moveTo(-g.dir * 26, -2); ctx.lineTo(-g.dir * 14, -12); ctx.lineTo(-g.dir * 6, -2); ctx.fill();
      ctx.restore(); ctx.globalAlpha = 1; continue;
    }
    const bob = g.kind === "patrol" && g.wait <= 0 ? Math.abs(Math.sin(g.anim * 8)) * 1.5 : 0;
    ctx.fillStyle = "#2b3550"; ctx.fillRect(g.x + 2, g.y + 10 - bob, g.w - 4, g.h - 10 + bob);
    ctx.fillStyle = "#1c2236"; ctx.fillRect(g.x + 2, g.y + g.h - 8, g.w - 4, 2);
    ctx.fillStyle = "#d9c4a0"; ctx.fillRect(cx - 4 + g.dir * 2, g.y + 4 - bob, 8, 7);
    ctx.fillStyle = "#a58a52"; ctx.beginPath(); ctx.moveTo(cx - 14, g.y + 6 - bob); ctx.lineTo(cx, g.y - 4 - bob); ctx.lineTo(cx + 14, g.y + 6 - bob); ctx.fill();
    ctx.fillStyle = "#6b5a37"; ctx.fillRect(cx - 14, g.y + 5 - bob, 28, 1.5);
    // spear
    ctx.strokeStyle = "#8a7a62"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx - g.dir * 6, g.y + g.h); ctx.lineTo(cx - g.dir * 6, g.y - 10); ctx.stroke();
    ctx.fillStyle = "#c9ced8"; ctx.beginPath(); ctx.moveTo(cx - g.dir * 6 - 2, g.y - 10); ctx.lineTo(cx - g.dir * 6, g.y - 17); ctx.lineTo(cx - g.dir * 6 + 2, g.y - 10); ctx.fill();
    // lantern
    const lx = cx + g.dir * 11, ly = g.y + 18 - bob;
    const lg = ctx.createRadialGradient(lx, ly, 1, lx, ly, 14); lg.addColorStop(0, "rgba(255,214,120,0.7)"); lg.addColorStop(1, "rgba(255,214,120,0)");
    ctx.fillStyle = lg; ctx.fillRect(lx - 14, ly - 14, 28, 28);
    ctx.fillStyle = "#ffd47a"; ctx.fillRect(lx - 2.5, ly - 3, 5, 6);
    if (g.kind === "watch" && g.turnT < 0.6) { ctx.fillStyle = "#ece4cf"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.fillText("?", cx, g.y - 20); }
    if (g.seeT > 0.05) {
      ctx.fillStyle = g.seeT >= SEE_LIMIT * 0.6 ? "#d0583f" : "#ffd47a";
      ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center"; ctx.fillText("!", cx, g.y - 20);
    }
  }
}

function drawRope(t) {
  const h = L.hook; if (h.state === "idle") return;
  const o = handPos();
  const hx = h.state === "attached" ? h.ax : h.x, hy = h.state === "attached" ? h.ay : h.y;
  ctx.strokeStyle = ropeColor(t); ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(o.x, o.y);
  if (h.state === "attached") {
    const d = Math.hypot(hx - o.x, hy - o.y);
    const slack = Math.max(0, h.len - d);
    ctx.quadraticCurveTo((o.x + hx) / 2, (o.y + hy) / 2 + slack * 0.6, hx, hy);
  } else ctx.lineTo(hx, hy);
  ctx.stroke();
  // hook head
  let ang = Math.atan2(hy - o.y, hx - o.x);
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang);
  ctx.fillStyle = skin().theme.hook; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-5, -3.5); ctx.lineTo(-3, 0); ctx.lineTo(-5, 3.5); ctx.fill();
  ctx.restore();
}

function drawPowers(t) {
  for (const pw of L.powers) {
    if (pw.taken) continue;
    const c = POWER[pw.kind].color, y = pw.y + Math.sin(t * 3 + pw.x) * 3;
    const gl = ctx.createRadialGradient(pw.x, y, 2, pw.x, y, 22);
    gl.addColorStop(0, c); gl.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = 0.55; ctx.fillStyle = gl; ctx.fillRect(pw.x - 22, y - 22, 44, 44); ctx.globalAlpha = 1;
    ctx.fillStyle = c; ctx.strokeStyle = "#0b0d1a"; ctx.lineWidth = 1.5;
    if (pw.kind === "*") { // cloak: hooded triangle
      ctx.beginPath(); ctx.moveTo(pw.x, y - 9); ctx.lineTo(pw.x + 8, y + 8); ctx.lineTo(pw.x - 8, y + 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (pw.kind === "+") { // boots: wing
      ctx.beginPath(); ctx.moveTo(pw.x - 8, y + 6); ctx.quadraticCurveTo(pw.x - 2, y - 10, pw.x + 9, y - 6); ctx.quadraticCurveTo(pw.x + 2, y, pw.x + 4, y + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else { // charm: diamond
      ctx.beginPath(); ctx.moveTo(pw.x, y - 9); ctx.lineTo(pw.x + 7, y); ctx.lineTo(pw.x, y + 9); ctx.lineTo(pw.x - 7, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
}
function skinColor(t) {
  const sk = skin();
  return sk.color === "rainbow" ? `hsl(${(t * 90) % 360},80%,60%)` : sk.color;
}
function ropeColor(t) {
  const r = skin().theme.rope;
  return r === "rainbow" ? `hsl(${(t * 90 + 180) % 360},75%,65%)` : r;
}
function drawPlayer(t) {
  if (mode === "dead") return;
  const p = L.player, cx = p.x + p.w / 2;
  // power-up auras
  const auras = [];
  if (p.cloak > 0) auras.push(POWER["*"].color);
  if (p.boots > 0) auras.push(POWER["+"].color);
  if (p.shield || p.invul > 0) auras.push(POWER["$"].color);
  auras.forEach((c, k) => {
    ctx.strokeStyle = c; ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 6 + k); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx, p.y + p.h / 2, 16 + k * 4, 20 + k * 4, 0, 0, Math.PI * 2); ctx.stroke();
  });
  ctx.globalAlpha = p.cloak > 0 ? 0.45 : p.invul > 0 && Math.floor(t * 12) % 2 ? 0.4 : 1;
  // scarf
  ctx.strokeStyle = skinColor(t); ctx.lineWidth = 3; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(p.scarf[0].x, p.scarf[0].y);
  for (const s of p.scarf) ctx.lineTo(s.x, s.y);
  ctx.stroke(); ctx.lineCap = "butt";
  const run = p.ground && Math.abs(p.vx) > 20;
  const leg = run ? Math.sin(p.run) * 4 : 0;
  ctx.fillStyle = "#0d0d14";
  // legs
  ctx.fillRect(cx - 6 + leg, p.y + 20, 4, 8);
  ctx.fillRect(cx + 2 - leg, p.y + 20, 4, 8);
  // torso
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(p.x + 1, p.y + 9, p.w - 2, 13, 3) : ctx.rect(p.x + 1, p.y + 9, p.w - 2, 13); ctx.fill();
  // head
  ctx.beginPath(); ctx.arc(cx, p.y + 6, 7, 0, Math.PI * 2); ctx.fill();
  // moon rim light
  ctx.fillStyle = "rgba(160,175,220,0.55)";
  ctx.fillRect(p.face > 0 ? p.x + p.w - 2 : p.x + 1, p.y + 10, 1.2, 11);
  // eye band
  ctx.fillStyle = "#ece4cf"; ctx.fillRect(cx - 2 + p.face * 2, p.y + 4, 6, 2);
  // belt
  ctx.fillStyle = skinColor(t); ctx.fillRect(p.x + 1, p.y + 18, p.w - 2, 2);
  ctx.globalAlpha = 1;
}

function drawGhost(t) {
  if (!save.ghost || !ghostPlay || mode !== "play") return;
  const n = ghostPlay.length / 2, f = runTime * GHOST_HZ;
  if (f >= n - 1) return; // the ghost has already reached the exit
  const k = Math.floor(f), u = f - k;
  const x = ghostPlay[k * 2] + (ghostPlay[k * 2 + 2] - ghostPlay[k * 2]) * u;
  const y = ghostPlay[k * 2 + 1] + (ghostPlay[k * 2 + 3] - ghostPlay[k * 2 + 1]) * u;
  const face = ghostPlay[k * 2 + 2] < ghostPlay[k * 2] ? -1 : 1, cx = x + PW / 2;
  ctx.globalAlpha = 0.32 + 0.06 * Math.sin(t * 5);
  ctx.fillStyle = "#9fb4e8";
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x + 1, y + 9, PW - 2, 19, 3) : ctx.rect(x + 1, y + 9, PW - 2, 19); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, y + 6, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#ece4cf"; ctx.fillRect(cx - 2 + face * 2, y + 4, 6, 2);
  ctx.fillStyle = skinColor(t); ctx.fillRect(x + 1, y + 18, PW - 2, 2);
  ctx.globalAlpha = 1;
}

function drawAim() {
  if (mode !== "play") return;
  if (master && !touchMode) return;
  if (touchMode && touchAim === null) return;
  const h = L.hook; if (h.state === "flying") return;
  const a = probeAim();
  let col = "rgba(236,228,207,0.25)", ok = false;
  if (a.hit) {
    const k = a.hit.kind;
    if (k === "anchor" || k === "switch" || k === "crate" || (k === "guard" && a.hit.back)) { col = ropeColor(runTime); ok = true; }
    else if (k === "guard") col = "rgba(208,88,63,0.9)";
    else col = "rgba(125,141,176,0.7)";
  }
  ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([3, 6]);
  ctx.beginPath(); ctx.moveTo(a.ox, a.oy); ctx.lineTo(a.x, a.y); ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = col; ctx.lineWidth = ok ? 2 : 1.2;
  ctx.beginPath(); ctx.arc(a.x, a.y, ok ? 6 : 4, 0, Math.PI * 2); ctx.stroke();
  if (a.hit && !ok && a.hit.kind === "steel") { ctx.beginPath(); ctx.moveTo(a.x - 4, a.y - 4); ctx.lineTo(a.x + 4, a.y + 4); ctx.moveTo(a.x + 4, a.y - 4); ctx.lineTo(a.x - 4, a.y + 4); ctx.stroke(); }
  if (touchMode) return;
  // mouse cursor
  const m = mouseWorld();
  ctx.strokeStyle = "rgba(236,228,207,0.6)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(m.x - 6, m.y); ctx.lineTo(m.x - 2, m.y); ctx.moveTo(m.x + 2, m.y); ctx.lineTo(m.x + 6, m.y); ctx.moveTo(m.x, m.y - 6); ctx.lineTo(m.x, m.y - 2); ctx.moveTo(m.x, m.y + 2); ctx.lineTo(m.x, m.y + 6); ctx.stroke();
}

function drawParticles() {
  for (const q of L.particles) {
    ctx.globalAlpha = clamp(q.life * 2, 0, 1);
    ctx.fillStyle = q.color; ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
  }
  ctx.globalAlpha = 1;
}

function drawVignette() {
  const w = cv.width / dpr, h = cv.height / dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const inGame = L && mode !== "menu";
  const hv = hard && inGame;
  ctx.drawImage(cachedLayer(hv ? "vigH" : "vig", (g, W, H) => {
    const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * (hv ? 0.2 : 0.35), W / 2, H / 2, Math.max(W, H) * (hv ? 0.62 : 0.75));
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, hv ? "rgba(20,0,0,0.88)" : "rgba(0,0,0,0.55)");
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    if (hv) { g.fillStyle = "rgba(120,20,30,0.08)"; g.fillRect(0, 0, W, H); }
  }), 0, 0, w, h);
  if ((master || (daily && daily.mod === 3) || lvAt(cur).dark) && inGame && L.player) {
    const p = L.player, px = (p.x + p.w / 2 - cam.x) * scale, py = (p.y + p.h / 2 - cam.y) * scale;
    const r = TS * scale;
    const lamp = ctx.createRadialGradient(px, py, r * 2.2, px, py, r * 6.5);
    lamp.addColorStop(0, "rgba(4,2,8,0)"); lamp.addColorStop(1, "rgba(4,2,8,0.96)");
    ctx.fillStyle = lamp; ctx.fillRect(0, 0, w, h);
  }
  if (mode === "dead") { ctx.fillStyle = `rgba(120,20,20,${0.25 * Math.max(0, 1 - deadT)})`; ctx.fillRect(0, 0, w, h); }
}

const menuSky = makeSky(9, 60);
function render(t) {
  drawSky(t);
  if (L) {
    worldTransform();
    // blit only the part of the prerendered map that is on screen; long maps are thousands of pixels wide
    const R = L.layer.width / (L.W * TS);
    const x0 = Math.max(0, Math.floor(cam.x)), y0 = Math.max(0, Math.floor(cam.y));
    const x1 = Math.min(L.W * TS, Math.ceil(cam.x + viewW) + 1), y1 = Math.min(L.H * TS, Math.ceil(cam.y + viewH) + 1);
    if (x1 > x0 && y1 > y0) ctx.drawImage(L.layer, x0 * R, y0 * R, (x1 - x0) * R, (y1 - y0) * R, x0, y0, x1 - x0, y1 - y0);
    drawDynamicTiles(t);
    drawVents(t);
    drawCrushers(t);
    drawLamps(t);
    drawFlags(t);
    drawCoins(t);
    drawPowers(t);
    drawKeys(t);
    drawCrates();
    drawGuards(t);
    drawRope(t);
    drawGhost(t);
    drawPlayer(t);
    drawParticles();
    drawChase(t);
    drawAim();
  }
  drawVignette();
}

// ---------- loop ----------
function step(dt) {
  if (run && !run.done && (mode === "play" || mode === "dead")) run.t += dt;
  if (mode === "play") {
    runTime += dt;
    save.stats.time = (save.stats.time || 0) + dt; // saved with the next death or clear
    while (ghostRec.length / 2 < runTime * GHOST_HZ) ghostRec.push(Math.round(L.player.x), Math.round(L.player.y));
    updatePlayer(dt);
    updateHook(dt);
    updateCrates(dt);
    updateGuards(dt);
    updateCrumble(dt);
    updateSprings(dt);
    updateWorld(dt);
  } else if (mode === "dead") {
    deadT += dt;
    updateCrates(dt);
    if (deadT > 0.65) { if (L.checkpoint) respawnAtCheckpoint(); else restartLevel(); }
  }
  if (L) updateParticles(dt);
}
let last = performance.now(), acc = 0;
function frame(now) {
  const raw = (now - last) / 1000;
  const dt = Math.min(0.05, raw); last = now;
  // adaptive resolution: if more than a third of recent play frames ran under ~40 fps, render fewer pixels
  if (mode === "play" && raw < 0.5) {
    sampleFrames++; if (raw > 1 / 40) slowFrames++;
    if (sampleFrames >= 120) {
      if (slowFrames > 40 && dpr > 1) { dprCap = Math.max(1, dpr - 0.25); resize(); }
      sampleFrames = slowFrames = 0;
    }
  }
  if (L && (mode === "play" || mode === "dead")) {
    acc += dt;
    while (acc >= STEP) { step(STEP); acc -= STEP; }
    updateCamera(dt);
    updateHUD();
  }
  render(now / 1000);
  requestAnimationFrame(frame);
}

// ---------- boot ----------
// Called once by React with the canvas element; wires up input and starts the loop.
let attached = false;
export function attach(canvas) {
  if (attached) return;
  attached = true;
  cv = canvas; ctx = cv.getContext("2d");
  resize();
  window.addEventListener("resize", () => { resize(); if (L && mode !== "menu") { measurePads(); } });
  window.addEventListener("orientationchange", () => setTimeout(resize, 150));
  if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", (e) => { keys[e.code] = false; });
  window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) { if (mode === "play" || mode === "pause") keepAwake(true); return; }
    if (mode === "play") pauseGame();
    for (const k in keys) keys[k] = false;
    resetTouch(); touchAim = null;
  });

  cv.addEventListener("pointermove", (e) => {
    if (e.pointerType === "mouse" || e.pointerId === touchAim) { mouse.sx = e.clientX; mouse.sy = e.clientY; }
  });
  cv.addEventListener("pointerdown", (e) => {
    ensureAudio();
    const touch = e.pointerType !== "mouse";
    setTouchMode(touch);
    mouse.sx = e.clientX; mouse.sy = e.clientY;
    if (mode !== "play") return;
    if (touch) {
      e.preventDefault();
      touchAim = e.pointerId;
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    } else if (e.button === 2) releaseHook();
    else if (e.button === 0) fireHook();
  });
  cv.addEventListener("pointerup", (e) => {
    if (e.pointerId !== touchAim) return;
    touchAim = null;
    if (mode === "play") fireHook();
  });
  cv.addEventListener("pointercancel", (e) => { if (e.pointerId === touchAim) touchAim = null; });
  cv.addEventListener("contextmenu", (e) => e.preventDefault());

  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; update("install", { shown: true }); });
  window.addEventListener("appinstalled", () => { installEvt = null; update("install", { shown: false, noteShown: false }); toast("앱이 설치되었습니다"); });
  // Always offer the button outside the installed app; when the browser gives no prompt, explain the manual steps.
  if (!standalone()) update("install", { shown: true });

  // Any touch anywhere (menu included) switches to touch controls; a mouse switches back.
  window.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch") setTouchMode(true); else if (e.pointerType === "mouse") setTouchMode(false); }, true);
  // iOS Safari ignores user-scalable=no: block pinch and double-tap zoom during play.
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  let lastTouchEnd = 0;
  document.addEventListener("touchend", (e) => {
    const now = Date.now();
    if (now - lastTouchEnd < 350 && (mode === "play" || mode === "dead")) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });

  setState({ touch: touchMode });
  showMenu();
  requestAnimationFrame(frame);
}
