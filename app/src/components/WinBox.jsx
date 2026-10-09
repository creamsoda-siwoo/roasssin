import { useEffect, useRef } from "react";
import * as game from "../game/engine.js";

export default function WinBox({ shown, win }) {
  const nextRef = useRef(null);
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => nextRef.current && nextRef.current.focus(), 30);
    return () => clearTimeout(t);
  }, [shown, win]);
  return (
    <div className="overlay" id="winBox" hidden={!shown}>
      <div className="panel win">
        <div className="act" id="wAct">{win.act}</div>
        <h2 id="wTitle">{win.title}</h2>
        <div className="winstars" id="wStars">
          {win.stars !== null && [0, 1, 2].map((k) => <i key={k} className={k < win.stars ? "on" : ""}>★</i>)}
        </div>
        <p className="winstarnote" id="wStarNote">{win.starNote}</p>
        <div className="winstats">
          <div><span>시간</span><b id="wTime">{win.time}</b></div>
          <div><span>사망</span><b id="wDeaths">{win.deaths}</b></div>
          <div><span>최고 기록</span><b id="wBest">{win.best}</b></div>
        </div>
        <div className="row">
          <button className="primary" id="bNext" type="button" ref={nextRef} onClick={game.winNext}><kbd>Enter</kbd> {win.next}</button>
          <button id="bRetry" type="button" onClick={game.winRetry}>{win.retry}</button>
          <button id="bWinMenu" type="button" hidden={!win.menuBtn} onClick={game.showMenu}>메뉴</button>
        </div>
      </div>
    </div>
  );
}
