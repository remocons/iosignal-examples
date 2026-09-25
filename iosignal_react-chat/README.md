# IOSignal React 채팅 예제

React 환경에서 IOSignal로 채팅을 구현하는 독립 실행 예제입니다.

## 준비 및 실행

Node.js 20.19 이상(20.x) 또는 22.12 이상과 npm이 필요합니다.
저장소 루트에서 다음 명령을 실행합니다.

```sh
cd iosignal_react-chat
npm install
npm run dev
```

이미 이 예제 폴더를 VS Code로 열었다면 `cd` 명령은 생략합니다. `npm start`도 같은 개발 서버를 실행합니다.

## Vite가 실행하는 두 서버

`npm run dev`를 실행하면 `vite.config.js`의 `configureServer()` 플러그인이 IOSignal 서버를 자동으로 생성합니다. 별도로 채팅 서버를 실행할 필요가 없습니다.

| 역할 | 주소 | 설명 |
|---|---|---|
| Vite 웹 서버 | `http://localhost:5173` | HTML·JavaScript·CSS와 개발 중 변경 사항을 제공합니다. |
| IOSignal WebSocket 서버 | `ws://localhost:7777` | 브라우저 클라이언트의 연결·채널 구독·채팅 메시지를 처리합니다. |

브라우저에는 **웹 서버 주소**를 입력합니다. 클라이언트의 `src/App.jsx`가 WebSocket 주소로 연결합니다.

1. `http://localhost:5173`를 브라우저 두 탭에서 엽니다.
2. 두 탭 모두 IO State가 `ready`인지 확인합니다.
3. 한 탭에서 메시지를 보내 다른 탭에 표시되는지 확인합니다. 채널 이름은 `openchat`입니다.
4. 종료할 때는 실행한 터미널에서 `Ctrl+C`를 누릅니다.

Vite 종료·재시작 시 `closeBundle()`이 IOSignal 서버의 `close()` 완료를 기다립니다. Vite 설정 변경으로 재시작해도 이전 WebSocket 포트가 남지 않도록 합니다. 종료 후 화면에 남아 있는 브라우저 탭은 연결이 끊어집니다.

## 다른 예제와 함께 실행하기

예제마다 웹 포트와 IOSignal 포트가 다르므로 각각의 터미널에서 동시에 실행할 수 있습니다. 서버는 서로 독립적이므로 **다른 예제의 탭 사이에는 메시지가 전달되지 않습니다.** 같은 예제의 웹 주소를 두 탭에서 여세요.

이 예제를 두 번 실행하거나 다른 프로그램이 지정 포트를 사용 중이면 충돌합니다. 기존 프로세스를 종료하세요. Vite 웹 포트에는 `strictPort: true`를 설정해 다른 주소로 자동 변경되지 않게 했습니다.

포트를 직접 변경하려면 `vite.config.js`의 IOSignal `port`와 `src/App.jsx`의 연결 URL을 함께 바꾸세요. Vite 웹 포트는 `server.port`에서 별도로 설정합니다. `vite --port`는 웹 포트만 변경합니다. 전체 예제의 포트 표는 [저장소 README](../readme.md)를 참고하세요.

## 빌드 결과에서 채팅하기

개발할 때는 `npm run dev` 하나면 됩니다. **빌드·preview는 IOSignal 서버를 시작하지 않으므로** 빌드 결과를 확인할 때만 아래처럼 두 터미널을 사용합니다. 먼저 실행 중인 `npm run dev`를 종료하세요.

터미널 1 — 이 예제 폴더에서 채팅 서버만 실행:

```sh
npm run server
```

터미널 2 — 같은 예제 폴더에서 화면 빌드와 미리보기 실행:

```sh
npm run build
npm run preview
```

preview가 터미널에 출력하는 웹 주소를 두 탭에서 엽니다. `server.js`는 개발 서버와 같은 IOSignal 포트를 사용하며 `Ctrl+C`로 종료합니다. 포트를 직접 변경할 때는 `server.js`도 맞춰주세요.

실제 배포에서는 IOSignal 서버를 별도로 운영하고 클라이언트 URL을 해당 주소로 수정해야 합니다. 기본 `localhost`는 같은 컴퓨터에서 테스트하는 주소이며, HTTPS 페이지에는 `wss://`를 사용합니다.

## 예제 범위

연결, 구독, 메시지 송수신 흐름을 보여주는 기본 예제입니다. Enter를 누르면 전송하며, 별도의 메시지 크기 제한·수신 형식 필터·한글 조합 처리·기록 개수 제한은 두지 않습니다. 메시지는 화면에 텍스트로 표시됩니다.
