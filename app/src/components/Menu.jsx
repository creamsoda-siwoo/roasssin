import { useEffect, useState, memo } from "react";
import * as game from "../game/engine.js";
import { LEVELS } from "../game/levels.js";

const onOff = (on) => (on ? " 켬" : " 끔");

function Toggle({ id, k, label, info, touchOnly }) {
  const on = info.settings[k];
  return (
    <button className={touchOnly ? "touch-only" : undefined} id={id} type="button" aria-pressed={String(on)} onClick={() => game.toggleSetting(k)}>
      {label + onOff(on)}
    </button>
  );
}

function LevelTile({ lv }) {
  const title = `${lv.i + 1}막 · ${lv.name}` + (lv.locked ? " (잠김)" : lv.best !== null ? ` · 최고 ${lv.best.toFixed(1)}초` : "");
  return (
    <button type="button" className={"lv" + (lv.best !== null ? " clear" : "")} id={"lv" + lv.i} disabled={lv.locked} title={title} aria-label={title} onClick={() => game.playLevel(lv.i)}>
      <span className="n">{lv.i + 1}</span>
      <span className="best">{lv.best !== null ? "★".repeat(lv.stars) + "☆".repeat(3 - lv.stars) : lv.locked ? "🔒" : ""}</span>
    </button>
  );
}

// Chapter holding the latest unlocked stage.
const chapterOf = (info) => Math.max(0, info.chapters.findIndex((c) => info.next - 1 >= c.a && info.next - 1 < c.b));

function Menu({ info, shown, touch, muted, install }) {
  // the stage list shows one chapter at a time (-1 = every stage); reopen on the current chapter
  const [chap, setChap] = useState(() => chapterOf(info));
  useEffect(() => { if (shown) setChap(chapterOf(info)); }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  // keep the selected chapter tab in view in the scrolling tab row
  useEffect(() => {
    if (!shown) return;
    const el = document.getElementById("ch" + chap);
    const id = requestAnimationFrame(() => { try { el.scrollIntoView({ block: "nearest", inline: "center" }); } catch (e) {} });
    return () => cancelAnimationFrame(id);
  }, [shown, chap]);
  const shownLevels = chap < 0 ? info.levels : info.levels.slice(info.chapters[chap].a, info.chapters[chap].b);

  return (
    <div className="overlay" id="menu" hidden={!shown}>
      <div className="panel">
        <div className="brand">
          <h1>줄타는<br /> 자객</h1>
          <div className="seal" aria-hidden="true">刺<br />客</div>
        </div>
        <p className="lead">밤의 성채에 숨어든 자객. 쇠갈고리 하나로 들보와 벽을 타고, 막마다 다른 장치를 풀어 출구까지 가라.</p>
        <p className="startotal" id="starTotal">{info.starTotal}</p>
        <div className="row">
          <button className="primary" id="bCont" type="button" onClick={game.playContinue}>{info.cont}</button>
          <button id="bDaily" type="button" onClick={game.playDaily}>{info.daily}</button>
          <button id="bHard" type="button" aria-pressed={String(info.hard)} className={info.master ? "master" : undefined} onClick={game.cycleDifficulty}>난이도 · {info.diffName}</button>
          <button id="bBonus" type="button" className={"bonus" + (info.bonus.cleared ? " cleared" : "")} title="칠흑 · 불길 추격 · 썩은 들보 · 깃발 없음" onClick={game.playBonus}>{info.bonus.label}</button>
          <button id="bInstall" type="button" hidden={!install.shown} onClick={game.installClick}>앱 설치</button>
        </div>
        <details className="fold" id="settings">
          <summary>설정</summary>
          <div className="row">
            <button id="bSound" type="button" onClick={game.soundClick}>{muted ? "소리 끔" : "소리 켬"}</button>
            <button id="bSkin" type="button" style={{ color: info.skin.color || undefined }} onClick={game.nextSkin}>{info.skin.label}</button>
            <Toggle id="bGhost" k="ghost" label="고스트" info={info} />
            <Toggle id="bBig" k="big" label="큰 버튼" info={info} touchOnly />
            <Toggle id="bLeft" k="left" label="왼손 모드" info={info} touchOnly />
            <Toggle id="bFade" k="fade" label="버튼 투명" info={info} touchOnly />
            <Toggle id="bVib" k="vib" label="진동" info={info} touchOnly />
            {game.canFullscreen() && <button className="touch-only" id="bFull" type="button" onClick={game.fullscreen}>전체 화면으로</button>}
          </div>
        </details>
        <p className="hardnote installnote" id="installNote" hidden={!install.noteShown}>{install.note}</p>
        <div className="hardnote" id="hardNote" hidden={!info.hard}>
          <div id="masterNote" hidden={!info.master}><b>마스터 모드: 하드 모드의 모든 규칙에 더해</b>
            <ul>
              <li>등불 하나만 든 어둠 · 내 주변만 보인다</li>
              <li>경비가 거의 즉시 알아채고 더 멀리 본다 · 순찰이 훨씬 빠르다</li>
              <li>금 간 들보가 순식간에 무너진다</li>
              <li>조준선이 보이지 않는다 (PC)</li>
              <li>기록은 따로 남는다</li>
            </ul>
          </div>
          <b>하드 모드에서 달라지는 것</b>
          <ul>
            <li>체크포인트 깃발이 없다 · 죽으면 막 처음부터</li>
            <li>파워업(망토·신발·부적)이 나오지 않는다 · 파워업이 꼭 필요한 막은 예외</li>
            <li>시야가 어둡고 좁다</li>
            <li>경비 시야가 넓고 순식간에 알아챈다 · 순찰이 빠르고 파수꾼이 자주 돌아본다</li>
            <li>금 간 들보가 더 빨리 무너지고 늦게 되살아난다</li>
            <li>기록은 일반 모드와 따로 남는다</li>
          </ul>
        </div>
        <div className="chaptabs" id="chapTabs" role="tablist" aria-label="장 고르기">
          <button type="button" role="tab" id="ch-1" aria-selected={chap < 0} className={"chtab all" + (chap < 0 ? " on" : "")} onClick={() => setChap(-1)}>
            <b>전체</b><small>{info.levels.length}막</small>
          </button>
          {info.chapters.map((c) => (
            <button key={c.k} type="button" role="tab" id={"ch" + c.k} aria-selected={chap === c.k} disabled={c.locked}
              className={"chtab" + (chap === c.k ? " on" : "") + (c.clear === c.b - c.a ? " done" : "")}
              title={`제${c.k + 1}장 · ${c.title}`} onClick={() => setChap(c.k)}>
              <b>{c.k + 1}장</b><small>{c.locked ? "🔒" : `★${c.stars}`}</small>
            </button>
          ))}
        </div>
        {chap >= 0 && (
          <p className="chaphead" id="chapHead">
            제{chap + 1}장 · {info.chapters[chap].title}
            <span>{info.chapters[chap].a + 1}–{info.chapters[chap].b}막 · 깬 막 {info.chapters[chap].clear}/{info.chapters[chap].b - info.chapters[chap].a} · ★ {info.chapters[chap].stars}/{(info.chapters[chap].b - info.chapters[chap].a) * 3}</span>
          </p>
        )}
        <div className="levels" id="levelList">
          {shownLevels.map((lv) => <LevelTile key={lv.i} lv={lv} />)}
        </div>
        <details className="fold sr">
          <summary id="srTitle">{info.srTitle}</summary>
          <p>구간의 막을 쉬지 않고 이어서 깬다. 시간은 막 사이에 멈추고, 죽거나 재시작해도 계속 흐른다. 구간의 막을 모두 열어야 도전할 수 있다.</p>
          <div className="srgrid" id="srList">
            {info.segments.map((sg, idx) => (
              <button key={idx} type="button" className={"srb" + (sg.all ? " all" : "")} id={"sr" + idx} disabled={sg.locked} onClick={() => game.playRun(sg.a, sg.b)}>
                <b>{sg.label}</b><small>{sg.sub}</small>
              </button>
            ))}
          </div>
        </details>
        <details className="fold">
          <summary>이야기 {info.story.filter((c) => c.open).length}/{info.story.length}</summary>
          <div className="srgrid" id="storyList">
            {info.story.map((c) => (
              <button key={c.key} type="button" className="srb" disabled={!c.open} onClick={() => game.readStory(c.key)}>
                <b>{c.open ? c.label : "잠김"}</b>
              </button>
            ))}
          </div>
        </details>
        <details className="fold">
          <summary>업적 {info.achievements.filter((a) => a.done).length}/{info.achievements.length}</summary>
          <div className="achgrid" id="achList">
            {info.achievements.map((a) => (
              <div key={a.id} className={"ach" + (a.done ? " done" : "")}>
                <b>{a.done ? "✓ " : ""}{a.name}</b>
                <small>{a.desc}{a.prog && !a.done ? ` · ${a.prog}` : ""}</small>
                {!a.done && <div className="bar"><i style={{ width: a.pct + "%" }} /></div>}
              </div>
            ))}
          </div>
        </details>
        <details className="fold">
          <summary>기록</summary>
          <dl className="statgrid" id="statList">
            {info.stats.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </details>
        <GimmickBook levels={info.levels} />
        <SaveTransfer />
        <details className="fold">
          <summary>조작법</summary>
          <dl className="controls touch-only">
            <dt><kbd>화면 누르기</kbd></dt><dd>누른 채로 조준하고, 떼면 후크 발사 · 가까운 들보에 자동으로 맞춰 준다</dd>
            <dt><kbd>왼쪽 스틱</kbd></dt><dd>좌우 이동·흔들기 · 위로 밀면 줄 감기, 아래로 밀면 줄 풀기</dd>
            <dt><kbd>점프</kbd></dt><dd>점프 · 매달려 있을 때는 줄을 놓고 도약</dd>
            <dt><kbd>놓기</kbd></dt><dd>줄 놓기</dd>
            <PowerHelp />
          </dl>
          <dl className="controls mouse-only">
            <dt><kbd>클릭</kbd></dt><dd>후크 발사 · 나무 들보에만 걸린다 (매달린 채 다시 클릭하면 새로 건다)</dd>
            <dt><kbd>W</kbd> <kbd>S</kbd></dt><dd>줄 감기 / 풀기 · 벽에 붙어 감으면 벽을 타고 오른다</dd>
            <dt><kbd>A</kbd> <kbd>D</kbd></dt><dd>이동 · 매달려 있을 때는 흔들기</dd>
            <dt><kbd>Space</kbd></dt><dd>점프 · 매달려 있을 때는 줄을 놓고 도약</dd>
            <dt><kbd>우클릭</kbd> <kbd>Q</kbd></dt><dd>줄 놓기</dd>
            <dt><kbd>R</kbd> <kbd>M</kbd></dt><dd>재시작 · 소리 켜기/끄기</dd>
            <PowerHelp />
          </dl>
        </details>
      </div>
    </div>
  );
}

// Move progress to another device: copy this device's code, or paste one from elsewhere.
function SaveTransfer() {
  const [code, setCode] = useState("");
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState({ text: "", bad: false });
  const copy = () => {
    const c = game.exportCode();
    setCode(c);
    const done = () => setMsg({ text: "코드를 복사했다. 다른 기기의 '코드 붙여 넣기'에 넣어라.", bad: false });
    const manual = () => setMsg({ text: "자동 복사가 막혀 있다. 아래 코드를 길게 눌러 직접 복사하라.", bad: false });
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(c).then(done, manual); else manual();
  };
  const load = () => {
    if (!paste.trim()) { setMsg({ text: "먼저 코드를 붙여 넣어라.", bad: true }); return; }
    if (!window.confirm("이 기기의 진행 상황을 붙여 넣은 코드로 바꿉니다. 되돌릴 수 없습니다. 계속할까요?")) return;
    const err = game.importCode(paste);
    setMsg(err ? { text: err, bad: true } : { text: "불러왔다. 다시 시작한다…", bad: false });
  };
  return (
    <details className="fold">
      <summary>진행 옮기기</summary>
      <p className="xfernote">다른 기기나 브라우저로 진행 상황(막, 별, 기록, 업적, 설정)을 옮긴다. 고스트는 옮겨지지 않는다.</p>
      <div className="row">
        <button type="button" id="bExport" onClick={copy}>코드 복사</button>
      </div>
      {code && <textarea className="xfercode" id="exportCode" readOnly rows={3} value={code} onFocus={(e) => e.target.select()} aria-label="내 저장 코드" />}
      <textarea className="xfercode" id="importCode" rows={3} value={paste} placeholder="다른 기기에서 복사한 코드 붙여 넣기" onChange={(e) => setPaste(e.target.value)} aria-label="저장 코드 붙여 넣기" />
      <div className="row">
        <button type="button" id="bImport" onClick={load}>불러오기</button>
      </div>
      {msg.text && <p className={"xfermsg" + (msg.bad ? " bad" : "")} id="xferMsg" role="status">{msg.text}</p>}
    </details>
  );
}

function PowerHelp() {
  return (
    <>
      <dt><kbd style={{ color: "#b48cf0" }}>▲</kbd> <kbd style={{ color: "#9fe0ff" }}>〰</kbd> <kbd style={{ color: "#ffd47a" }}>◆</kbd></dt>
      <dd>파워업 · 보라 망토는 8초 투명, 하늘색 신발은 12초 2단 점프, 금색 부적은 죽음을 한 번 막아 준다</dd>
      <dt><kbd style={{ color: "#ffd47a" }}>●</kbd> <kbd style={{ color: "#e65a1e" }}>불길</kbd></dt>
      <dd>맵 형식 · 금화 맵은 금화를 모두 모아야 출구가 열리고, 추격 맵은 왼쪽에서 다가오는 불길에 닿기 전에 출구로 가야 한다</dd>
      <dt><kbd style={{ color: "#ff8c3c" }}>▥</kbd></dt>
      <dd>화염 분출구 · 바닥 쇠창살에서 주기적으로 불기둥이 솟는다. 창살이 깜빡이면 곧 솟으니, 꺼진 틈에 지나가라</dd>
      <dt><kbd style={{ color: "#fff1b8" }}>◭</kbd></dt>
      <dd>탐조등 · 매달린 등불이 좌우로 빛줄기를 흔든다. 빛 안에 잠깐만 머물러도 들킨다. 지붕과 벽 그늘에 숨거나 망토를 써라</dd>
      <dt><kbd style={{ color: "#8a96b4" }}>▤</kbd></dt>
      <dd>무너지는 바닥 · 금 간 돌바닥은 딛자마자 무너져 내린다. 멈추지 말고 건너라. 무너진 바닥은 잠시 뒤 다시 생긴다</dd>
      <dt><kbd style={{ color: "#c9a45a" }}>»</kbd></dt>
      <dd>흐르는 바닥 · 올라서면 화살표 쪽으로 실려 간다. 같은 쪽으로 달리면 빨라지고, 거슬러 달리면 느려진다. 그 위에서는 멈춰 설 수 없다</dd>
      <dt><kbd style={{ color: "#8a8796" }}>▼</kbd></dt>
      <dd>돌절구 · 천장에 매달린 돌덩이가 흔들리다 바닥까지 내리꽂힌다. 위로 다 올라가 멈춰 있을 때 그 밑을 지나라</dd>
      <dt><kbd style={{ color: "#e0b45a" }}>▬</kbd></dt>
      <dd>깜빡이는 발판 · 금빛 발판과 청록 발판이 번갈아 나타났다 사라진다. 사라지기 직전에 깜빡이니, 그 전에 건너라</dd>
      <dt><kbd style={{ color: "#c9b48a" }}>➶</kbd></dt>
      <dd>화살 함정 · 벽 구멍에서 2초마다 화살이 날아온다. 구멍이 빛나면 곧 쏜다. 화살은 허리 높이로 날아오니 뛰어넘거나 사이를 지나라</dd>
      <dt><kbd style={{ color: "#c4cad8" }}>✲</kbd></dt>
      <dd>톱날 · 홈을 따라 오가는 톱날에 닿으면 베인다. 옆으로 오가는 톱날은 뛰어넘고, 위아래로 오가는 톱날은 올라간 틈에 지나라</dd>
      <dt><kbd style={{ color: "#8b6a4c" }}>▭</kbd></dt>
      <dd>움직이는 발판 · 나무 발판이 홈을 따라 옆으로, 또는 위아래로 오간다. 올라타면 함께 실려 가니, 가까이 왔을 때 올라타고 반대편에서 내려라</dd>
      <dt><kbd style={{ color: "#bedcf0" }}>≫</kbd></dt>
      <dd>옆바람 · 바람골에서는 몇 초마다 거센 옆바람이 분다. 바람을 거슬러서는 걸을 수 없고, 등지고 뛰면 훨씬 멀리 날아간다. 줄무늬가 짙어지면 곧 분다</dd>
      <dt><kbd style={{ color: "#cfefff" }}>▾</kbd></dt>
      <dd>고드름 · 천장의 고드름은 그 밑을 지나면 흔들리다 떨어진다. 멈추지 말고 달려 지나면 뒤에 떨어진다. 깨진 고드름은 잠시 뒤 다시 자란다</dd>
      <dt><kbd style={{ color: "#e8f0f8" }}>▔</kbd></dt>
      <dd>눈더미 · 깊은 눈 위에서는 절반 빠르기로만 걸을 수 있고, 뛰어도 낮게밖에 오르지 못한다. 박자를 잴 때 느린 걸음을 셈에 넣어라</dd>
      <dt><kbd style={{ color: "#c9a45a" }}>≡</kbd></dt>
      <dd>삐걱이는 마루 · 밟으면 삐걱 소리가 나서 가까운 경비가 모두 소리 쪽으로 돌아본다. 경비 근처의 마루는 뛰어넘어라</dd>
      <dt><kbd style={{ color: "#e0b45a" }}>🔔</kbd></dt>
      <dd>종 · 갈고리로 종을 치면 가까운 경비가 모두 종 쪽으로 돌아본다. 이쪽을 보는 경비 너머의 종을 쳐서 등을 돌리게 하라</dd>
      <dt><kbd style={{ color: "#3e7048" }}>✿</kbd></dt>
      <dd>덤불 · 덤불 속에 서 있으면 경비도 탐조등도 보지 못하고, 경비가 바로 옆을 지나가도 모른다. 지나간 뒤 등 뒤로 나서라</dd>
    </>
  );
}

// Re-render only when this component's own props change, not on every HUD tick.
export default memo(Menu);

// Every trap and device in the game, with the stage where it first turns up (found by scanning the maps).
const GIMMICKS = [
  ["#", "나무 들보", "갈고리가 걸린다. 매달려 흔들고, 줄을 감아 오르고, 놓으며 날아간다"],
  ["YU", "잠든 경비", "한쪽만 본다. 등 뒤로 다가가 덮쳐라"],
  ["S", "스위치", "갈고리로 치면 붉은 문과 청록 문이 뒤바뀐다"],
  ["C", "썩은 들보", "갈고리를 걸면 곧 부러지고, 잠시 뒤 다시 자란다"],
  ["K", "열쇠와 잠긴 문", "열쇠를 주워야 잠긴 문이 열린다"],
  ["B", "상자", "갈고리로 끌어 옮기고, 발판 위에 올려 셔터를 연다"],
  ["o", "금화", "모두 주워야 출구가 열린다"],
  ["T", "순찰병", "오가며 앞을 살핀다. 위에서 떨어지거나 등 뒤에서 덮쳐라"],
  ["V", "파수꾼", "제자리에서 주기적으로 돌아선다. 등을 보일 때 쳐라"],
  ["O", "순간이동 문", "같은 글자의 다른 문으로 이어진다"],
  ["I", "얼음", "미끄러워서 늦게 서고 늦게 멈춘다"],
  ["J", "용수철", "밟으면 높이 솟구친다"],
  ["W", "기류", "올라타면 위로 떠오른다"],
  ["F", "깃발", "닿으면 그 자리에서 다시 시작한다"],
  ["*+$", "비약", "그림자 망토, 바람 장화, 수호 부적"],
  ["A", "불기둥", "박자에 맞춰 불길이 솟는다"],
  ["L", "탐조등", "빛줄기에 오래 머물면 들킨다. 처마 그늘에 숨어라"],
  ["N", "무너지는 바닥", "딛으면 곧 무너지고 잠시 뒤 다시 생긴다"],
  ["<>", "흐르는 바닥", "올라서면 실려 가고, 그 위에서는 멈출 수 없다"],
  ["M", "돌절구", "천장에서 바닥까지 내리꽂힌다. 올라가 멈춘 틈에 지나라"],
  ["Zz", "깜빡이는 발판", "금빛과 청록 발판이 번갈아 나타난다"],
  ["Rr", "화살 함정", "벽 구멍에서 2초마다 화살이 날아온다"],
  ["@%", "톱날", "홈을 따라 오간다. 뛰어넘거나 올라간 틈에 지나라"],
  ["=|", "움직이는 발판", "올라타면 실려 간다. 끝에 멈췄을 때 타고 내려라"],
  ["{}", "옆바람", "거슬러 걸을 수 없고, 등지고 뛰면 멀리 난다"],
  ["v", "고드름", "밑을 지나면 떨어진다. 멈추지 마라"],
  ["~", "눈더미", "걸음은 절반, 점프는 낮게"],
  [";", "삐걱이는 마루", "밟으면 가까운 경비가 모두 돌아본다"],
  ["&", "종", "갈고리로 치면 가까운 경비가 종 쪽을 본다"],
  ["b", "덤불", "숨어 있으면 경비도 탐조등도 보지 못한다"],
];
let firstSeen = null;
function gimmickFirsts() {
  if (firstSeen) return firstSeen;
  firstSeen = GIMMICKS.map(([chars]) => LEVELS.findIndex((lv) => lv.map.some((row) => [...chars].some((c) => row.includes(c)))));
  const chase = LEVELS.findIndex((lv) => lv.chase);
  firstSeen.chase = chase;
  return firstSeen;
}
function GimmickBook({ levels }) {
  const firsts = gimmickFirsts();
  const rows = GIMMICKS.map(([, name, desc], k) => ({ name, desc, first: firsts[k] })).filter((r) => r.first >= 0);
  if (firsts.chase >= 0) rows.push({ name: "불길 추격", desc: "왼쪽에서 불길이 쫓아온다. 멈추지 말고 달려라", first: firsts.chase });
  rows.sort((a, b) => a.first - b.first);
  const open = (r) => levels[r.first] && !levels[r.first].locked;
  return (
    <details className="fold">
      <summary>기믹 도감 {rows.filter(open).length}/{rows.length}</summary>
      <div className="achgrid" id="gimmickList">
        {rows.map((r) => (
          <div key={r.name} className={"ach" + (open(r) ? " done" : "")}>
            <b>{open(r) ? r.name : "???"} · {r.first + 1}막</b>
            <small>{open(r) ? r.desc : `${r.first + 1}막에 이르면 알게 된다`}</small>
            {open(r) && <button type="button" className="srb" onClick={() => game.playLevel(r.first)}>{r.first + 1}막 해 보기</button>}
          </div>
        ))}
      </div>
    </details>
  );
}
