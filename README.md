# 줄타는 자객

후크로 벽과 들보를 타고 움직이며 막마다 다른 퍼즐을 푸는 2D 자객 게임. React + Vite로 만들었다.

플레이: https://creamsoda-siwoo.github.io/roasssin/

## 구조

- `app/` — 소스 (React + Vite)
  - `src/game/engine.js` — 게임 엔진: 물리, 막 진행, 캔버스 그리기, 입력
  - `src/game/levels.js` — 200개 막의 맵 데이터
  - `src/game/store.js` — 엔진이 화면 상태를 넣고 React가 읽는 작은 저장소
  - `src/components/` — 메뉴, HUD, 터치 조작, 일시정지·결과 화면
  - `sw.template.js` — 오프라인 캐시(서비스 워커) 원본
- 루트의 `index.html`, `assets/`, `sw.js` — `npm run build`가 만드는 배포 파일 (직접 고치지 않는다)
- 루트의 `manifest.webmanifest`, 아이콘 — 앱 설치용 파일

## 개발

```sh
cd app
npm install
npm run dev     # 개발 서버
npm run build   # 루트에 배포 파일을 다시 만든다 → 커밋하면 GitHub Pages에 반영
```
