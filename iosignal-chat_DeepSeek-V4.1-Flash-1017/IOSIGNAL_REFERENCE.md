# IOSignal 8.0.0 핵심 레퍼런스

> **이 문서의 목적:** IOSignal 코드를 새로 만들 때 iosignal.net 문서 전체를 다시 읽지 않고
> 바로 시작할 수 있도록, 실제로 검증한 API·태그 규칙·제한·패턴만 압축한 요약입니다.
>
> **기준:** `iosignal@8.0.0`, Node.js 22.16.0, 2026-10-28 실행 검증.
> 버전을 올리면 동작과 제한이 바뀔 수 있으므로 먼저 `package.json`의 버전을 확인하세요.
> 이 문서에 없는 인증 세부 설정·쿼터 커스터마이즈·Arduino 핀 설정은 공식 문서를 참고해야 합니다.

---

## 0. 30초 체크리스트

- [ ] Node.js **22.16.0 이상**, `iosignal`은 `--save-exact`로 버전 고정
- [ ] 서버는 `new Server({ port })` 또는 `new Server({ httpServer, wsPath })`
- [ ] 클라이언트 URL은 `ws://host:port/ws` (HTTPS 페이지에서는 `wss://`)
- [ ] 채널은 `room#topic`, 특정 기기 직접 전송은 `상대CID@topic`
- [ ] 채널 수신은 **구독 필수**, 직접 시그널 수신은 **구독 불필요**
- [ ] `listen()`은 자동 구독, `subscribe()`는 수동 구독 → 재접속 시 `ready`에서 재구독
- [ ] 태그는 UTF-8 **255 bytes** 제한, quota는 **`ready` 이후 `io.quota.signalSize`** 로 확인
- [ ] `message` 이벤트로 직접 시그널이 오지 않는다 → `@` / `@topic` 사용
- [ ] `ready` 전에는 `signal()`/`subscribe()`를 호출하지 않는다
- [ ] 두 클라이언트로 송수신을 실제 검증한다

---

## 1. 설치와 진입점

```bash
mkdir my-app && cd my-app
npm init -y
npm install --save-exact iosignal@8.0.0
```

| 환경 | import |
| --- | --- |
| Node.js | `import { IO, Server } from 'iosignal'` |
| 번들러(Vite/React/Svelte) | `import IO from 'iosignal/browser/esm/io.js'` |
| 브라우저 CDN/IIFE | `<script src="https://cdn.jsdelivr.net/npm/iosignal@8.0.0/dist/browser/iife/io.js"></script>` → 전역 `IO` |

**주의(검증됨):** `dist/browser/esm/io.js`는 `boho`, `buffer`, `eventemitter3` 등을 bare import로
포함합니다. import map 없이 브라우저에서 그대로 로드하면 해석에 실패합니다. 이 예제는
`iife/io.js`를 `/vendor/io.js`로 제공해 전역 `IO`를 사용했습니다.

---

## 2. 서버

### 2.1 최소 서버

```js
import { Server } from 'iosignal';

const server = new Server({ port: 7777 });
server.on('ready', () => console.log('ws://localhost:7777'));
```

### 2.2 HTTP 서버와 한 포트 공유 (이 예제에서 검증)

```js
import http from 'node:http';
import { Server } from 'iosignal';

const httpServer = http.createServer(staticHandler); // 정적 파일
const ioServer = new Server({ httpServer, wsPath: '/ws' });
httpServer.listen(5177);
ioServer.on('ready', () => console.log('ws://localhost:5177/ws'));
```

- `httpServer`를 넘기면 WebSocket이 같은 포트를 공유합니다. 이때 `httpServer.listen()`은 직접 호출합니다.
- `wsPath: '/ws'`를 지정하면 해당 경로만 WebSocket 업그레이드를 받습니다.
- `ioServer.close(cb)`로 종료합니다.

### 2.3 주요 옵션

| 옵션 | 의미 |
| --- | --- |
| `port` | WebSocket 전용 포트 |
| `httpServer` | 기존 HTTP 서버 공유 (`port`와 동시 사용 불가) |
| `wsPath` | WebSocket 경로 (예: `/ws`) |
| `congPort` | Arduino/CongSocket용 TCP 포트 |
| `showMessage`, `showMetric` | 서버 로그 수준 |
| `retain` | `$` 리테인 사용 여부·크기·개수 (서버 설정 의존) |
| `useQuota` | 신호 크기·발행 수·트래픽 제한 |

서버 이벤트: `ready`. 종료는 `ioServer.close(cb)`로 수행합니다.

쿼터는 라이브러리 고정값이 아니라 서버 운영자가 `defaultQuotaIndex`·`useQuota`·인증 레벨로
정하는 정책입니다. 배포 버전의 기본값은 `serverOption`을 참고용으로만 보고, 클라이언트는
`ready` 이후 `io.level`과 `io.quota.signalSize`를 읽습니다. 큰 메시지는 전송이 생략되고
`over_size` 이벤트가 발생할 수 있습니다.

---

## 3. 클라이언트 연결과 상태

```js
import { IO } from 'iosignal';

const io = new IO('ws://localhost:5177/ws'); // 생성과 동시에 연결
io.on('ready', () => console.log('CID:', io.cid)); // CID 발급 완료
io.on('change', () => console.log(io.stateName));  // 상태 변경
io.on('error', (err) => console.error(err));
```

| 속성 | 의미 |
| --- | --- |
| `io.cid` | 서버가 발급한 클라이언트 ID. 익명 CID는 `?xxxx` 형태 |
| `io.state` | 숫자 상태 |
| `io.stateName` | 소문자 상태명 (`ready`, `closed`, `connecting` 등) |
| `io.ip` | 서버가 관찰한 IP |
| `io.channels` | `listen()`으로 등록된 자동 구독 태그 집합 |

| 메서드 | 동작 |
| --- | --- |
| `open(url?)` | 연결/재연결 |
| `stop()` | 자동 재연결을 끄고 연결 종료. 이후 `open()` 가능 |
| `destroy()` | 리스너·자원 정리. 재사용 불가 |
| `close()` | 연결 종료 (자동 재연결 설정은 유지) |

`new IO(url)`은 자동 연결됩니다. 재접속은 기본적으로 자동이며, 재접속 후 `ready`가 다시 발생합니다.

---

## 4. 태그 문법 (가장 중요)

태그 = `대상 + 구분자 + 토픽`. `#`은 채널, `@`는 CID, `$`는 리테인입니다.
계층형 토픽(`a/b/c`)은 지원하지 않습니다.

| 용도 | 송신 태그 | 구독 태그 | 수신 핸들러의 tag |
| --- | --- | --- | --- |
| 일반 채널 | `room#chat` | `room#chat` | `room#chat` |
| 토픽 없는 채널 | `room` | `room` | `room` |
| 홈채널 (같은 서버 관찰 IP) | `#chat` | `#chat` | `#chat` |
| B에게 직접 전송 | `B@set` | 필요 없음 | `@set` |
| B에게 토픽 없이 직접 | `B@` | 필요 없음 | `@` |
| A의 CID 발행 | A가 `@state`로 송신 | `A@state` | `A@state` |
| A의 토픽 없는 발행 | A가 `@`로 송신 | `A@` | `A@` |
| 채널 리테인 | `room#$state` | `room#$state` | `room#$state` |
| 홈채널 리테인 | `#$state` | `#$state` | `#$state` |

핵심:

- **직접 전송(`B@topic`)은 구독이 필요 없습니다.** 받는 쪽은 `@topic` 또는 `@`로 받습니다.
- `B@topic`을 **구독**하면 B가 `@topic`으로 발행한 것을 받습니다. 송신과 구독의 의미가 다릅니다.
- CID 발행은 서버가 송신자 CID를 붙이므로, 수신 태그는 `A@topic`입니다.
- `$`는 태그의 일부입니다. `#state`, `#$state`, `#state$`는 서로 다른 태그입니다. 발행/구독 표기가 같아야 합니다.
- `$` 리테인 사용 가능 여부·크기·보관 기간은 서버 설정과 인증 유형에 따라 다릅니다.
- 태그는 UTF-8 기준 **최대 255 bytes**. `가` 85개 = 255 bytes, 86개는 초과.
- CID 발행의 255 bytes 제한에는 서버가 붙이는 송신자 CID도 포함됩니다.
- 특수문자로 시작하는 태그(`#`, `@` 외 `$`, `/` 등)는 향후 기능과 충돌할 수 있어 피합니다.

---

## 5. 송신·구독·수신 API

| API | 용도 |
| --- | --- |
| `signal(tag, ...args)` | 태그로 전송 (별칭 `publish`) |
| `subscribe(tag)` | 즉시 구독. 쉼표로 여러 태그 가능 |
| `unsubscribe(tag?)` | 구독 해제. 인자 없으면 전체 해제 |
| `listen(tag, handler)` | 핸들러 등록 + 자동 구독 예약 |
| `on(tag, handler)` | 핸들러만 등록 (서버 구독 없음) |
| `link(to, tag, handler)` | 컴포넌트 단위 핸들러 연결 |
| `unlink(to, tag)`, `unlinkAll(to)` | 컴포넌트 단위 해제 |
| `call(target, topic, ...args)` | 서버 서비스 RPC, Promise 반환 |
| `set(name, ...)`, `get(name)` | 서버 store |
| `auth(id, key)`, `login(id, key)` | 인증 |
| `signal_e2e(tag, data, key)` | E2E 암호화 전송 (인증 필요) |

### 5.1 `listen` vs `subscribe` (혼동 주의)

| | `listen()` | `subscribe()` |
| --- | --- | --- |
| 핸들러 등록 | 함 | 안 함 (`on` 별도) |
| 전송 시점 | **ready 시점** (이미 ready여도 즉시 보내지 않음) | 호출 즉시 |
| 재접속 자동 재구독 | 함 | **안 함** → `ready`마다 직접 호출 |
| 직접 태그(`@topic`) | 로컬 핸들러만 등록 | 사용 불가 (구독 대상 아님) |

- 연결 준비 전에는 `signal()`/`subscribe()`를 호출하지 마세요. `ready` 이후에 호출합니다.
- 구독 직후 같은 소켓으로 송신하는 경우, 구독 패킷이 먼저 처리되도록 약간의 지연(예: 100~150ms)을 두면 안전합니다.
- `subscribe('a,b')`는 전체 문자열이 255 bytes 이하여야 합니다. 긴 목록은 여러 번 호출합니다.

### 5.2 이벤트

| 이벤트 | 발생 시점 / 인자 |
| --- | --- |
| `ready` | CID 발급 후 통신 가능. `io.cid` 사용, 수동 구독 시작점 |
| `change` | 상태명 변경 (`stateName`) |
| `message` | **구독한 채널/CID 발행** 수신: `(tag, ...args)` |
| `'@'` | 모든 직접 시그널: `(tag, ...args)`, tag는 `@topic` 또는 `@` |
| `'@topic'` | 정확히 일치하는 직접 시그널: `(tag, ...args)` |
| `'태그명'` | 해당 태그 구독 수신: `(tag, ...args)` |
| `error` | 연결/처리 오류 |

- **직접 시그널은 `message`로 오지 않습니다.** `@` 또는 `@topic`으로 받습니다.
- `@`가 먼저, 이어서 `@topic`이 동기적으로 발생합니다. 양쪽에 핸들러를 등록하면 중복 처리됩니다.
- `return false`는 다음 핸들러를 취소하지 않습니다.
- `message`, `ready`, `error` 같은 이름은 이벤트 이름과 겹치므로 채널명으로 쓰지 않습니다.

---

## 6. 제한·쿼터

| 항목 | 값 / 주의 |
| --- | --- |
| 태그 길이 | UTF-8 255 bytes (`listen`/`link`는 빈 태그 불가) |
| signalSize | `ready` 이후 `io.quota.signalSize` (서버/레벨에 따라 다름) |
| publishCounter | `ready` 이후 `io.quota.publishCounter` (서버/레벨에 따라 다름) |
| 토픽 계층 | 미지원 (`a/b`는 문자 그대로) |
| 리테인 | 서버 설정 의존, `$` 표기 일치 필요 |
| 한글 메시지 | 글자당 3 bytes → 현재 `io.quota.signalSize` 기준으로 계산 |

이 예제의 안전장치:

```js
// ready 이후 실제 quota를 읽고, JSON 봉투 크기를 뺀 만큼만 UTF-8로 자른다.
state.signalSize = state.io.quota.signalSize;
const messageText = clampText(text, textBudget(base));
```

클라이언트 `send()`는 쿼터 초과 시 `over_size`를 emit하고 전송을 건너뜁니다. 예외가 던져지지
않을 수 있으므로, 긴 메시지는 보내기 전에 현재 `io.quota.signalSize` 기준으로 잘라야 합니다.

---

## 7. 검증된 통신 패턴

### 7.1 로비 접속자 발견

```js
io.subscribe('lobby#presence,lobby#hello,lobby#bye'); // ready 이후

io.signal('lobby#presence', { v: 1, cid: io.cid, nick, ts: Date.now() });

io.on('message', (tag, msg) => {
  if (tag === 'lobby#presence' && msg.cid !== io.cid) { /* 피어 목록 갱신 */ }
});
```

- 20초 하트비트, 70초 TTL로 휘발성 목록 유지.
- 새로 접속한 쪽이 `lobby#hello`를 보내면 기존 피어가 `presence`를 다시 발행.

### 7.2 채널 협상 (직접 시그널, 이 예제의 핵심)

```js
// 제안: 상대 CID로 직접 전송
io.signal(`${peerCid}@negotiate`, {
  v: 1, type: 'propose', id, channel: 'chat-abcd#chat',
  note, from: { cid: io.cid, nick }, ts: Date.now(),
});

// 수신: 구독 불필요
io.on('@negotiate', (tag, msg) => {
  if (msg.type === 'propose') { /* 수락/거절/역제안 UI */ }
});
```

메시지 타입: `propose → counter → accept / reject`. 같은 `id`로 협상 상태를 추적합니다.
수락 시 양쪽이 `channel`을 `subscribe()`하고 그 채널에서 대화합니다.

### 7.3 채널 대화 + 중복 제거

```js
const payload = {
  kind: 'chat', msgId, cid: io.cid, nick, text, ts: Date.now(),
};
seen.add(msgId);
io.signal(channelTag, payload);

io.on('message', (tag, msg) => {
  if (tag !== channelTag) return;
  if (seen.has(msg.msgId)) return; // 내 echo/중복 제거
  // 렌더링
});
```

- 채널 메시지는 발신자에게도 echo될 수 있으므로 `msgId`로 중복 제거.
- 입·퇴장·닉네임 변경은 `{ kind: 'sys', event: 'join' | 'leave' | 'rename' }`로 발행.
- 채널 구독은 `ready`마다 다시 등록하고, 재입장 시 `join` 시스템 메시지를 다시 보냅니다.

### 7.4 정리

```js
window.addEventListener('pagehide', () => {
  io.signal('lobby#bye', { cid: io.cid, nick });
  if (room) io.signal(room.tag, { kind: 'sys', event: 'leave', /* … */ });
  io.stop();
});

// 컴포넌트가 IO를 단독 소유하면 destroy(), 공유하면 unlinkAll(component)
```

---

## 8. 브라우저 통합

```html
<script src="/vendor/io.js"></script> <!-- iife: 전역 IO -->
<script>
  const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  const io = new IO(WS_URL);
</script>
```

- HTTPS 페이지에서는 반드시 `wss://`를 사용합니다.
- 로컬 개발은 `ws://localhost:PORT/ws` 사용 가능.
- 같은 서버가 HTTP와 WebSocket을 함께 제공하면 포트를 하나로 줄일 수 있습니다.
- Vite/React/Svelte는 `import IO from 'iosignal/browser/esm/io.js'`.
- `pagehide`에서 정리하고, `visibilitychange`에서 필요 시 presence를 갱신합니다.

---

## 9. CLI · Arduino · 공개 서버

### CLI (빠른 프로토콜 확인)

```bash
npm install -g iosignal-cli@7.2.0
io-server -l 7777
io-client -c ws://localhost:7777
```

클라이언트에서: `listen demo`, `signal demo hello`, `id`, `exit` / `quit` / `Ctrl+C`.
CLI는 인자를 공백으로 나누며 JSON/셸 따옴표를 해석하지 않습니다.

### Arduino

- C/C++ `iosignal` 라이브러리, 메시지마다 `onMessage` 콜백 1회, `tag` 확인.
- CLI 서버에 TCP 포트를 열려면 `-L 8888`을 추가하고 보드의 TCP 포트를 맞춥니다.
- 공개 Arduino TCP: `io.iosignal.net:55488` (테스트용).

### 공개 서비스 (학습·일시 시험용)

| 목적 | 주소 |
| --- | --- |
| 웹 실습실 | `https://test.iosignal.net` |
| 공개 WebSocket | `wss://io.iosignal.net/ws` |
| 공개 Arduino TCP | `io.iosignal.net:55488` |

익명 허용 여부·할당량·리테인 정책은 서비스 정책에 따라 변경됩니다.
운영에는 자체 서버 + 인증 + TLS를 사용하세요.

---

## 10. 인증·암호화 (요약)

- `io.auth(id, key)`로 자격을 설정하고, `io.login(id, key)`는 현재 연결에서 로그인을 시작합니다.
- 서버는 `new Server(options, authManager)` 형태로 인증 관리자를 넘깁니다.
- TLS(`wss://`) + 인증이면 구간 암호화가 적용됩니다. E2E는 `signal_e2e()` + 키가 필요합니다.
- 상세 스키마·Redis 연동·키 발급은 공식 문서의 인증/보안 장을 확인해야 합니다.
- 이 데모는 **익명 연결**이며 인증을 사용하지 않습니다.

---

## 11. 자주 하는 실수

1. `listen()`이 즉시 구독 패킷을 보낸다고 가정 → 실제로는 ready 시점에 전송.
2. 재접속 후 수동 `subscribe()`를 다시 하지 않음 → 채널 수신 끊김.
3. 직접 시그널을 `message`로 받으려 함 → `@`/`@topic` 사용.
4. `@`와 `@topic` 양쪽에 같은 핸들러를 등록 → 중복 처리.
5. `B@topic`을 "B에게서 받는 구독"으로 착각 → 송신은 B에게, 구독은 B의 발행 수신.
6. `$` 위치를 바꿔 발행/구독 → 다른 태그로 인식.
7. 긴 한글 메시지를 현재 quota보다 크게 보냄 → 전송 생략(`over_size`).
8. `ready` 전에 `signal()` 호출 → 전송되지 않음.
9. 브라우저에서 ESM 번들을 import map 없이 사용 → bare import 오류.
10. `destroy()` 후 인스턴스 재사용 → 불가. 새로 생성해야 함.

---

## 12. 이 예제 폴더 구성

| 파일 | 역할 |
| --- | --- |
| `server.mjs` | HTTP 정적 서버 + IOSignal `Server` (`/ws`, 한 포트) |
| `public/app.js` | 접속·presence·협상·채팅 로직 |
| `public/index.html`, `public/styles.css` | UI |
| `scripts/smoke.mjs` | Node 2클라이언트 프로토콜 검증 |
| `scripts/browser-test.mjs` | Chrome 두 창 E2E (수락·대화·역제안) |
| `scripts/browser-edge-test.mjs` | 거절·수동 입장·쿼터·이탈·모바일 |
| `scripts/screenshots.mjs` | README용 스크린샷 생성 |
| `README.md` | 실행법·사용법·프로토콜 설명 |

```bash
npm install
npm start          # http://localhost:5177 (기존 예제와 겹치지 않는 포트)
npm test           # Node 스모크
npm run test:browser
npm run test:edge
```

---

## 13. 공식 문서 (이 문서로 부족할 때만)

- 빠른 시작: https://iosignal.net/docs/start/quickstart
- 태그: https://iosignal.net/docs/core/signal_tags
- 클라이언트 API: https://iosignal.net/docs/reference/client-api
- 서버 API/옵션: https://iosignal.net/docs/reference/server-api
- 브라우저: https://iosignal.net/docs/browser
- 인증: https://iosignal.net/docs/core/authentication
- CLI: https://iosignal.net/docs/cli
- Arduino: https://iosignal.net/docs/arduino
- 문제 해결: https://iosignal.net/docs/reference/troubleshooting
- GitHub: https://github.com/remocons/iosignal

---

## 14. 검증 기록 (2026-10-28)

- 환경: Node.js 22.16.0, Chrome (Playwright), `iosignal@8.0.0`
- 확인한 사실:
  - `new Server({ httpServer, wsPath: '/ws' })`로 HTTP와 WebSocket을 한 포트에서 운영 가능
  - `상대CID@negotiate` 직접 시그널 + `io.on('@negotiate')` 수신이 구독 없이 동작
  - 익명 CID는 `?`로 시작하며 태그에 그대로 사용 가능
  - `io.stateName`은 소문자(`ready`, `closed` 등)
  - 브라우저 ESM 번들은 bare import를 포함 → IIFE 또는 번들러 필요
  - `io.quota.signalSize` 기반 클램프로 한글 메시지 안전 전송 확인
- 테스트 결과: Node 스모크, Chrome 두 창 E2E, 거절·수동 입장·접속자 이탈·모바일 모두 통과
