import { useEffect, useState } from "react";
import * as game from "../game/engine.js";
import * as online from "../game/online.js";

const fmtDate = (s) => { const d = new Date(s); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

// Online: account, rankings, the stage gallery and cloud saves, all in one menu fold.
export default function Online({ info }) {
  const [acc, setAcc] = useState(online.account());
  const [tab, setTab] = useState("rank");
  const [msg, setMsg] = useState({ text: "", bad: false });
  const say = (text, bad = false) => setMsg({ text, bad });
  const fail = (e) => say("서버에 닿지 않는다 · 잠시 뒤 다시 해 보라" + (e && e.message ? ` (${e.message})` : ""), true);

  return (
    <details className="fold online" id="online">
      <summary>온라인{acc ? ` · ${acc.name}` : ""}</summary>
      {!acc ? <SignIn onDone={(a) => { setAcc(a); say(`어서 와라, ${a.name}`); }} say={say} fail={fail} /> : (
        <>
          <div className="row tabs">
            {[["rank", "랭킹"], ["gallery", "막 갤러리"], ["cloud", "클라우드 저장"], ["me", "계정"]].map(([k, n]) => (
              <button key={k} type="button" id={"on-" + k} className={tab === k ? "sel" : ""} onClick={() => { setTab(k); say(""); }}>{n}</button>
            ))}
          </div>
          {tab === "rank" && <Ranking info={info} fail={fail} />}
          {tab === "gallery" && <Gallery fail={fail} say={say} />}
          {tab === "cloud" && <Cloud say={say} fail={fail} />}
          {tab === "me" && <Account acc={acc} onChange={setAcc} say={say} fail={fail} />}
        </>
      )}
      {msg.text && <p className={"xfermsg" + (msg.bad ? " bad" : "")} id="onMsg" role="status">{msg.text}</p>}
    </details>
  );
}

function SignIn({ onDone, say, fail }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const start = () => online.register(name).then(onDone, fail);
  const link = () => online.link(code).then(() => onDone(online.account()), () => say("연결 코드가 틀렸다", true));
  return (
    <>
      <p className="xfernote">이름을 정하면 기록이 전 세계 순위표에 오르고, 막 갤러리에 막을 올리고, 진행 상황을 클라우드에 저장할 수 있다.</p>
      <div className="row">
        <input id="onName" maxLength={16} placeholder="자객 이름" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary" type="button" id="onStart" disabled={!name.trim()} onClick={start}>온라인 시작</button>
      </div>
      <div className="row">
        <input id="onLinkIn" placeholder="다른 기기의 연결 코드" value={code} onChange={(e) => setCode(e.target.value)} />
        <button type="button" id="onLink" disabled={!code.trim()} onClick={link}>기기 연결</button>
      </div>
    </>
  );
}

function Account({ acc, onChange, say, fail }) {
  const [name, setName] = useState(acc.name);
  const [show, setShow] = useState(false);
  return (
    <>
      <div className="row">
        <input maxLength={16} value={name} onChange={(e) => setName(e.target.value)} />
        <button type="button" disabled={!name.trim() || name === acc.name} onClick={() => online.rename(name).then(() => { onChange({ ...online.account() }); say("이름을 바꿨다"); }, fail)}>이름 바꾸기</button>
      </div>
      <p className="xfernote">다른 기기에서 '기기 연결'에 이 코드를 넣으면 같은 계정으로 이어진다. 코드는 비밀번호와 같으니 남에게 보이지 마라.</p>
      <div className="row">
        <button type="button" id="onShowLink" onClick={() => setShow(!show)}>{show ? "연결 코드 숨기기" : "연결 코드 보기"}</button>
        <button type="button" onClick={() => { if (confirm("이 기기에서 로그아웃할까? 연결 코드가 없으면 이 계정으로 돌아올 수 없다.")) { online.signOut(); onChange(null); } }}>로그아웃</button>
      </div>
      {show && <textarea className="xfercode" readOnly rows={2} value={online.linkCode()} onFocus={(e) => e.target.select()} aria-label="연결 코드" />}
    </>
  );
}

function Ranking({ info, fail }) {
  const [kind, setKind] = useState("lv");
  const [lv, setLv] = useState(Math.max(1, info.next));
  const [boss, setBoss] = useState(0);
  const [data, setData] = useState(null);
  const key = kind === "lv" ? `lv:${info.diff}:${lv - 1}` : kind === "boss" ? `boss:${info.diff}:${boss}` : `${kind}:${info.diff}`;
  useEffect(() => { setData(null); const t = setTimeout(() => online.board(key).then(setData, fail), 250); return () => clearTimeout(t); }, [key]);
  const fmt = (v) => (kind === "tower" ? v + "층" : v.toFixed(1) + "초");
  return (
    <>
      <div className="row">
        <select id="onKind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="lv">막</option><option value="boss">보스전</option><option value="bonus">보너스</option><option value="tower">시련의 탑</option>
        </select>
        {kind === "lv" && <input id="onLv" type="number" min={1} max={info.levels.length} value={lv} onChange={(e) => setLv(Math.max(1, Math.min(info.levels.length, Number(e.target.value) || 1)))} style={{ width: "6em" }} />}
        {kind === "boss" && <select value={boss} onChange={(e) => setBoss(Number(e.target.value))}>{info.bosses.map((b) => <option key={b.k} value={b.k}>{b.name}</option>)}</select>}
        <span className="xfernote">{info.diffName} 난이도</span>
      </div>
      {!data ? <p className="xfernote">불러오는 중…</p> : (
        <ol className="board" id="onBoard">
          {data.top.length === 0 && <li className="empty">아직 기록이 없다 · 첫 번째가 되어라</li>}
          {data.top.map((r, k) => <li key={k} className={r.me ? "me" : ""}><b>{r.rank}</b><span>{r.name}</span><i>{fmt(r.value)}</i></li>)}
          {data.me && !data.top.some((r) => r.me) && <li className="me"><b>{data.me.rank}</b><span>나</span><i>{fmt(data.me.value)}</i></li>}
          <li className="total">{data.total}명 기록</li>
        </ol>
      )}
    </>
  );
}

function Gallery({ fail, say }) {
  const [sort, setSort] = useState("new");
  const [list, setList] = useState(null);
  const load = () => online.gallery(sort).then(setList, fail);
  useEffect(() => { setList(null); load(); }, [sort]);
  const play = (st) => online.stage(st.id).then((s) => s && game.playShared(s.code, s.author)).catch(fail);
  const like = (st) => online.like(st.id).then(load, fail);
  const del = (st) => { if (confirm(`'${st.name}'을(를) 갤러리에서 내릴까?`)) online.removeStage(st.id).then(() => { say("내렸다"); load(); }, fail); };
  return (
    <>
      <p className="xfernote">다른 자객들이 그린 막. 내 막은 '막 만들기'에서 완주 확인을 한 뒤 올릴 수 있다.</p>
      <div className="row tabs">
        {[["new", "새 막"], ["top", "인기"], ["played", "많이 한"]].map(([k, n]) => <button key={k} type="button" className={sort === k ? "sel" : ""} onClick={() => setSort(k)}>{n}</button>)}
      </div>
      {!list ? <p className="xfernote">불러오는 중…</p> : (
        <div className="gallery" id="onGallery">
          {list.length === 0 && <p className="xfernote">아직 올라온 막이 없다</p>}
          {list.map((st) => (
            <div key={st.id} className="gcard">
              <b>{st.name}</b>
              <small>{st.author} · {fmtDate(st.created_at)} · {st.plays}번 플레이</small>
              <div className="row">
                <button type="button" className="primary" onClick={() => play(st)}>플레이</button>
                <button type="button" className={st.liked ? "liked" : ""} onClick={() => like(st)}>♥ {st.likes}</button>
                {st.mine && <button type="button" onClick={() => del(st)}>내리기</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Cloud({ say, fail }) {
  const [info, setInfo] = useState(null);
  const refresh = () => online.cloudGet().then(setInfo, fail);
  useEffect(() => { refresh(); }, []);
  const up = () => online.cloudPut(game.exportSave()).then(() => { say("클라우드에 저장했다"); refresh(); }, fail);
  const down = () => {
    if (!info || !info.data) return;
    if (!confirm("이 기기의 진행 상황을 클라우드 저장으로 바꿉니다. 계속할까요?")) return;
    const err = game.importSave(info.data);
    say(err || "불러왔다. 다시 시작한다…", !!err);
  };
  return (
    <>
      <p className="xfernote">로그인해 있으면 메뉴로 돌아올 때마다 자동으로 저장된다(2분에 한 번). 다른 기기에서는 '기기 연결' 뒤 내려받아라.</p>
      <p className="xfernote" id="onCloudAt">{!info ? "확인하는 중…" : info.data ? `클라우드 저장 · ${fmtDate(info.updated_at)} · ${info.data.unlocked - 1}막까지 깸` : "클라우드에 저장된 것이 없다"}</p>
      <div className="row">
        <button type="button" className="primary" id="onUp" onClick={up}>지금 올리기</button>
        <button type="button" id="onDown" disabled={!info || !info.data} onClick={down}>내려받기</button>
      </div>
    </>
  );
}
