# IOSignal Host Quiz — 서버가 채점하는 실시간 퀴즈

[IOSignal](https://iosignal.net) 9.13.0부터 쓸 수 있는 `server.host()`로 만든 예제입니다. `server.host()` 설명은 [서버 안의 게임 로직](https://docs.iosignal.net/docs/server/game-host)에 있습니다. 문제 진행과 채점을 **IOSignal 서버 안의 호스트**가 맡고, 브라우저는 답만 보냅니다.

- 호스트는 답마다 **서버가 확인한 보낸 사람**(`from.cid`)을 함께 받습니다. 페이로드에 다른 사람의 CID를 넣어도 소용이 없습니다.
- 점수판(`quiz#$state`)과 개인 결과(`@quiz.you`)는 **호스트만 보낼 수 있습니다.** 클라이언트가 같은 태그로 보내면 서버가 버립니다.
- 연결이 끊긴 참가자는 호스트의 `leave` 이벤트로 바로 빠집니다.

화면의 **위조해 보기**에서 두 가지 부정행위를 직접 보내 보고 결과를 확인할 수 있습니다.

## 실행

Node.js **22.16.0 이상**이 필요합니다.

```sh
cd iosignal_host-quiz
npm ci
npm start
```

`http://localhost:5181`을 두 창 이상에서 열고 각자 닉네임으로 입장하세요. 웹 페이지와 IOSignal WebSocket(`/ws`)이 한 포트에서 실행됩니다. 포트는 `PORT=6000 npm start`로 바꿉니다.

## 대시보드

`http://localhost:5181/dashboard`에서 서버 상태를 실시간 그래프로 봅니다(iosignal 9.14.0의 `dashboard`). CPU·메모리·이벤트 루프 지연, 트래픽, 퀴즈 호스트의 참가자·초당 입력·위조 차단, 퀴즈 루프의 틱 간격(`host.loop`, 200ms), 퀴즈 정보(단계, 몇 번째 문제, 참가자, 답한 사람, 1등)가 나옵니다. 참가자 CID는 앞 두 글자만 보입니다.

- 끄기: `DASHBOARD=off npm start`
- 토큰으로 잠그기: `DASHBOARD_TOKEN=원하는토큰8자이상 npm start` (페이지에서 토큰 입력, 또는 주소 뒤에 `?key=토큰`)

## 규칙

- 문제 5개를 차례로 냅니다. 한 문제에 15초, 정답 공개 5초.
- 정답이면 10점에 남은 초를 더합니다. 문제마다 첫 답만 인정합니다.
- 모두 답하면 시간이 남아도 바로 정답을 공개합니다.

## 구조

```
 브라우저 N개 ── WebSocket /ws ── IOSignal Server
                                      └─ server.host('quiz')
                                           · quiz#in       ← 입장·답 (보낸 CID는 서버가 알려 줌)
                                           · quiz#$state   → 문제·타이머·점수판 (보관: 늦게 온 사람도 바로 받음)
                                           · @quiz.you     → 한 사람에게 정답 여부 (host.to)
```

| 파일 | 역할 |
|---|---|
| `server.mjs` | 실행 진입점 |
| `src/quiz-server.mjs` | HTTP 정적 서버 + IOSignal `Server`(대시보드 포함) + `server.host('quiz')` |
| `src/quiz.mjs` | 퀴즈 규칙(네트워크 없음): 입장, 답, 채점, 시간 |
| `public/` | 브라우저 화면. `/vendor/io.js`(IOSignal IIFE)를 씁니다 |
| `test/` | 규칙 단위 시험, 실제 소켓으로 두 명이 푸는 시험 |

### 호스트 코드

```js
import { Server } from 'iosignal';

const ioServer = new Server({ httpServer, wsPath: '/ws' });
const host = ioServer.host('quiz', {
  inbound: ['quiz#in'],                 // 클라이언트 → 호스트. 다른 구독자에게 전달되지 않음
  own: ['quiz#$state', '@quiz.you'],    // 호스트만 보낼 수 있는 태그
});

host.on('message', (from, tag, msg) => {
  // from.cid: 서버가 아는 보낸 사람. msg 안의 값은 믿지 않는다.
  if (msg?.op === 'answer') game.answer(from.cid, msg.choice, Date.now());
});
host.on('leave', (from) => game.leave(from.cid));

host.publish('quiz#$state', game.state());      // 구독자 모두에게, '$'라서 마지막 값을 보관
host.to(cid, 'quiz.you', { correct: true });    // 한 연결에만, 받는 쪽 태그는 '@quiz.you'
```

브라우저는 일반 클라이언트입니다.

```js
const io = new IO(`ws://${location.host}/ws`);
io.on('ready', () => io.subscribe('quiz#$state'));
io.signal('quiz#in', { op: 'answer', choice: 1 });
io.on('@quiz.you', (tag, result) => { /* 내 결과 */ });
```

## 확인하기

```sh
npm test
```

- 규칙: 첫 답만 인정, 빠를수록 높은 점수, 시간 초과, 다음 문제, 인원 제한.
- 실제 소켓: 두 명이 답하고 점수가 매겨짐, 페이로드에 다른 CID를 넣은 답은 보낸 사람의 답으로 처리, 위조한 `quiz#$state`·`@quiz.you`는 전달되지 않음(`hostDenied` 2), 늦게 구독해도 상태를 바로 받음, `/dashboard` 페이지와 대시보드의 퀴즈 호스트 정보(루프·리포트), 연결을 끊으면 바로 빠짐.

2026-11-18: iosignal 9.21.0, `npm test` 5개 통과.

2026-11-14: iosignal 9.14.0, `npm test` 5개 통과. 내장 브라우저에서 대시보드 확인: 틱 간격 p50 200.8·p99 201.8ms(목표 200), 처리 평균 0.03ms, 위조 점수판 1건이 '위조 차단'으로 표시됨.

실행 중에는 `http://localhost:5181/healthz`에서 호스트 카운터(`inbound`, `denied`, `rejected`)를 볼 수 있습니다. 서버 터미널에는 버려진 위조 시도가 `dropped <cid> -> <tag>`로 찍힙니다.

## 예제의 범위

- 상태는 메모리에만 있습니다. 서버를 다시 시작하면 처음부터 시작합니다.
- 익명 접속은 다시 접속할 때마다 CID가 바뀌어 새 참가자로 들어옵니다(점수가 이어지지 않음). 같은 사람임을 보장하려면 IOSignal 인증을 쓰세요.
- 호스트는 서버 프로세스 안에서 동작하므로 이 예제는 자기 IOSignal 서버로 실행합니다. 공개 서버(`wss://io.iosignal.net/ws`)에는 호스트를 등록할 수 없습니다.
