import { useEffect, useState, memo } from "react";
import * as game from "../game/engine.js";

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

function PowerHelp() {
  return (
    <>
      <dt><kbd style={{ color: "#b48cf0" }}>▲</kbd> <kbd style={{ color: "#9fe0ff" }}>〰</kbd> <kbd style={{ color: "#ffd47a" }}>◆</kbd></dt>
      <dd>파워업 · 보라 망토는 8초 투명, 하늘색 신발은 12초 2단 점프, 금색 부적은 죽음을 한 번 막아 준다</dd>
      <dt><kbd style={{ color: "#ffd47a" }}>●</kbd> <kbd style={{ color: "#e65a1e" }}>불길</kbd></dt>
      <dd>맵 형식 · 금화 맵은 금화를 모두 모아야 출구가 열리고, 추격 맵은 왼쪽에서 다가오는 불길에 닿기 전에 출구로 가야 한다</dd>
    </>
  );
}

// Re-render only when this component's own props change, not on every HUD tick.
export default memo(Menu);
