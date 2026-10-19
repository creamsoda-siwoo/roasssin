import { useEffect, useRef, useState, memo } from "react";
import * as game from "../game/engine.js";

// Tiles offered in the editor: [map char, name, colour]. The engine reads the same characters as the campaign maps.
const TILES = [
  [" ", "지우개", "#0d0f18"], ["X", "돌벽", "#323c55"], ["#", "들보", "#8b6a4c"], ["^", "가시", "#c8423b"],
  ["P", "시작", "#f2ead3"], ["E", "출구", "#ffd47a"], ["F", "깃발", "#e86a5a"], ["o", "금화", "#f5c542"],
  ["l", "사다리", "#a07850"], ["C", "썩은 들보", "#6b5a3a"], ["N", "무너지는 바닥", "#7a6650"], ["w", "금 간 벽", "#5a6278"],
  ["I", "얼음", "#a8e0f0"], ["~", "눈더미", "#e8f0f8"], ["J", "용수철", "#6fd08c"], ["W", "기류", "#7fb8e8"],
  [">", "흐르는 바닥 →", "#b08a50"], ["<", "흐르는 바닥 ←", "#b08a50"], ["}", "옆바람 →", "#9fc8e8"], ["{", "옆바람 ←", "#9fc8e8"],
  ["Z", "금빛 발판", "#e8c15a"], ["z", "청록 발판", "#4fc8b8"], ["=", "움직이는 발판 ↔", "#c8a070"], ["|", "움직이는 발판 ↕", "#c8a070"],
  ["@", "톱날 ↔", "#d0d0d8"], ["%", "톱날 ↕", "#d0d0d8"], ["M", "돌절구", "#8a8a98"], ["A", "불기둥", "#ff8a3a"],
  ["R", "화살 함정 →", "#b85040"], ["r", "화살 함정 ←", "#b85040"], ["v", "고드름", "#cfefff"], ["e", "물", "#2f6fb0"],
  ["f", "독안개", "#7fa860"], ["b", "덤불", "#3f7a3a"], ["B", "상자", "#a8783c"], ["_", "누름판", "#c0a060"],
  ["H", "셔터", "#6a7088"], ["K", "열쇠", "#ffd47a"], ["D", "잠긴 문", "#9a6a2a"], ["S", "스위치", "#e05a8a"],
  ["G", "붉은 문", "#c8423b"], ["g", "청록 문", "#3fb8a8"], ["O", "순간이동 문 O", "#b48cf0"], ["Q", "순간이동 문 Q", "#8cc0f0"],
  ["T", "순찰병", "#d05050"], ["V", "파수꾼", "#d07050"], ["Y", "잠든 경비 ←", "#a05858"], ["U", "잠든 경비 →", "#a05858"],
  ["m", "추적자 ←", "#e03030"], ["a", "추적자 →", "#e03030"], ["k", "표적 ←", "#f0c040"], ["q", "표적 →", "#f0c040"],
  ["L", "탐조등", "#fff0a0"], [";", "삐걱이는 마루", "#9a7a5a"], ["&", "종", "#e0b040"], ["h", "갇힌 사람", "#9fd8ff"],
  ["*", "그림자 망토", "#b48cf0"], ["+", "바람 신발", "#9fe0ff"], ["$", "수호 부적", "#ffd47a"],
];
const COLOR = Object.fromEntries(TILES.map(([c, , col]) => [c, col]));
const NAME = Object.fromEntries(TILES.map(([c, n]) => [c, n]));
const SOLID = new Set(["X", "#", "^", " ", "e", "f", "b", "~", "I", "N", "C", "w", ">", "<", "Z", "z", "G", "g", "H", "D", ";", "W", "{", "}", "l"]);
const CELL = 22;

function blank(W = 40, H = 15) {
  const rows = [];
  for (let y = 0; y < H; y++) {
    let r = "";
    for (let x = 0; x < W; x++) r += x === 0 || x === W - 1 || y === 0 || y >= H - 2 ? "X" : " ";
    rows.push(r);
  }
  const put = (x, y, c) => { rows[y] = rows[y].slice(0, x) + c + rows[y].slice(x + 1); };
  put(2, H - 3, "P"); put(W - 3, H - 3, "E");
  return { name: "", map: rows };
}
function resize(map, W, H) {
  const out = [];
  for (let y = 0; y < H; y++) {
    const src = map[y] || "";
    let r = "";
    for (let x = 0; x < W; x++) r += src[x] !== undefined ? src[x] : (x === W - 1 || y === H - 1 ? "X" : " ");
    out.push(r);
  }
  return out;
}

function Editor({ shown }) {
  const [draft, setDraft] = useState(() => game.loadDraft() || blank());
  const [tile, setTile] = useState("#");
  const [msg, setMsg] = useState("");
  const [code, setCode] = useState("");
  const [pan, setPan] = useState(false);
  const cvRef = useRef(null), painting = useRef(false), draftRef = useRef(draft);
  draftRef.current = draft;
  const W = Math.max(...draft.map.map((r) => r.length)), H = draft.map.length;

  // a test run may have marked the draft cleared; pick that up whenever the editor opens again
  useEffect(() => { if (shown) { const d = game.loadDraft(); if (d) setDraft(d); } }, [shown]);
  useEffect(() => { game.saveDraft(draft); }, [draft]);

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv || !shown) return;
    cv.width = W * CELL; cv.height = H * CELL;
    const g = cv.getContext("2d");
    g.fillStyle = "#0d0f18"; g.fillRect(0, 0, cv.width, cv.height);
    g.font = "bold 13px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = draft.map[y][x] || " ";
      if (c === " ") continue;
      const px = x * CELL, py = y * CELL;
      g.fillStyle = COLOR[c] || "#555";
      if (SOLID.has(c)) g.fillRect(px, py, CELL, CELL);
      else { g.beginPath(); g.arc(px + CELL / 2, py + CELL / 2, CELL / 2 - 2, 0, Math.PI * 2); g.fill(); }
      if (c !== "X" && c !== "#") { g.fillStyle = "rgba(0,0,0,0.75)"; g.fillText(c, px + CELL / 2, py + CELL / 2 + 1); }
    }
    g.strokeStyle = "rgba(255,255,255,0.06)"; g.lineWidth = 1;
    for (let x = 0; x <= W; x++) { g.beginPath(); g.moveTo(x * CELL + 0.5, 0); g.lineTo(x * CELL + 0.5, H * CELL); g.stroke(); }
    for (let y = 0; y <= H; y++) { g.beginPath(); g.moveTo(0, y * CELL + 0.5); g.lineTo(W * CELL, y * CELL + 0.5); g.stroke(); }
  }, [draft, shown, W, H]);

  const paintAt = (e, erase) => {
    const r = cvRef.current.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * W), y = Math.floor(((e.clientY - r.top) / r.height) * H);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const c = erase ? " " : tile, d = draftRef.current;
    if ((d.map[y][x] || " ") === c) return;
    let map = d.map.slice();
    if (c === "P") map = map.map((row) => row.replace("P", " ")); // only one start
    map[y] = map[y].slice(0, x) + c + map[y].slice(x + 1);
    setDraft({ ...d, map, cleared: false, best: null });
  };
  const down = (e) => {
    if (pan) return;
    e.preventDefault();
    painting.current = e.button === 2 ? "erase" : "paint";
    try { cvRef.current.setPointerCapture(e.pointerId); } catch (err) {}
    paintAt(e, painting.current === "erase");
  };
  const move = (e) => { if (painting.current) paintAt(e, painting.current === "erase"); };
  const up = () => { painting.current = false; };

  const setSize = (dw, dh) => {
    const nW = Math.max(16, Math.min(160, W + dw)), nH = Math.max(10, Math.min(40, H + dh));
    setDraft({ ...draft, map: resize(draft.map, nW, nH), cleared: false, best: null });
  };
  const test = () => { const err = game.testDraft(draft); setMsg(err); };
  const share = async () => {
    const c = await game.draftCode(draft);
    setCode(c);
    try { await navigator.clipboard.writeText(c); setMsg(draft.cleared ? "코드를 복사했다" : "코드를 복사했다 · 아직 완주 확인을 하지 않은 막이다"); }
    catch (err) { setMsg("아래 칸의 코드를 복사해 보내라"); }
  };
  const load = async () => {
    try { const d = await game.readCode(code); setDraft({ ...d, cleared: false, best: null }); setMsg(`불러왔다 · ${d.name || "이름 없는 막"}`); }
    catch (err) { setMsg("읽을 수 없는 코드다"); }
  };
  const fresh = () => { if (confirm("지금 그린 막을 지우고 새로 시작할까?")) { setDraft(blank()); setMsg(""); } };

  return (
    <div className="overlay" id="editor" hidden={!shown}>
      <div className="panel editor">
        <div className="edhead">
          <h2>막 만들기</h2>
          <input id="edName" maxLength={24} placeholder="막 이름" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <span className={"edok" + (draft.cleared ? " on" : "")}>{draft.cleared ? `완주 확인 ✓ ${draft.best ? draft.best.toFixed(1) + "초" : ""}` : "완주 확인 전"}</span>
        </div>
        <div className="palette" id="edPalette">
          {TILES.map(([c, n, col]) => (
            <button key={c} type="button" title={n} className={"tile" + (tile === c && !pan ? " sel" : "")} onClick={() => { setTile(c); setPan(false); }}>
              <i style={{ background: col }}>{c === " " ? "⌫" : c}</i><span>{n}</span>
            </button>
          ))}
          <button type="button" className={"tile" + (pan ? " sel" : "")} title="화면 옮기기" onClick={() => setPan(!pan)}><i style={{ background: "#444" }}>✋</i><span>옮기기</span></button>
        </div>
        <p className="edtip">{pan ? "옮기기 · 끌어서 화면을 움직인다" : `${NAME[tile]} · 누르거나 끌어서 칠한다 · 오른쪽 클릭은 지우개`}</p>
        <div className="edgrid" style={{ touchAction: pan ? "auto" : "none" }}>
          <canvas id="edCanvas" ref={cvRef} style={{ width: W * CELL, height: H * CELL }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onContextMenu={(e) => e.preventDefault()} />
        </div>
        <div className="row edsize">
          <span>크기 {W}×{H}</span>
          <button type="button" onClick={() => setSize(-4, 0)}>폭 −</button>
          <button type="button" onClick={() => setSize(4, 0)}>폭 +</button>
          <button type="button" onClick={() => setSize(0, -1)}>높이 −</button>
          <button type="button" onClick={() => setSize(0, 1)}>높이 +</button>
          <button type="button" onClick={fresh}>새로 그리기</button>
        </div>
        <div className="row">
          <button className="primary" id="edTest" type="button" onClick={test}>시험하기</button>
          <button id="edShare" type="button" onClick={share}>코드 복사</button>
          <button id="edMenu" type="button" onClick={game.showMenu}>메뉴로</button>
        </div>
        {msg && <p className="edmsg" id="edMsg">{msg}</p>}
        <div className="row edcode">
          <input id="edCode" placeholder="친구에게 받은 코드를 붙여 넣기" value={code} onChange={(e) => setCode(e.target.value)} />
          <button id="edLoad" type="button" onClick={load} disabled={!code.trim()}>불러오기</button>
        </div>
      </div>
    </div>
  );
}

export default memo(Editor);
