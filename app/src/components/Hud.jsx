import { memo } from "react";
import * as game from "../game/engine.js";

function Hud({ hud, shown }) {
  return (
    <div className="hud" id="hud" hidden={!shown}>
      <div className="hud-l">
        <div className={"act" + (hud.hard ? " hardtag" : "") + (hud.master ? " mastertag" : "")} id="hAct">{hud.act}</div>
        <div className="lname" id="hName" onClick={game.hudNameTap}>{hud.name}</div>
        <div className={"goal" + (hud.goalFaded ? " faded" : "")} id="hGoal" hidden={hud.goalHidden}>{hud.goal}</div>
        <div className="chips" id="hChips">
          {hud.chips.map(([text, done], k) => <span key={k} className={"chip" + (done ? " done" : "")}>{text}</span>)}
        </div>
      </div>
      <div className="hud-r">
        <div className="stat run" id="sRun" hidden={hud.run === null}><span>스피드런</span><b id="hRun">{hud.run}</b></div>
        <div className="stat"><span>시간</span><b id="hTime">{hud.time}</b></div>
        <div className="stat"><span>사망</span><b id="hDeaths">{hud.deaths}</b></div>
        <button id="bRestart" type="button" onClick={game.restartClick}><kbd>R</kbd> 재시작</button>
        <button id="bPause" type="button" aria-label="일시정지" onClick={game.pauseClick}><kbd>Esc</kbd> 일시정지</button>
      </div>
      {/* level hints are our own markup (they contain <kbd> keys) */}
      <div className={"hint" + (hud.hintFaded ? " faded" : "")} id="hHint" dangerouslySetInnerHTML={{ __html: hud.hint }} />
    </div>
  );
}

// Re-render only when this component's own props change, not on every HUD tick.
export default memo(Hud);
