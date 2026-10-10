// A tiny external store: the game engine writes UI state here and React reads it with useSyncExternalStore.
let state = {
  mode: "menu",
  overlay: "menu", // "menu" | "pause" | "win" | null
  hudShown: false,
  touch: false,
  muted: false,
  rev: 0, // bumped whenever the save or difficulty changes, so the menu re-reads them
  hud: { act: "", hard: false, master: false, name: "", goal: "", goalFaded: false, goalHidden: false, hint: "", hintFaded: false, time: "0.0", run: null, deaths: 0, chips: [] },
  toast: { msg: "", bad: false, show: false },
  card: { act: "", name: "", show: false },
  pause: { act: "" },
  win: { act: "", title: "", stars: null, starNote: "", time: "", deaths: 0, best: "", next: "다음 막", retry: "다시 하기", menuBtn: true },
  install: { shown: false, note: "", noteShown: false },
  story: { label: "", title: "", lines: [], n: 0 },
  stickReset: 0,
};
const listeners = new Set();

export const getState = () => state;
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function setState(patch) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
}
// Shallow-merges into one nested section, e.g. update("hud", { time: "1.2" }).
export function update(key, patch) {
  setState({ [key]: { ...state[key], ...patch } });
}
