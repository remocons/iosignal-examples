# IOSignal examples

IOSignal을 React, Svelte 5, Vanilla JavaScript 환경에서 사용하는 채팅 예제 모음입니다. 각 폴더는 독립적으로 설치하고 실행할 수 있습니다.

## 예제와 기본 포트

| 예제 | 웹 페이지(Vite) | 채팅 서버(IOSignal) |
|---|---|---|
| [React](./iosignal_react-chat/README.md) | http://localhost:5173 | ws://localhost:7777 |
| [Svelte 5](./iosignal_svelte-chat/README.md) | http://localhost:5174 | ws://localhost:7778 |
| [Vanilla JS](./iosignal_vanilla-chat/README.md) | http://localhost:5175 | ws://localhost:7779 |
| [Vanilla JS CDN](./iosignal_vanilla-chat_CDN/README.md) | http://localhost:5176 | ws://localhost:7780 |

## 빠른 시작

Node.js 20.19 이상(20.x) 또는 22.12 이상과 npm을 준비하세요. 예를 들어 React 예제는 다음과 같이 실행합니다.

```sh
cd iosignal_react-chat
npm install
npm run dev
```

다른 예제도 해당 폴더에서 같은 명령으로 실행합니다. 이미 VS Code로 예제 폴더를 열었다면 `cd`는 생략합니다. `npm start`도 개발 서버를 실행합니다.

브라우저 두 탭에서 **같은 예제의 웹 페이지 주소**를 열고, 양쪽 IO State가 `ready`가 되면 메시지를 보내세요. 공통 채널 이름은 `openchat`입니다.

## Vite를 통해 IOSignal 서버가 실행됩니다

`npm run dev` 하나로 다음 두 서버가 함께 실행됩니다.

1. **Vite 웹 서버**가 화면과 클라이언트 코드를 제공합니다.
2. 각 `vite.config.js`의 `iosignal-server` 플러그인이 `configureServer()`에서 **IOSignal WebSocket 서버**를 생성합니다. 브라우저는 이 서버에 연결해 채팅 메시지를 주고받습니다.

따라서 로컬 개발 시 별도의 IOSignal 서버 실행 명령은 필요하지 않습니다. 브라우저 주소창에는 `http://localhost:517x` 웹 주소를 입력하고, WebSocket 주소는 클라이언트 코드에서 사용합니다.

CDN 예제는 브라우저 클라이언트만 jsDelivr의 IOSignal 5.3.0에서 가져옵니다. 채팅 서버는 다른 예제와 마찬가지로 npm의 IOSignal 패키지를 사용해 Vite가 로컬에서 실행하므로 `npm install`이 필요합니다. CDN을 불러올 인터넷 연결도 필요합니다.

## 종료·재시작·동시 실행

- 터미널에서 `Ctrl+C`를 누르면 개발 서버가 종료됩니다.
- Vite의 `closeBundle()` 훅에서 IOSignal `close()` 완료를 기다려 WebSocket 서버도 정리합니다. 설정 변경으로 Vite가 재시작할 때도 같은 정리 과정이 적용됩니다.
- 예제마다 웹·WebSocket 포트가 다르므로 여러 예제를 각각의 터미널에서 동시에 실행할 수 있습니다.
- 각 예제의 채팅 서버는 독립적입니다. 다른 예제 사이에는 메시지가 전달되지 않으며 같은 예제의 웹 주소를 여러 탭에서 열어 테스트합니다.
- 같은 예제를 두 번 실행하거나 다른 프로그램이 해당 포트를 점유하면 충돌합니다. 먼저 실행한 프로세스를 종료하세요. 웹 포트는 `strictPort: true`로 고정되어 자동으로 다른 포트를 선택하지 않습니다.

## 포트를 직접 변경하려면

| 변경할 항목 | 수정 위치 |
|---|---|
| 웹 페이지 포트 | 각 `vite.config.js`의 `server.port` |
| IOSignal 서버 포트 | 각 `vite.config.js`의 `new Server({ port: ... })` |
| 클라이언트 연결 포트 | React `src/App.jsx`, Svelte `src/routes/+page.svelte`, Vanilla·CDN `main.js`의 URL |

IOSignal 서버 포트와 클라이언트 URL은 반드시 함께 변경하세요. `vite --port`는 웹 포트만 바꿉니다.

## 빌드·preview·배포

네 예제 모두 `npm run build`, `npm run preview`, `npm run server`를 제공합니다.

개발 중에는 `npm run dev`만 사용합니다. **빌드·preview는 IOSignal 서버를 실행하지 않습니다.** 개발 전용 `configureServer()` 훅에서 서버를 생성하기 때문입니다. 빌드 결과는 클라이언트 파일이며, Svelte도 static adapter로 정적 파일을 생성합니다.

빌드 결과로 채팅하려면 먼저 개발 서버를 종료한 뒤 같은 예제 폴더에서 두 터미널을 사용하세요.

```sh
# 터미널 1: 독립 IOSignal 서버 실행
npm run server
```

```sh
# 터미널 2: 클라이언트 빌드와 미리보기
npm run build
npm run preview
```

preview가 출력하는 웹 주소를 두 탭에서 열면 됩니다. `server.js`는 각 예제의 개발용 IOSignal 포트와 동일한 포트를 사용하므로 `npm run dev`와 동시에 실행하지 마세요. `Ctrl+C`로 종료합니다. 포트를 직접 변경할 때는 클라이언트 URL, `vite.config.js`, `server.js`를 함께 수정합니다.

실제 배포에서는 IOSignal 서버를 별도로 운영하고 클라이언트 URL을 해당 주소로 수정해야 합니다. 기본 `localhost`는 같은 컴퓨터에서 테스트하기 위한 주소입니다. 외부 기기나 원격 환경에서는 실제 서버 주소로 바꾸고, HTTPS 페이지에서는 `wss://` 서버를 사용하세요.

## 예제의 범위

서비스용 정책보다 연결·구독·송수신 흐름을 쉽게 읽는 데 초점을 둡니다. Enter 전송은 단순하게 유지하며 메시지 크기 제한, 수신 형식 필터, 한글 조합 처리, 기록 개수 제한은 구현하지 않습니다. 문자열 메시지와 `{ text, cid }` 객체를 사용하는 기본 흐름을 보여줍니다.

React의 effect, Svelte의 onMount, Vanilla의 페이지·HMR 정리에서 IO 인스턴스를 종료합니다. Svelte는 메시지가 DOM에 반영된 뒤 스크롤하도록 `tick()`을 사용합니다. CDN 예제는 외부 ESM import 사용을 그대로 보여주며, CDN에 접근할 수 없다면 브라우저 개발자 도구에서 네트워크 오류를 확인하세요.
