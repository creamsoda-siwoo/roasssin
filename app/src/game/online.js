// Online features backed by Supabase: rankings, the stage gallery and cloud saves.
// The browser only calls the ra_* database functions; each write sends the player's id and secret,
// which the server checks against a hash. Everything here fails quietly so the game stays playable offline.
const API = "https://ekdisahabshzffvfytft.supabase.co/rest/v1/rpc/";
const KEY = "sb_publishable_sDVBKQvkD_-eJqMtEV1cWw_uai1eNXo"; // publishable: safe to ship in the page
const ACC_KEY = "rope-assassin-online-v1";

async function rpc(fn, args) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(API + fn, {
      method: "POST", signal: ctl.signal,
      headers: { apikey: KEY, "Content-Type": "application/json" },
      body: JSON.stringify(args || {}),
    });
    const text = await r.text();
    const body = text ? JSON.parse(text) : null;
    if (!r.ok) throw new Error((body && body.message) || "HTTP " + r.status);
    return body;
  } finally { clearTimeout(t); }
}

let acc = null;
try { acc = JSON.parse(localStorage.getItem(ACC_KEY) || "null"); } catch (e) {}
const keep = () => { try { localStorage.setItem(ACC_KEY, JSON.stringify(acc)); } catch (e) {} };
const cred = () => ({ p_id: acc.id, p_secret: acc.secret });

export const account = () => acc;
export async function register(name) {
  const r = await rpc("ra_register", { p_name: name });
  acc = { id: r.id, secret: r.secret, name: String(name || "").trim().slice(0, 16) || "이름 없는 자객" };
  keep();
  return acc;
}
export async function rename(name) {
  await rpc("ra_rename", { ...cred(), p_name: name });
  acc.name = name.trim().slice(0, 16); keep();
}
// The device link code is the whole account: id and secret. Pasting it on another device signs in there.
export const linkCode = () => (acc ? acc.id + "." + acc.secret : "");
export async function link(code) {
  const [id, secret] = String(code).trim().split(".");
  if (!/^[0-9a-f-]{36}$/.test(id || "") || !/^[0-9a-f]{36}$/.test(secret || "")) throw new Error("bad code");
  const r = await rpc("ra_save_get", { p_id: id, p_secret: secret });
  acc = { id, secret, name: (r && r.name) || "" }; keep();
  return r;
}
export function signOut() { acc = null; try { localStorage.removeItem(ACC_KEY); } catch (e) {} }

// Boards: "lv:<diff>:<stage>", "boss:<diff>:<k>", "bonus:<diff>" keep the fastest time; "tower:<diff>" the highest floor.
export function submit(board, value) {
  if (!acc) return Promise.resolve(false);
  return rpc("ra_submit", { ...cred(), p_board: board, p_value: value }).then(() => true, () => false);
}
export const board = (b) => rpc("ra_board", { p_board: b, p_id: acc ? acc.id : null });

export const gallery = (sort, offset = 0) => rpc("ra_gallery", { p_sort: sort, p_offset: offset, p_id: acc ? acc.id : null });
export const stage = (id) => rpc("ra_stage", { p_stage: id });
export const upload = (name, code) => rpc("ra_upload", { ...cred(), p_name: name, p_code: code });
export const like = (id) => rpc("ra_like", { ...cred(), p_stage: id });
export const removeStage = (id) => rpc("ra_delete_stage", { ...cred(), p_stage: id });

export const cloudPut = (data) => rpc("ra_save_put", { ...cred(), p_data: data });
export const cloudGet = () => rpc("ra_save_get", cred());
