import { useEffect, useRef } from "react";
import * as game from "../game/engine.js";

export default function PauseBox({ shown, act }) {
  const resumeRef = useRef(null);
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => resumeRef.current && resumeRef.current.focus(), 30);
    return () => clearTimeout(t);
  }, [shown]);
  return (
    <div className="overlay" id="pauseBox" hidden={!shown}>
      <div className="panel win">
        <div className="act" id="pAct">{act}</div>
        <h2>일시정지</h2>
        <div className="row">
          <button className="primary" id="bResume" type="button" ref={resumeRef} onClick={game.resumeClick}><kbd>Esc</kbd> 계속하기</button>
          <button id="bPauseRestart" type="button" onClick={game.pauseRestartClick}>재시작</button>
          <button id="bMenu" type="button" onClick={game.showMenu}>메뉴</button>
        </div>
      </div>
    </div>
  );
}
