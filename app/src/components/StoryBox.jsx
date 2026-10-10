import { useEffect, useRef } from "react";
import * as game from "../game/engine.js";

// A chapter of the story, its lines fading in one after another.
export default function StoryBox({ shown, story }) {
  const btnRef = useRef(null);
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => btnRef.current && btnRef.current.focus(), 30);
    return () => clearTimeout(t);
  }, [shown, story.n]);
  return (
    <div className="overlay" id="storyBox" hidden={!shown}>
      {shown && (
        <div className="panel story" key={story.n}>
          <div className="act">{story.label}</div>
          <h2>{story.title}</h2>
          <div className="storylines">
            {story.lines.map((line, k) => <p key={k} style={{ animationDelay: k * 0.9 + "s" }}>{line}</p>)}
          </div>
          <div className="row">
            <button className="primary" id="bStory" type="button" ref={btnRef} onClick={game.storyContinue}><kbd>Enter</kbd> 계속</button>
          </div>
        </div>
      )}
    </div>
  );
}
