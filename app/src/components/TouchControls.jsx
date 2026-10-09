import { useEffect, useRef, useState } from "react";
import * as game from "../game/engine.js";

// Fixed stick on one side, jump and release buttons on the other.
// The knob moves through a ref so dragging never re-renders React.
export default function TouchControls({ shown, reset }) {
  const stickRef = useRef(null), knobRef = useRef(null), stickId = useRef(null);
  const [on, setOn] = useState({ jump: false, release: false });

  useEffect(() => {
    stickId.current = null;
    if (knobRef.current) knobRef.current.style.transform = "";
    setOn({ jump: false, release: false });
  }, [reset]);

  function stickUpdate(e) {
    const r = stickRef.current.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const d = Math.hypot(dx, dy); if (d > 1) { dx /= d; dy /= d; }
    const travel = r.width * 0.3;
    knobRef.current.style.transform = "translate(" + dx * travel + "px, " + dy * travel + "px)";
    game.stickMove(dx, dy);
  }
  function stickEnd() {
    stickId.current = null;
    knobRef.current.style.transform = "";
    game.stickEnd();
  }
  const stickEvents = {
    onPointerDown: (e) => {
      e.preventDefault(); stickId.current = e.pointerId;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
      stickUpdate(e);
    },
    onPointerMove: (e) => { if (e.pointerId === stickId.current) stickUpdate(e); },
    onPointerUp: (e) => { if (e.pointerId === stickId.current) stickEnd(); },
    onPointerCancel: (e) => { if (e.pointerId === stickId.current) stickEnd(); },
  };
  const hold = (name, down, up) => {
    const end = () => { setOn((o) => ({ ...o, [name]: false })); if (up) up(); };
    return {
      onPointerDown: (e) => {
        e.preventDefault();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
        setOn((o) => ({ ...o, [name]: true }));
        down();
      },
      onPointerUp: end,
      onPointerCancel: end,
    };
  };

  return (
    <div id="touch" hidden={!shown}>
      <div className="stick" id="stick" ref={stickRef} aria-label="이동 스틱" {...stickEvents}>
        <div className="knob" id="knob" ref={knobRef} />
      </div>
      <div className="tbtns">
        <button className={"tb" + (on.release ? " on" : "")} id="tRelease" type="button" {...hold("release", game.releasePress)}>놓기</button>
        <button className={"tb big" + (on.jump ? " on" : "")} id="tJump" type="button" {...hold("jump", game.jumpPress, game.jumpRelease)}>점프</button>
      </div>
    </div>
  );
}
