# IOSignal WebRTC Lab

공개 데모: **https://test.iosignal.net/webrtc/** (2026-10-18 배포).

IOSignal을 WebRTC 시그널링 도구로 사용하는 **실제로 통화 가능한 1:1 화상채팅 예제**입니다. Vanilla JavaScript + Vite로 구현했으며, UI와 시그널링·미디어 코드를 `src/main.js`에서 함께 읽을 수 있습니다.

## 실행

Node.js 22.12 이상:

```sh
npm install
npm run dev
```

`http://localhost:5180`을 브라우저 두 탭에서 엽니다. `npm run dev`는 IOSignal 서버(`ws://localhost:7781`)도 실행합니다. 다른 예제의 기본 포트와 겹치지 않습니다.

1. 첫 번째 탭에서 **방 만들기**를 누르고 카메라·마이크를 허용합니다.
2. **초대 링크 복사**로 두 번째 탭을 열거나 같은 채널명을 입력합니다.
3. 두 번째 탭에서 **방 참여**를 누릅니다. 같은 탭에서 두 번 만들지 마세요.
4. `통화 연결됨`, remote 영상, ICE 상태와 실제 로그를 확인합니다.
5. 두 탭이 같은 공간에 있으면 한쪽 마이크를 끄거나 헤드폰을 써서 하울링을 방지하세요.

방 개설자 1명 + 참여자 1명입니다. 참여자가 먼저 들어와도 45초 동안 개설자를 탐색합니다. 세 번째 참여자에게는 통화 중 상태를 표시합니다. 통화 종료·상대 종료·시그널 서버 단절 시 카메라와 마이크를 해제합니다. 종료 후 다시 방을 만들고 참여할 수 있습니다.

## 화면 기능

- 공유 채널명, fragment 기반 초대 링크, 로컬에서 생성하는 QR
- 기본 서버 주소를 생략한 짧은 초대 링크(별도 서버는 포함), 160px QR 및 클릭/키보드로 여는 최대 320px 확대 화면
- 내 영상 / 상대 영상, 상대 크게 / 내 화면 크게 / 나란히, 작은 화면 크기 슬라이더, 전체 화면
- 마이크·카메라 on/off, 상대 음량·음소거, 브라우저 자동재생 차단 시 재생 버튼
- IOSignal 상태, ICE 상태, 선택된 ICE 경로(P2P 또는 TURN), RTT
- 최근 300개 실제 이벤트, JSON 로그 저장
- STUN·TURN 설정 및 `relay` 강제 테스트

카메라 off는 트랙의 `enabled=false`로 송출을 비활성화합니다. 장치 자체는 **통화 종료** 때 `stop()`합니다. 내 영상은 항상 음소거되어 로컬 스피커로 내 음성을 재생하지 않습니다. 일부 모바일 브라우저의 음량 조절은 OS 음량 버튼을 따라갈 수 있습니다.

## IOSignal → WebRTC 흐름

```text
개설자                         IOSignal                         참여자
subscribe(webrtc-lab-방)        채널 구독          subscribe(webrtc-lab-방)
                               ← 채널 knock ─────────────────────┤
├──── CID@rtc invite ────────────────────────────────────────────→│
│←───────────────────────────── CID@rtc accept ───────────────────┤
├──── CID@rtc offer (SDP) ────────────────────────────────────────→│
│←───────────────────────────── CID@rtc answer (SDP) ─────────────┤
├←───────────────────────────── ICE candidates ──────────────────→│
├══════════════════ WebRTC DTLS-SRTP audio/video ═════════════════→│
                   직접 연결 또는 TURN relay
```

핵심 API는 `io.subscribe(channel)`, `io.signal(channel, message)`, `io.signal(peerCid + '@rtc', message)`, 채널용 `io.on('message', handler)`와 직접 메시지용 `io.on('@rtc', handler)`입니다. 실제 IOSignal 7.2.0 라이브러리를 사용합니다. 별도의 Socket.IO나 커스텀 WebSocket 시그널 프로토콜로 대체하지 않습니다.

`#`로 시작하는 HOME CHANNEL 대신 일반 공개 채널(`webrtc-lab-...`)을 사용하므로 같은 네트워크에 묶이지 않습니다. CID 직접 메시지는 `message` 이벤트가 아닌 `@rtc` 이벤트로 수신합니다.

발신자가 offer를 만드는 고정 역할로 offer 충돌을 피합니다. 수신 메시지는 Promise 큐로 직렬 처리하고 remote description 적용 전 ICE 후보를 대기시킵니다. 통화마다 새 세션 ID를 사용하며 다른 방·상대·이전 세션의 메시지는 무시합니다. 종료와 진행 중 비동기 미디어 요청이 겹치더라도 늦게 얻은 트랙을 정리합니다.

미디어는 IOSignal을 통과하지 않습니다. STUN은 공인 주소 탐색, TURN은 필요할 때 미디어 중계를 수행합니다. 자세한 내용은 [WebRTC ICE 연결](https://webrtc.org/getting-started/peer-connections), [TURN 서버](https://webrtc.org/getting-started/turn-server)를 참고하세요.

## 다른 장치·다른 네트워크

- `localhost`는 링크를 여는 **각 장치 자신**입니다. localhost 초대 QR은 다른 휴대폰에서 테스트하는 용도가 아닙니다.
- 기기 간 통화는 **HTTPS로 배포한 화면 + 두 기기에서 접근 가능한 WSS IOSignal 서버**를 사용합니다.
- 배포 빌드의 초기 서버는 `wss://io.iosignal.net/ws`입니다. 화면에서 바꾸거나 빌드 시 `VITE_SIGNAL_URL`로 지정합니다. 서버의 접근 정책·가용성과 메시지 크기 제한에 따라 별도 운영 서버가 필요할 수 있습니다.
- LTE ↔ Wi-Fi, 회사망 등 직접 연결이 어려운 경우 유효한 TURN URL·username·credential을 각 장치에 입력합니다. TURN 계정/서버는 이 예제에 포함되지 않습니다.
- `TURN relay 전용`을 선택해 실제 경로가 `TURN relay`로 바뀌는지 확인할 수 있습니다. 자격증명은 UI 메모리에만 두며 링크·localStorage·이벤트 로그에 저장하지 않습니다.
- 초대 링크에는 채널명이 들어가며, 서버 주소는 해당 빌드의 기본값과 다를 때만 포함됩니다. 서버가 생략되면 수신 페이지의 기본 서버를 사용합니다. TURN 정보는 전달하지 않으므로 필요하면 각 장치에서 별도 입력해야 합니다.

## 예제의 경계

채널명과 CID는 인증 수단이 아닙니다. 공개 채널을 알고 있는 사람은 발견 메시지를 보낼 수 있고, 메시지의 `from`은 애플리케이션 필드이므로 신뢰할 수 있는 신원 인증을 제공하지 않습니다. 익명 사용자의 엄격한 방 인원 제한이나 접근 통제도 서버에서 보장하지 않습니다. 일반인 대상 서비스로 발전시킬 때는 서버 인증·참여 권한·수락 UI·만료되는 TURN 자격증명을 추가해야 합니다.

SDP와 ICE는 통화 성립을 위해 상대에게 전달됩니다. 화면/저장 로그에는 SDP 원문, IP 주소, TURN 비밀번호를 기록하지 않지만 채널·CID·이벤트 시간은 포함됩니다. 통화 녹화·저장은 구현하지 않습니다. 이 예제는 1:1 초기 연결을 설명하며, 화면 공유·장치 실시간 교체·다자간 SFU·자동 ICE 재시작은 범위에 포함하지 않습니다.

## 빌드·배포

```sh
npm run build
npm run preview
```

빌드 결과는 `dist/`입니다. preview는 IOSignal 서버를 시작하지 않습니다. 로컬 서버가 필요하면 다른 터미널에서 `npm run server`를 실행합니다.

```sh
VITE_SIGNAL_URL=wss://io.iosignal.net/ws npm run build
```

`base: './'`로 설정되어 같은 결과물을 도메인 루트나 `/webrtc/` 하위 경로에서 사용할 수 있습니다. 하위 경로는 마지막 `/`로 리다이렉트해야 상대 asset 경로가 정상 해석됩니다. 라우터 없이 URL fragment로 초대 정보를 보관합니다.

| 방식 | 역할과 권장 순서 |
| --- | --- |
| `iosignal-examples/iosignal_webrtc` | **소스의 기준 위치**. 다른 예제처럼 npm install / npm run dev로 재현합니다. |
| `test.iosignal.net/webrtc/` | **첫 공개 데모로 권장**. 기존 HTTPS 사이트 아래 dist를 배포하고 루트 페이지에 링크를 추가합니다. |
| `webrtc.iosignal.net` | 고정 홍보 주소가 필요해질 때 같은 dist를 별도 호스트로 배포합니다. DNS·TLS·웹서버 설정이 추가됩니다. |

이 셋은 택일이 아닙니다. 소스는 examples에 두고, 테스트 사이트의 하위 경로로 시작한 다음 필요하면 전용 도메인을 붙일 수 있습니다. 2026-10-18에 `https://test.iosignal.net/webrtc/`로 배포했습니다. 기존 서버의 `/home/ubuntu/sites/test_iosignal_net/webrtc/`에 정적 빌드를 배치하며 별도 DNS 변경은 필요하지 않습니다.

HTTPS 정적 웹서버의 응답 헤더 권장값:

```text
Permissions-Policy: camera=(self), microphone=(self)
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

정적 호스팅만으로 IOSignal/TURN 서버가 생기지는 않습니다. 별도 운영할 때 `server.js`의 포트를 WSS reverse proxy 뒤에 두고, TURN은 coturn 등 별도 서버로 구성하세요. WSS 서버는 브라우저 SDP 크기를 수용해야 합니다. 화면에서 `io.over_size`가 발생하면 서버 quota를 확인합니다.

## 검증

```sh
npx playwright install chromium
npm test
# 설치된 Chrome 사용 시:
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm test
```

Playwright는 실제 IOSignal 서버, 별도 브라우저 컨텍스트와 실제 RTCPeerConnection을 사용합니다. 자동 테스트의 카메라/마이크 입력만 브라우저의 가상 장치입니다. 실제 하드웨어 캡처, Safari/iOS 및 서로 다른 NAT 사이의 TURN 중계는 별도 장치 테스트가 필요합니다.

### 이번 구현에서 확인한 결과

- 프로덕션 빌드 성공.
- 로컬 IOSignal 서버 + 실제 Chrome WebRTC: 양방향 영상·오디오 트랙, 화면/음량/마이크/카메라 제어, 세 번째 참여자, 종료·재참여, 참여자 선입장, 권한 거부 복구 테스트 통과.
- `wss://io.iosignal.net/ws` 공개 서버의 초기 리디렉션을 거쳐 두 Chrome 컨텍스트의 영상 연결 테스트 통과. 초기 리디렉션 중의 소켓 close는 CID-ready 이후의 실제 단절과 구분합니다.
- 위 검증은 가상 캡처 장치와 같은 컴퓨터에서 수행했습니다. 실제 휴대폰·서로 다른 인터넷망·TURN relay 경로의 실측 검증은 수행하지 않았습니다. 공개 HTTPS 페이지의 배포·자산 로딩은 확인했습니다.

공개 서버 회귀 테스트는 명시적으로 실행할 수 있습니다(해당 서버에 SDP·ICE 네트워크 메타데이터 전송):

```sh
SIGNAL_TEST_URL=wss://io.iosignal.net/ws npm test -- -g 'guest can arrive'
```
