import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { getState, subscribe } from "./game/store.js";
import * as game from "./game/engine.js";
import Hud from "./components/Hud.jsx";
import TouchControls from "./components/TouchControls.jsx";
import Menu from "./components/Menu.jsx";
import PauseBox from "./components/PauseBox.jsx";
import WinBox from "./components/WinBox.jsx";
import StoryBox from "./components/StoryBox.jsx";

export default function App() {
  const s = useSyncExternalStore(subscribe, getState);
  const cvRef = useRef(null);
  useEffect(() => { game.attach(cvRef.current); }, []);
  // records and settings live in the engine's save; `rev` tells us when they changed
  const info = useMemo(() => game.menuInfo(), [s.rev]);
  const playing = s.mode === "play" || s.mode === "dead";

  // the stylesheet keys several layouts off classes on <body>
  useEffect(() => {
    const b = document.body.classList;
    b.toggle("touch", s.touch);
    b.toggle("playing", playing);
    b.toggle("hard", info.hard);
    b.toggle("master", info.master);
    b.toggle("big", info.settings.big);
    b.toggle("left", info.settings.left);
    b.toggle("fade", info.settings.fade);
  }, [s.touch, playing, info]);

  return (
    <>
      <div id="stage"><canvas id="cv" ref={cvRef} /></div>
      <Hud hud={s.hud} shown={s.hudShown} />
      <TouchControls shown={s.touch && playing} reset={s.stickReset} />
      <div id="toast" className={(s.toast.show ? "show" : "") + (s.toast.bad ? " bad" : "")}>{s.toast.msg}</div>
      <div id="card" className={s.card.show ? "show" : ""}>
        <div className="act" id="cAct">{s.card.act}</div>
        <div className="t" id="cName">{s.card.name}</div>
      </div>
      <Menu info={info} shown={s.overlay === "menu"} touch={s.touch} muted={s.muted} install={s.install} />
      <PauseBox shown={s.overlay === "pause"} act={s.pause.act} />
      <WinBox shown={s.overlay === "win"} win={s.win} />
      <StoryBox shown={s.overlay === "story"} story={s.story} />
    </>
  );
}
