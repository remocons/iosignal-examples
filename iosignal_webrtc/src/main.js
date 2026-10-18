import IO from 'iosignal/io';
import QRCode from 'qrcode';
import './style.css';

const $ = id => document.getElementById(id);
const uuid = () => crypto.randomUUID();
const params = new URLSearchParams(location.hash.slice(1));
const isLoopback = host => ['localhost', '127.0.0.1', '[::1]'].includes(host);
$('room').value = params.get('room') || `lab-${uuid().slice(0, 8)}`;
const defaultSignalUrl = import.meta.env.VITE_SIGNAL_URL || (import.meta.env.DEV ? `ws://${location.hostname}:7781` : 'wss://io.iosignal.net/ws');
$('endpoint').value = params.get('server') || defaultSignalUrl;
let active = null;
const logs = [];
function log(event, detail = '', error = false) {
  const item = { time: new Date().toISOString(), event, detail: String(detail) };
  logs.push(item);
  if (logs.length > 300) logs.shift();
  const row = document.createElement('div');
  row.className = `log-line${error ? ' error' : ''}`;
  const time = document.createElement('time'); time.textContent = item.time.slice(11, 23);
  const name = document.createElement('b'); name.textContent = event;
  const text = document.createElement('span'); text.textContent = item.detail;
  row.append(time, name, text); $('logs').append(row);
  if ($('logs').children.length > 300) $('logs').firstChild.remove();
  $('logs').scrollTop = $('logs').scrollHeight;
}
function notice(text) { $('notice').textContent = text; }
function status(text, connected = false) { $('call-status').textContent = `● ${text}`; $('call-status').classList.toggle('connected', connected); }
const current = s => active === s && !s.closed;
function lock(locked) {
  for (const id of ['room','endpoint','random','host','join','stun','turn','turn-user','turn-pass','relay']) $(id).disabled = locked;
  $('leave').disabled = !locked;
}
let qrRevision = 0;
async function updateInvite() {
  const revision = ++qrRevision;
  const url = new URL(location.href); url.search = '';
  const inviteParams = new URLSearchParams({room: $('room').value.trim()});
  const server = $('endpoint').value.trim();
  const normalize = value => { try { return new URL(value).href; } catch { return value; } };
  if (normalize(server) !== normalize(defaultSignalUrl)) inviteParams.set('server', server);
  url.hash = inviteParams.toString();
  $('invite').value = url.href;
  let localServer = false;
  try { localServer = isLoopback(new URL($('endpoint').value).hostname); } catch {}
  $('share-note').textContent = isLoopback(location.hostname) || localServer
    ? '현재 localhost 링크는 다른 장치에서 열 수 없습니다. 기기 간 테스트는 HTTPS 배포 주소와 공개 WSS 서버를 사용하세요.'
    : '초대받은 사람은 링크를 열고 「방 참여」를 누릅니다. 채널명은 인증 수단이 아니며 아는 사람끼리 테스트하세요.';
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, url.href, {width:320,margin:4,errorCorrectionLevel:'M'});
  if (revision !== qrRevision) return;
  for (const id of ['qr', 'qr-large']) {
    $(id).width = canvas.width; $(id).height = canvas.height;
    $(id).getContext('2d').drawImage(canvas,0,0);
  }
}
for (const id of ['room','endpoint']) $(id).addEventListener('input', () => updateInvite().catch(() => log('qr.error', '링크가 너무 깁니다.', true)));
$('random').onclick = () => { $('room').value = `lab-${uuid().slice(0,8)}`; updateInvite(); };
$('qr-open').onclick = () => $('qr-dialog').showModal();
$('qr-close').onclick = () => $('qr-dialog').close();
$('qr-dialog').addEventListener('click', event => { if (event.target === $('qr-dialog')) $('qr-dialog').close(); });
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('invite').value); notice('초대 링크를 복사했습니다.'); }
  catch { $('invite').select(); notice('초대 링크를 선택했습니다. 직접 복사해주세요.'); }
};
function configuration() {
  const room = $('room').value.trim();
  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(room)) throw new Error('채널명은 영문·숫자·하이픈·밑줄 1~48자로 입력하세요.');
  const url = new URL($('endpoint').value.trim());
  if (!['ws:','wss:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('유효한 ws:// 또는 wss:// 서버 주소를 입력하세요.');
  if (location.protocol === 'https:' && url.protocol !== 'wss:') throw new Error('HTTPS 화면에서는 WSS 서버가 필요합니다.');
  const iceServers = [];
  const stun = $('stun').value.trim(), turn = $('turn').value.trim();
  if (stun) { if (!/^stuns?:[^\s]+$/.test(stun)) throw new Error('STUN URL을 확인하세요.'); iceServers.push({urls:stun}); }
  if (turn) {
    if (!/^turns?:[^\s]+$/.test(turn) || !$('turn-user').value || !$('turn-pass').value) throw new Error('TURN URL, username, credential을 모두 입력하세요.');
    iceServers.push({urls:turn,username:$('turn-user').value,credential:$('turn-pass').value});
  }
  if ($('relay').checked && !turn) throw new Error('중계 전용 테스트에는 TURN 서버가 필요합니다.');
  return {room,url:url.href,ice:{iceServers,iceTransportPolicy:$('relay').checked?'relay':'all'}};
}
function send(s, type, payload = {}, to = s.peer) {
  if (!current(s) || !s.ready) return;
  s.io.signal(to ? `${to}@rtc` : s.channel, {
    v:1, room:s.room, from:s.io.cid, type, session:s.session, ...payload,
  });
  log(`send.${type}`, `${to ? 'CID 직접 메시지' : '공개 채널'}${type === 'ice' ? ` · ${payload.candidate?.type || 'candidate'}` : ''}`);
}
function armTimeout(s) {
  clearTimeout(s.timeout);
  s.timeout = setTimeout(() => {
    if (current(s) && s.pc?.connectionState !== 'connected') finish('연결 시간이 초과되었습니다. 서버·채널·TURN 설정을 확인하고 다시 참여하세요.');
  }, 45000);
}
async function begin(role) {
  if (active) return;
  let config;
  try { config = configuration(); }
  catch (error) { notice(error.message); return; }
  if (!navigator.mediaDevices?.getUserMedia) { notice('카메라는 HTTPS 또는 localhost에서 사용할 수 있습니다.'); return; }
  const s = { ...config, role, channel:`webrtc-lab-${config.room}`, session:null, peer:null, pending:[], closed:false, ready:false, operations:Promise.resolve() };
  active = s; lock(true); status('장치 권한 요청'); notice('카메라와 마이크 사용을 허용해주세요.');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720}}, audio:{echoCancellation:true,noiseSuppression:true}});
    if (!current(s)) { stream.getTracks().forEach(t=>t.stop()); return; }
    s.stream = stream; $('local-video').srcObject = stream; $('local-empty').hidden = true;
    $('mic').disabled = false; $('camera').disabled = false;
    log('media.ready', '카메라 + 마이크 확보');
    s.io = new IO();
    s.io.on('ready', () => {
      if (!current(s)) return;
      s.ready = true; clearTimeout(s.connectTimeout);
      $('signal-state').textContent = 'ready'; $('cid').textContent = `LOCAL CID ${s.io.cid}`;
      s.io.subscribe(s.channel);
      log('io.ready', `CID ${s.io.cid} · 채널 ${s.channel}`);
      if (role === 'host') {
        status('참여자 대기'); notice('방이 열렸습니다. 초대 링크를 다른 장치로 보내세요.');
        send(s,'host');
      } else {
        status('방 탐색 중'); notice('개설자를 찾고 있습니다. 상대가 먼저 방을 만들어야 합니다.');
        send(s,'knock');
        s.discovery = setInterval(() => { if (!s.pc) send(s,'knock',{},null); }, 2500);
        armTimeout(s);
      }
    });
    s.io.on('change', state => { if(current(s)) { $('signal-state').textContent = state; log('io.state',state); } });
    const onSignal = (tag,msg) => {
      if (tag !== s.channel && tag !== '@rtc') return;
      s.operations = s.operations.then(() => receive(s,tag,msg)).catch(error => {
        if(current(s)) { log('rtc.error',error.name || 'OperationError',true); finish('연결 협상에 실패했습니다. 설정을 확인하고 다시 참여하세요.'); }
      });
    };
    // Channel publications emit 'message'; CID direct messages emit '@rtc'.
    s.io.on('message', onSignal);
    s.io.on('@rtc', onSignal);
    for (const event of ['error','auth_fail','over_size','over_flow']) s.io.on(event, () => {
      if (current(s)) { log(`io.${event}`, '서버 연결·권한·전송 제한을 확인하세요.',true); finish('시그널링 서버에서 오류가 발생했습니다. 로그를 확인하세요.'); }
    });
    // Initial public-server redirects close one socket before CID-ready.
    // Keep the initial connection timeout running across those redirects.
    for (const event of ['close','closed']) s.io.on(event, () => { if(current(s) && s.ready) finish('시그널링 연결이 끊겼습니다. 다시 참여해주세요.'); });
    s.connectTimeout = setTimeout(() => { if(current(s) && !s.ready) finish('시그널링 서버에 연결할 수 없습니다. 서버 주소를 확인하세요.'); },15000);
    status('시그널 서버 연결 중'); s.io.open(config.url);
  } catch(error) {
    if (!current(s)) return;
    const reasons = {NotAllowedError:'카메라·마이크 권한이 거부되었습니다. 브라우저의 사이트 권한을 확인하세요.',NotFoundError:'카메라 또는 마이크를 찾을 수 없습니다.',NotReadableError:'다른 앱에서 장치를 사용 중이거나 장치를 열 수 없습니다.'};
    log('media.error',error.name,true); finish(reasons[error.name] || '장치를 시작할 수 없습니다. 브라우저와 장치를 확인하세요.');
  }
}
async function receive(s,tag,m) {
  if (!current(s) || !s.ready || !m || typeof m !== 'object' || m.v !== 1 || m.room !== s.room || !['host','knock','busy','invite','accept','offer','answer','ice','bye'].includes(m.type) || typeof m.from !== 'string' || m.from === s.io.cid || m.from.length > 100 || !/^[?\w-]+$/.test(m.from)) return;
  const direct = tag === '@rtc';
  if (!direct) {
    if (m.type === 'host' && s.role === 'host') { log('room.conflict','같은 채널에 다른 방 개설자가 있습니다.',true); notice('같은 채널에 개설자가 있습니다. 한 명만 방을 만들고 나머지는 참여하세요.'); return; }
    if (m.type === 'knock' && s.role === 'host') {
      if (s.peer && s.peer !== m.from) { send(s,'busy',{},m.from); return; }
      if (!s.peer) { s.peer = m.from; s.session = uuid(); armTimeout(s); }
      send(s,'invite');
    }
    return;
  }
  log(`recv.${m.type}`, 'CID 직접 메시지');
  if (m.type === 'busy' && s.role === 'guest' && !s.peer) { notice('이 방은 이미 통화 중입니다. 다른 채널을 사용하세요.'); return; }
  if (m.type === 'invite' && s.role === 'guest' && (!s.peer || s.peer === m.from) && typeof m.session === 'string' && m.session.length <= 64) {
    if(s.session && s.session !== m.session) return;
    s.peer = m.from; s.session = m.session; send(s,'accept'); return;
  }
  if (m.from !== s.peer || !s.session || m.session !== s.session) return;
  if (m.type === 'bye') { finish('상대가 통화를 종료했습니다.',false); return; }
  if (m.type === 'accept' && s.role === 'host' && !s.pc) {
    const pc = createPeer(s);
    await pc.setLocalDescription(await pc.createOffer());
    if(current(s)) send(s,'offer',{description:{type:pc.localDescription.type,sdp:pc.localDescription.sdp}});
  } else if(m.type === 'offer' && s.role === 'guest' && !s.pc && validDescription(m.description,'offer')) {
    const pc = createPeer(s);
    await pc.setRemoteDescription(m.description);
    if(!current(s)) return;
    await drain(s);
    await pc.setLocalDescription(await pc.createAnswer());
    if(current(s)) send(s,'answer',{description:{type:pc.localDescription.type,sdp:pc.localDescription.sdp}});
  } else if(m.type === 'answer' && s.role === 'host' && s.pc && !s.pc.remoteDescription && validDescription(m.description,'answer')) {
    await s.pc.setRemoteDescription(m.description);
    if(current(s)) await drain(s);
  } else if(m.type === 'ice' && m.candidate && typeof m.candidate.candidate === 'string' && m.candidate.candidate.length < 4096) {
    if (s.pc?.remoteDescription) await addIce(s,m.candidate);
    else if(s.pending.length < 128) { s.pending.push(m.candidate); log('ice.queued','remote description 대기'); }
  }
}
function validDescription(value,type) { return value?.type === type && typeof value.sdp === 'string' && value.sdp.length < 65536; }
async function addIce(s,candidate) { try { await s.pc.addIceCandidate(candidate); } catch { if(current(s)) log('ice.rejected','사용할 수 없는 후보 · 다른 후보 탐색',true); } }
async function drain(s) { while(current(s) && s.pending.length) await addIce(s,s.pending.shift()); }
function createPeer(s) {
  clearInterval(s.discovery);
  const pc = s.pc = new RTCPeerConnection(s.ice);
  status('WebRTC 연결 중'); notice('SDP와 ICE 후보를 교환하고 있습니다.');
  $('remote-id').textContent = s.peer;
  for (const track of s.stream.getTracks()) pc.addTrack(track,s.stream);
  pc.onicecandidate = ({candidate}) => { if(candidate && current(s)) send(s,'ice',{candidate:candidate.toJSON()}); };
  pc.ontrack = ({streams,track}) => {
    if (!current(s)) return;
    s.remoteStream ??= streams[0] || new MediaStream();
    if(!s.remoteStream.getTracks().includes(track)) s.remoteStream.addTrack(track);
    $('remote-video').srcObject = s.remoteStream; $('remote-empty').hidden = true;
    $('remote-video').play().catch(() => { if(current(s)) $('play').hidden = false; });
    log('media.remote', `${track.kind} track 수신`);
  };
  pc.oniceconnectionstatechange = () => { if(current(s)) { $('ice-state').textContent = pc.iceConnectionState; log('ice.state',pc.iceConnectionState); } };
  pc.onconnectionstatechange = () => {
    if(!current(s)) return;
    log('peer.state',pc.connectionState);
    if(pc.connectionState === 'connected') { clearTimeout(s.timeout); clearTimeout(s.disconnectTimeout); status('통화 연결됨',true); notice('연결되었습니다. 음성·영상은 WebRTC로 전달됩니다.'); }
    if(pc.connectionState === 'failed') finish('미디어 연결에 실패했습니다. 다른 네트워크라면 TURN 설정을 확인하세요.');
    if(pc.connectionState === 'disconnected') {
      status('연결 복구 대기'); notice('네트워크 연결이 불안정합니다. 15초 동안 복구를 기다립니다.');
      clearTimeout(s.disconnectTimeout); s.disconnectTimeout = setTimeout(() => { if(current(s) && pc.connectionState === 'disconnected') finish('네트워크 연결이 복구되지 않았습니다. 다시 참여해주세요.'); },15000);
    }
  };
  s.stats = setInterval(() => readStats(s),2000);
  armTimeout(s);
  return pc;
}
async function readStats(s) {
  if(!current(s) || !s.pc) return;
  try {
    const stats = await s.pc.getStats();
    if(!current(s)) return;
    let pair;
    stats.forEach(report => { if(report.type === 'transport' && report.selectedCandidatePairId) pair = stats.get(report.selectedCandidatePairId); });
    if(!pair) stats.forEach(report => { if(report.type === 'candidate-pair' && report.nominated && report.state === 'succeeded') pair = report; });
    if(pair) {
      $('rtt').textContent = pair.currentRoundTripTime == null ? '—' : `${Math.round(pair.currentRoundTripTime*1000)} ms`;
      const local = stats.get(pair.localCandidateId), remote = stats.get(pair.remoteCandidateId);
      const relay = local?.candidateType === 'relay' || remote?.candidateType === 'relay';
      $('route').textContent = relay ? 'TURN relay' : 'P2P direct';
    }
  } catch { /* Closing the peer can race with getStats. */ }
}
function finish(reason = '통화를 종료했습니다.', notify = true) {
  const s = active;
  if(!s) return;
  if(notify && s.peer) { try { send(s,'bye'); } catch {} }
  s.closed = true; active = null;
  for (const timer of ['timeout','connectTimeout','disconnectTimeout']) clearTimeout(s[timer]);
  clearInterval(s.discovery); clearInterval(s.stats);
  s.pc?.close(); s.io?.destroy();
  s.stream?.getTracks().forEach(track => track.stop());
  for(const id of ['local-video','remote-video']) $(id).srcObject = null;
  for(const id of ['local-empty','remote-empty']) $(id).hidden = false;
  $('mic').disabled = true; $('camera').disabled = true;
  for(const [id,label] of [['mic','마이크'],['camera','카메라']]) { $(id).setAttribute('aria-pressed','false'); $(id).querySelector('span').textContent = `${label} 켜짐`; }
  $('signal-state').textContent = 'offline'; $('ice-state').textContent = 'closed';
  $('rtt').textContent = '—'; $('route').textContent = '—'; $('remote-id').textContent = '아직 연결되지 않음'; $('cid').textContent = 'LOCAL CID —'; $('play').hidden = true;
  lock(false); status('대기 중'); notice(reason); log('session.end',reason);
}
$('host').onclick = () => begin('host'); $('join').onclick = () => begin('guest'); $('leave').onclick = () => finish();
for(const [id,kind,label] of [['mic','audio','마이크'],['camera','video','카메라']]) $(id).onclick = () => {
  const tracks = active?.stream?.getTracks().filter(t=>t.kind===kind) || [];
  if(!tracks.length) return;
  const enabled = !tracks[0].enabled;
  tracks.forEach(t=>{t.enabled=enabled;});
  $(id).setAttribute('aria-pressed',String(!enabled)); $(id).querySelector('span').textContent = `${label} ${enabled?'켜짐':'꺼짐'}`;
  log(`media.${kind}`, enabled?'enabled':'disabled');
};
$('layout').onchange = () => { $('stage').dataset.layout = $('layout').value; };
$('local-size').oninput = () => $('stage').style.setProperty('--local-size',`${$('local-size').value}%`);
$('volume').oninput = () => { const volume=Number($('volume').value)/100; $('remote-video').volume=volume; $('remote-video').muted=volume===0; $('volume-value').value=`${Math.round(volume*100)}%`; };
$('remote-video').volume = .8;
$('play').onclick = () => $('remote-video').play().then(()=>{$('play').hidden=true;}).catch(()=>notice('브라우저의 오디오 재생 권한을 확인하세요.'));
for(const button of document.querySelectorAll('[data-fullscreen]')) button.onclick = async () => {
  try { if(document.fullscreenElement) await document.exitFullscreen(); else await $(button.dataset.fullscreen).requestFullscreen(); }
  catch { notice('이 브라우저는 전체 화면을 지원하지 않습니다. 화면 크기 설정을 사용하세요.'); }
};
$('clear').onclick = () => { logs.length=0; $('logs').replaceChildren(); };
$('export').onclick = () => { const url = URL.createObjectURL(new Blob([JSON.stringify(logs,null,2)],{type:'application/json'})); const link=document.createElement('a');link.href=url;link.download='iosignal-webrtc-log.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000); };
window.addEventListener('pagehide',()=>finish());
if(import.meta.hot) import.meta.hot.dispose(()=>finish());
log('lab.ready','IOSignal 7.2.0 · WebRTC · 1:1 audio/video');
updateInvite().catch(()=>log('qr.error','QR 생성 실패',true));
