/*
 * IOSignal Chat — 채널 협상 데모
 *
 * 흐름
 *  1) 모든 클라이언트는 lobby#presence 에 접속 인사를 발행하고 서로의 CID 를 수집한다.
 *  2) 한쪽이 상대 CID 로 `CID@negotiate` 직접 시그널을 보내 채널을 제안한다.
 *  3) 상대는 수락 / 거절 / 역제안(counter)으로 응답한다.
 *  4) 수락되면 양쪽이 협상된 `room#chat` 채널을 구독하고 메시지를 주고받는다.
 */
(() => {
  'use strict';

  const LOBBY_PRESENCE = 'lobby#presence';
  const LOBBY_HELLO = 'lobby#hello';
  const LOBBY_BYE = 'lobby#bye';
  const NEGOTIATE_TOPIC = 'negotiate';
  const NICK_KEY = 'iosignal-chat:nick';
  const HEARTBEAT_MS = 20000;
  const PEER_TTL_MS = 70000;
  const PENDING_TTL_MS = 120000;
  // 익명 클라이언트(quota level 10)의 signalSize 는 1500 bytes 다.
  // 한글은 글자당 3 bytes 이므로 UTF-8 기준으로도 잘라야 안전하다.
  const MAX_TEXT = 500;
  const MAX_TEXT_BYTES = 1100;
  const encoder = new TextEncoder();

  const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

  const $ = (sel) => document.querySelector(sel);

  const dom = {
    connDot: $('#connDot'),
    connText: $('#connText'),
    myCid: $('#myCid'),
    copyCid: $('#copyCid'),
    newWindow: $('#newWindow'),
    welcomeNewWindow: $('#welcomeNewWindow'),
    nickInput: $('#nickInput'),
    saveNick: $('#saveNick'),
    peerList: $('#peerList'),
    peerEmpty: $('#peerEmpty'),
    peerCount: $('#peerCount'),
    manualChannel: $('#manualChannel'),
    manualJoin: $('#manualJoin'),
    welcomeManual: $('#welcomeManual'),
    logList: $('#logList'),
    logEmpty: $('#logEmpty'),
    clearLog: $('#clearLog'),
    welcome: $('#welcome'),
    roomView: $('#roomView'),
    roomName: $('#roomName'),
    roomBadge: $('#roomBadge'),
    roomMeta: $('#roomMeta'),
    copyTag: $('#copyTag'),
    leaveRoom: $('#leaveRoom'),
    messages: $('#messages'),
    composer: $('#composer'),
    input: $('#input'),
    sendBtn: $('#sendBtn'),
    modalRoot: $('#modalRoot'),
    toasts: $('#toasts'),
    manualDetails: document.querySelector('details.manual'),
  };

  const ANIMALS = ['수달', '여우', '고래', '부엉이', '판다', '라쿤', '토끼', '늑대', '고양이', '펭귄'];
  const ADJECTIVES = ['용감한', '빠른', '느긋한', '반짝이는', '조용한', '수다스러운', '꼼꼼한', '유쾌한'];

  const state = {
    io: null,
    ready: false,
    cid: '',
    nick: '',
    nickKey: '',
    peers: new Map(),
    room: null,
    seen: new Set(),
    pending: new Map(),
    modalQueue: [],
    activeModal: null,
    unread: 0,
    logCount: 0,
  };

  /* ------------------------------------------------------------------ */
  /* utils                                                               */
  /* ------------------------------------------------------------------ */

  function uid() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function rand4() {
    return Math.random().toString(36).slice(2, 6);
  }

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function randomNick() {
    return `${pick(ADJECTIVES)}${pick(ANIMALS)}`;
  }

  function sanitizeNick(value) {
    const s = String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 16);
    return s || '익명';
  }

  function sanitizePart(part, max = 32) {
    return String(part ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\p{L}\p{N}_.-]/gu, '')
      .slice(0, max);
  }

  /** "팀 회의" -> "팀-회의#chat", "a#b" -> "a#b" */
  function normalizeChannel(raw, topic = 'chat') {
    const input = String(raw ?? '').trim();
    const [baseRaw, topicRaw] = input.split('#');
    const base = sanitizePart(baseRaw) || `room-${rand4()}`;
    const t = sanitizePart(topicRaw, 24) || topic;
    return `${base}#${t}`;
  }

  function shortCid(cid) {
    const s = String(cid || '');
    return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
  }

  function timeLabel(ts) {
    return new Date(ts || Date.now()).toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  function clampText(value) {
    const s = String(value ?? '');
    if (encoder.encode(s).length <= MAX_TEXT_BYTES) return s;
    const chars = [...s];
    let lo = 0;
    let hi = chars.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (encoder.encode(chars.slice(0, mid).join('')).length <= MAX_TEXT_BYTES) lo = mid;
      else hi = mid - 1;
    }
    return chars.slice(0, lo).join('');
  }

  function hashIndex(str, mod) {
    let h = 0;
    for (const ch of String(str)) h = (h * 31 + ch.codePointAt(0)) % 997;
    return h % mod;
  }

  function toast(message, kind = 'info') {
    const el = document.createElement('div');
    el.className = 'toast';
    el.dataset.kind = kind;
    el.textContent = message;
    while (dom.toasts.children.length >= 3) dom.toasts.firstElementChild.remove();
    dom.toasts.append(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity .25s ease';
      setTimeout(() => el.remove(), 260);
    }, 3000);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('클립보드에 복사했습니다.', 'ok');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.append(ta);
      ta.select();
      try {
        document.execCommand('copy');
        toast('클립보드에 복사했습니다.', 'ok');
      } catch {
        toast('복사에 실패했습니다. 직접 선택해 주세요.', 'err');
      }
      ta.remove();
    }
  }

  function me() {
    return { cid: state.cid, nick: state.nick };
  }

  /* ------------------------------------------------------------------ */
  /* connection                                                          */
  /* ------------------------------------------------------------------ */

  function setNick(value, { persist = true } = {}) {
    const nick = sanitizeNick(value);
    if (nick === state.nick) return;
    state.nick = nick;
    dom.nickInput.value = nick;
    if (persist && state.nickKey) sessionStorage.setItem(state.nickKey, nick);
    if (state.ready) {
      announcePresence();
      if (state.room) {
        state.io.signal(state.room.tag, {
          kind: 'sys',
          event: 'rename',
          msgId: uid(),
          cid: state.cid,
          nick,
          ts: Date.now(),
        });
      }
      updateRoomMeta();
    }
  }

  function connect() {
    const io = new IO(WS_URL);
    state.io = io;

    io.on('ready', onReady);
    io.on('change', () => renderConnection());
    io.on('error', (err) => {
      console.warn('[iosignal] error', err);
      renderConnection();
      toast(`연결 오류: ${err?.message || err || '알 수 없는 오류'}`, 'err');
    });
    io.on('message', onChannelMessage);
    io.on(`@${NEGOTIATE_TOPIC}`, onNegotiate);

    renderConnection();
  }

  function onReady() {
    const first = !state.ready;
    const previousCid = state.cid;
    state.ready = true;
    state.cid = state.io.cid || state.cid;
    if (state.room && previousCid && previousCid !== state.cid) {
      state.room.participants.delete(previousCid);
      state.room.participants.set(state.cid, state.nick);
    }
    dom.myCid.textContent = state.cid || '—';
    renderConnection();

    state.io.subscribe(`${LOBBY_PRESENCE},${LOBBY_HELLO},${LOBBY_BYE}`);

    if (state.room) {
      state.io.subscribe(state.room.tag);
      setTimeout(() => {
        if (!state.ready || !state.room) return;
        state.io.signal(state.room.tag, {
          kind: 'sys',
          event: 'join',
          msgId: uid(),
          cid: state.cid,
          nick: state.nick,
          ts: Date.now(),
        });
      }, 120);
      if (!first) appendSystem('연결이 복구되었습니다. 채널을 다시 구독했습니다.');
    }

    setTimeout(() => {
      if (!state.ready) return;
      announcePresence();
      state.io.signal(LOBBY_HELLO, { cid: state.cid, nick: state.nick, ts: Date.now() });
    }, 100);
  }

  function renderConnection() {
    const name = state.io?.stateName || '';
    const stateName = String(name).toUpperCase();
    const map = {
      READY: '연결됨',
      CONNECTING: '연결 중…',
      OPEN: '연결 중…',
      CLOSED: '연결 끊김',
      CLOSING: '연결 종료 중',
      STOP: '중지됨',
      AUTH_REQ: '인증 중…',
      AUTH_FAIL: '인증 실패',
    };
    const ready = state.ready && stateName !== 'CLOSED';
    dom.connDot.dataset.state = ready ? 'ready' : stateName === 'CLOSED' ? 'error' : 'connecting';
    dom.connText.textContent = map[stateName] || (state.ready ? '연결됨' : '연결 중…');
    dom.connText.title = name || '';
  }

  function signal(tag, payload) {
    if (!state.ready) return;
    try {
      state.io.signal(tag, payload);
    } catch (err) {
      console.warn('[iosignal] signal failed', tag, err);
      toast('메시지를 보내지 못했습니다.', 'err');
    }
  }

  function announcePresence() {
    signal(LOBBY_PRESENCE, {
      v: 1,
      cid: state.cid,
      nick: state.nick,
      ts: Date.now(),
    });
  }

  function startHeartbeat() {
    setInterval(() => {
      if (state.ready) announcePresence();
      prunePeers();
      purgePending();
    }, HEARTBEAT_MS);
  }

  function prunePeers() {
    const now = Date.now();
    let changed = false;
    for (const [cid, peer] of state.peers) {
      if (now - peer.ts > PEER_TTL_MS) {
        state.peers.delete(cid);
        changed = true;
      }
    }
    if (changed) renderPeers();
  }

  function purgePending() {
    const now = Date.now();
    for (const [id, p] of state.pending) {
      if (now - p.ts > PENDING_TTL_MS) {
        state.pending.delete(id);
        addLog(`협상 시간 초과 · ${p.channel}`, 'err');
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* presence / peers                                                    */
  /* ------------------------------------------------------------------ */

  function onChannelMessage(tag, payload) {
    if (tag === LOBBY_PRESENCE) {
      upsertPeer(payload);
      return;
    }
    if (tag === LOBBY_BYE) {
      if (payload?.cid) {
        state.peers.delete(String(payload.cid));
        renderPeers();
      }
      return;
    }
    if (tag === LOBBY_HELLO) {
      if (payload?.cid && payload.cid !== state.cid) announcePresence();
      return;
    }
    if (state.room && tag === state.room.tag) {
      onRoomMessage(payload);
    }
  }

  function upsertPeer(payload) {
    if (!payload || typeof payload !== 'object') return;
    const cid = String(payload.cid || '').slice(0, 80);
    if (!cid || cid === state.cid) return;
    const nick = sanitizeNick(payload.nick);
    const existing = state.peers.get(cid);
    state.peers.set(cid, { cid, nick, ts: Date.now() });
    if (!existing || existing.nick !== nick) renderPeers();
    if (state.room?.peerCid === cid) {
      state.room.peerNick = nick;
      state.room.participants.set(cid, nick);
      updateRoomMeta();
    }
  }

  function renderPeers() {
    const peers = [...state.peers.values()].sort((a, b) => a.nick.localeCompare(b.nick, 'ko'));
    dom.peerList.replaceChildren();
    for (const peer of peers) {
      const li = document.createElement('li');
      li.className = 'peer';
      li.dataset.cid = peer.cid;

      const avatar = document.createElement('span');
      avatar.className = `avatar${hashIndex(peer.cid, 2) ? ' alt' : ''}`;
      avatar.textContent = [...peer.nick][0] || '?';

      const info = document.createElement('div');
      info.className = 'peer-info';
      const name = document.createElement('span');
      name.className = 'peer-name';
      name.textContent = peer.nick;
      const cid = document.createElement('span');
      cid.className = 'peer-cid';
      cid.textContent = shortCid(peer.cid);
      cid.title = peer.cid;
      info.append(name, cid);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ghost negotiate';
      btn.textContent = '협상';
      btn.title = `${peer.nick} 님에게 채널 협상 제안`;
      btn.addEventListener('click', () => openComposeModal(peer));

      li.append(avatar, info, btn);
      dom.peerList.append(li);
    }
    dom.peerCount.textContent = String(peers.length);
    dom.peerEmpty.hidden = peers.length > 0;
  }

  /* ------------------------------------------------------------------ */
  /* negotiation protocol                                                */
  /* ------------------------------------------------------------------ */

  function sendNegotiation(peerCid, payload) {
    if (!peerCid) return;
    signal(`${peerCid}@${NEGOTIATE_TOPIC}`, {
      v: 1,
      from: me(),
      ts: Date.now(),
      ...payload,
    });
  }

  function proposeChannel(peer, channel, note) {
    if (!state.ready) {
      toast('아직 서버에 연결 중입니다.', 'err');
      return;
    }
    const id = uid();
    const normalized = normalizeChannel(channel);
    const cleanNote = String(note ?? '').trim().slice(0, 80);

    state.pending.set(id, {
      id,
      role: 'initiator',
      channel: normalized,
      peer: { cid: peer.cid, nick: peer.nick },
      note: cleanNote,
      ts: Date.now(),
    });

    sendNegotiation(peer.cid, {
      type: 'propose',
      id,
      channel: normalized,
      note: cleanNote,
    });

    addLog(`${peer.nick} 님에게 제안 · ${normalized}`, 'out');
    toast(`${peer.nick} 님에게 채널을 제안했습니다. 응답을 기다리는 중…`);
  }

  function onNegotiate(tag, payload) {
    if (!payload || typeof payload !== 'object' || payload.v !== 1) return;
    const from = payload.from;
    if (!from || !from.cid || String(from.cid) === state.cid) return;

    const peer = {
      cid: String(from.cid).slice(0, 80),
      nick: sanitizeNick(from.nick),
    };
    const id = String(payload.id || '').slice(0, 80);
    const channel = normalizeChannel(payload.channel);
    const note = String(payload.note ?? '').trim().slice(0, 80);

    if (!id) return;

    switch (payload.type) {
      case 'propose':
        receiveProposal({ id, peer, channel, note });
        break;
      case 'counter':
        receiveCounter({ id, peer, channel, note });
        break;
      case 'accept':
        receiveAccept({ id, channel, peer });
        break;
      case 'reject':
        receiveReject({ id, peer });
        break;
      default:
        break;
    }
  }

  function receiveProposal({ id, peer, channel, note }) {
    if (state.pending.has(id)) return;

    state.pending.set(id, {
      id,
      role: 'responder',
      channel,
      peer,
      note,
      ts: Date.now(),
    });

    addLog(`${peer.nick} 님의 제안 · ${channel}`, 'in');
    toast(`${peer.nick} 님이 채널 협상을 제안했습니다.`, 'ok');
    enqueueModal({
      type: 'incoming',
      mode: 'propose',
      negotiationId: id,
      peer,
      channel,
      note,
    });
  }

  function receiveCounter({ id, peer, channel, note }) {
    const pending = state.pending.get(id);
    if (!pending) {
      // 제안을 놓친 경우에도 역제안을 새 제안처럼 처리한다.
      receiveProposal({ id, peer, channel, note });
      return;
    }

    const peerInfo = pending.peer || peer;
    state.pending.set(id, {
      id,
      role: 'responder',
      channel,
      peer: peerInfo,
      note,
      ts: Date.now(),
    });

    addLog(`${peerInfo.nick} 님의 역제안 · ${channel}`, 'in');
    toast(`${peerInfo.nick} 님이 역제안을 보냈습니다.`, 'ok');
    enqueueModal({
      type: 'incoming',
      mode: 'counter',
      negotiationId: id,
      peer: peerInfo,
      channel,
      note,
    });
  }

  function acceptOffer(offer) {
    if (!state.ready) {
      toast('아직 서버에 연결 중입니다.', 'err');
      return;
    }
    const pending = state.pending.get(offer.negotiationId);
    if (!pending) {
      toast('이미 종료된 협상입니다.', 'err');
      return;
    }

    const channel = normalizeChannel(offer.channel || pending.channel);
    sendNegotiation(pending.peer.cid, {
      type: 'accept',
      id: pending.id,
      channel,
    });
    state.pending.delete(pending.id);
    addLog(`${pending.peer.nick} 님의 제안 수락 · ${channel}`, 'ok');
    joinRoom({
      channel,
      peerCid: pending.peer.cid,
      peerNick: pending.peer.nick,
      via: 'negotiation',
    });
  }

  function rejectOffer(offer) {
    const pending = state.pending.get(offer.negotiationId);
    if (!pending) return;
    sendNegotiation(pending.peer.cid, {
      type: 'reject',
      id: pending.id,
      channel: pending.channel,
    });
    state.pending.delete(pending.id);
    addLog(`${pending.peer.nick} 님의 제안 거절`, 'err');
    toast(`${pending.peer.nick} 님에게 거절을 보냈습니다.`);
  }

  function counterOffer(offer, channel, note) {
    if (!state.ready) {
      toast('아직 서버에 연결 중입니다.', 'err');
      return;
    }
    const pending = state.pending.get(offer.negotiationId);
    if (!pending) return;
    const normalized = normalizeChannel(channel);
    const cleanNote = String(note ?? '').trim().slice(0, 80);

    state.pending.set(pending.id, {
      ...pending,
      role: 'initiator',
      channel: normalized,
      note: cleanNote,
      ts: Date.now(),
    });

    sendNegotiation(pending.peer.cid, {
      type: 'counter',
      id: pending.id,
      channel: normalized,
      note: cleanNote,
    });

    addLog(`${pending.peer.nick} 님에게 역제안 · ${normalized}`, 'out');
    toast(`${pending.peer.nick} 님에게 역제안을 보냈습니다.`);
  }

  function receiveAccept({ id, channel, peer }) {
    const pending = state.pending.get(id);
    if (!pending) return;
    const target = pending.peer || peer;
    const normalized = normalizeChannel(channel || pending.channel);
    state.pending.delete(id);
    addLog(`${target.nick} 님이 수락 · ${normalized}`, 'ok');
    toast(`${target.nick} 님이 제안을 수락했습니다. 채널에 입장합니다.`, 'ok');
    closeModalIfNegotiation(id);
    joinRoom({
      channel: normalized,
      peerCid: target.cid,
      peerNick: target.nick,
      via: 'negotiation',
    });
  }

  function receiveReject({ id, peer }) {
    const pending = state.pending.get(id);
    if (!pending) return;
    const target = pending.peer || peer;
    state.pending.delete(id);
    addLog(`${target.nick} 님이 거절`, 'err');
    toast(`${target.nick} 님이 제안을 거절했습니다.`, 'err');
    closeModalIfNegotiation(id);
  }

  /* ------------------------------------------------------------------ */
  /* room                                                                */
  /* ------------------------------------------------------------------ */

  function joinRoom({ channel, peerCid = '', peerNick = '', via = 'manual' }) {
    if (!state.ready) {
      toast('아직 서버에 연결 중입니다. 잠시 후 다시 시도해 주세요.', 'err');
      return;
    }

    if (state.room) leaveRoom({ silent: true });

    const tag = normalizeChannel(channel);
    state.room = {
      tag,
      peerCid,
      peerNick,
      participants: new Map(),
      via,
    };
    state.room.participants.set(state.cid, state.nick);
    if (peerCid) state.room.participants.set(peerCid, peerNick);

    state.seen.clear();
    dom.messages.replaceChildren();
    dom.welcome.hidden = true;
    dom.roomView.hidden = false;
    renderRoom();
    addLog(`채널 입장 · ${tag}`, 'ok');
    appendSystem(`${tag} 채널에 입장했습니다.`);
    if (peerNick) appendSystem(`${peerNick} 님과의 대화입니다.`);

    try {
      state.io.subscribe(tag);
    } catch (err) {
      console.warn('[iosignal] subscribe failed', err);
    }

    const joinPayload = {
      kind: 'sys',
      event: 'join',
      msgId: uid(),
      cid: state.cid,
      nick: state.nick,
      ts: Date.now(),
    };
    setTimeout(() => {
      if (!state.ready || state.room?.tag !== tag) return;
      signal(tag, joinPayload);
    }, 120);

    dom.input.focus();
    resetUnread();
  }

  function leaveRoom({ silent = false, notify = true } = {}) {
    const room = state.room;
    if (!room) return;

    if (notify && state.ready) {
      signal(room.tag, {
        kind: 'sys',
        event: 'leave',
        msgId: uid(),
        cid: state.cid,
        nick: state.nick,
        ts: Date.now(),
      });
    }

    if (state.ready) {
      try {
        state.io.unsubscribe(room.tag);
      } catch (err) {
        console.warn('[iosignal] unsubscribe failed', err);
      }
    }

    if (!silent) addLog(`채널 나가기 · ${room.tag}`, 'out');

    state.room = null;
    state.seen.clear();
    dom.messages.replaceChildren();
    dom.roomView.hidden = true;
    dom.welcome.hidden = false;
    dom.input.value = '';
    resizeInput();
    updateTitle();
  }

  function onRoomMessage(payload) {
    if (!payload || typeof payload !== 'object' || !state.room) return;

    if (payload.msgId) {
      if (state.seen.has(payload.msgId)) return;
      state.seen.add(payload.msgId);
    }

    if (payload.kind === 'chat') {
      const nick = sanitizeNick(payload.nick);
      const text = clampText(payload.text);
      if (!text) return;
      if (payload.cid && payload.cid !== state.cid) {
        state.room.participants.set(payload.cid, nick);
      }
      renderChatMessage({
        own: payload.cid === state.cid,
        cid: payload.cid,
        nick,
        text,
        ts: payload.ts,
      });
      updateRoomMeta();
      if (payload.cid !== state.cid && document.hidden) bumpUnread();
      return;
    }

    if (payload.kind === 'sys') {
      if (payload.cid === state.cid) {
        // 내 join/leave/rename 은 로컬에서 이미 표시했다.
        return;
      }
      const nick = sanitizeNick(payload.nick);
      if (payload.cid) state.room.participants.set(payload.cid, nick);
      if (payload.event === 'join') {
        appendSystem(`${nick} 님이 입장했습니다.`);
      } else if (payload.event === 'leave') {
        state.room.participants.delete(payload.cid);
        appendSystem(`${nick} 님이 나갔습니다.`);
      } else if (payload.event === 'rename') {
        appendSystem(`닉네임이 ${nick} (으)로 바뀌었습니다.`);
        if (state.room.peerCid === payload.cid) {
          state.room.peerNick = nick;
          renderRoom();
        }
      }
      updateRoomMeta();
    }
  }

  function sendChat(text) {
    if (!state.room || !text.trim()) return;
    if (!state.ready) {
      toast('연결이 끊겨 메시지를 보내지 못했습니다.', 'err');
      return;
    }
    const payload = {
      kind: 'chat',
      msgId: uid(),
      cid: state.cid,
      nick: state.nick,
      text: clampText(text),
      ts: Date.now(),
    };
    state.seen.add(payload.msgId);
    signal(state.room.tag, payload);
    renderChatMessage({ ...payload, own: true });
    dom.input.value = '';
    resizeInput();
    dom.input.focus();
  }

  function renderChatMessage({ own, nick, text, ts, cid }) {
    const row = document.createElement('div');
    row.className = `msg-row${own ? ' me' : ''}`;

    const avatar = document.createElement('span');
    avatar.className = 'msg-avatar';
    avatar.textContent = [...(nick || '?')][0] || '?';
    avatar.style.filter = own ? '' : `hue-rotate(${hashIndex(cid || nick, 8) * 20}deg)`;

    const col = document.createElement('div');
    col.className = 'msg-col';

    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    const name = document.createElement('span');
    name.className = 'msg-name';
    name.textContent = own ? '나' : nick;
    const time = document.createElement('span');
    time.textContent = timeLabel(ts);
    meta.append(name, time);

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;

    col.append(meta, bubble);
    row.append(avatar, col);

    const nearBottom =
      dom.messages.scrollHeight - dom.messages.scrollTop - dom.messages.clientHeight < 120;
    dom.messages.append(row);
    if (own || nearBottom) dom.messages.scrollTop = dom.messages.scrollHeight;
  }

  function appendSystem(text) {
    if (!state.room) return;
    const el = document.createElement('div');
    el.className = 'sys-row';
    el.textContent = text;
    dom.messages.append(el);
    dom.messages.scrollTop = dom.messages.scrollHeight;
  }

  function renderRoom() {
    if (!state.room) return;
    const base = state.room.tag.split('#')[0];
    dom.roomName.textContent = `${state.room.peerNick ? `${state.room.peerNick} 님과의 대화` : base}`;
    dom.roomBadge.textContent = '#';
    dom.roomMeta.title = state.room.tag;
    updateRoomMeta();
  }

  function updateRoomMeta() {
    if (!state.room) return;
    const peer = state.room.peerNick ? `상대 ${state.room.peerNick} · ` : '';
    const count = state.room.participants.size || 1;
    dom.roomMeta.textContent = `${peer}${state.room.tag} · 참여 ${count}명`;
  }

  /* ------------------------------------------------------------------ */
  /* modal                                                               */
  /* ------------------------------------------------------------------ */

  function enqueueModal(modal) {
    state.modalQueue.push(modal);
    if (!state.activeModal) showNextModal();
  }

  function showNextModal() {
    const next = state.modalQueue.shift();
    if (!next) {
      state.activeModal = null;
      dom.modalRoot.hidden = true;
      dom.modalRoot.replaceChildren();
      return;
    }
    state.activeModal = next;
    renderModal(next);
  }

  function closeModal() {
    state.activeModal = null;
    showNextModal();
  }

  function closeModalIfNegotiation(id) {
    state.modalQueue = state.modalQueue.filter((m) => m.negotiationId !== id);
    if (state.activeModal?.negotiationId === id) closeModal();
  }

  function openComposeModal(peer) {
    enqueueModal({ type: 'compose', peer, channel: `chat-${rand4()}#chat`, note: '' });
  }

  function renderModal(cfg) {
    dom.modalRoot.hidden = false;
    dom.modalRoot.replaceChildren();

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    const kicker = document.createElement('span');
    kicker.className = 'modal-kicker';

    const title = document.createElement('h3');
    const sub = document.createElement('p');
    sub.className = 'modal-sub';

    const channelField = document.createElement('div');
    channelField.className = 'field';
    const channelLabel = document.createElement('label');
    channelLabel.textContent = '채널 이름';
    const channelInput = document.createElement('input');
    channelInput.type = 'text';
    channelInput.id = 'modalChannel';
    channelInput.maxLength = 60;
    channelInput.autocomplete = 'off';
    channelInput.spellcheck = false;
    channelInput.value = cfg.channel || '';
    const isCompose = cfg.type === 'compose';
    const channelHint = document.createElement('p');
    channelHint.className = 'hint';
    channelHint.textContent = isCompose
      ? '영문·숫자·한글 사용. 공백은 - 로 바뀌고 토픽은 #chat 이 붙습니다.'
      : '수락하면 이 채널로 입장합니다. 이름을 바꿔 역제안할 수도 있습니다.';
    channelField.append(channelLabel, channelInput, channelHint);

    const noteField = document.createElement('div');
    noteField.className = 'field';
    const noteLabel = document.createElement('label');
    noteLabel.textContent = isCompose ? '메모 (선택)' : '응답 메모 (역제안 시, 선택)';
    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.id = 'modalNote';
    noteInput.maxLength = 80;
    noteInput.placeholder = isCompose ? '예: 프로젝트 이야기 나눠요' : '역제안과 함께 보낼 메모';
    noteInput.value = isCompose ? cfg.note || '' : '';
    noteField.append(noteLabel, noteInput);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const mkBtn = (label, cls, onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.textContent = label;
      b.addEventListener('click', onClick);
      return b;
    };

    if (cfg.type === 'compose') {
      kicker.textContent = 'CHANNEL NEGOTIATION';
      title.textContent = '채널 협상 제안';
      sub.append('상대 ');
      const strong = document.createElement('strong');
      strong.textContent = cfg.peer.nick;
      sub.append(strong, ` 님에게 대화 채널을 제안합니다.`);
      actions.append(
        mkBtn('취소', 'ghost', closeModal),
        Object.assign(document.createElement('span'), { className: 'spacer' }),
        mkBtn('제안 보내기', 'primary', () => {
          proposeChannel(cfg.peer, channelInput.value, noteInput.value);
          closeModal();
        }),
      );
    } else {
      const isCounter = cfg.mode === 'counter';
      kicker.textContent = isCounter ? 'COUNTER PROPOSAL' : 'INCOMING PROPOSAL';
      title.textContent = isCounter ? '역제안이 도착했습니다' : '채널 협상 제안';
      sub.append('보낸 사람 ');
      const strong = document.createElement('strong');
      strong.textContent = cfg.peer.nick;
      sub.append(strong, isCounter ? ' 님이 채널 이름을 바꿔 다시 제안했습니다.' : ' 님이 대화 채널을 제안했습니다.');

      if (cfg.note) {
        const note = document.createElement('p');
        note.className = 'modal-note';
        note.textContent = `“${cfg.note}”`;
        modal.append(kicker, title, sub, note, channelField, noteField, actions);
      } else {
        modal.append(kicker, title, sub, channelField, noteField, actions);
      }

      actions.append(
        mkBtn('거절', 'danger', () => {
          rejectOffer(cfg);
          closeModal();
        }),
        mkBtn('역제안', 'ghost', () => {
          counterOffer(cfg, channelInput.value, noteInput.value);
          closeModal();
        }),
        mkBtn('수락', 'primary', () => {
          acceptOffer(cfg);
          closeModal();
        }),
      );
    }

    if (cfg.type === 'compose') {
      modal.append(kicker, title, sub, channelField, noteField, actions);
      const tip = document.createElement('p');
      tip.className = 'modal-note';
      tip.textContent =
        '상대가 수락하면 양쪽이 같은 채널을 구독합니다. 상대는 수락 대신 역제안할 수도 있습니다.';
      modal.append(tip);
    }

    dom.modalRoot.append(modal);
    setTimeout(() => channelInput.focus(), 30);

    noteInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        actions.querySelector('.primary')?.click();
      }
    });
    channelInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        actions.querySelector('.primary')?.click();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* negotiation log                                                     */
  /* ------------------------------------------------------------------ */

  function addLog(text, kind = 'out') {
    const el = document.createElement('li');
    el.className = 'log-item';
    el.dataset.kind = kind;

    const time = document.createElement('span');
    time.className = 'log-time';
    time.textContent = timeLabel();

    const arrow = document.createElement('span');
    arrow.className = 'log-arrow';
    arrow.textContent = kind === 'in' ? '←' : kind === 'ok' ? '✓' : kind === 'err' ? '✕' : '→';

    const body = document.createElement('span');
    body.className = 'log-text';
    body.textContent = text;

    el.append(time, arrow, body);
    dom.logList.append(el);
    dom.logEmpty.hidden = true;
    el.scrollIntoView({ block: 'nearest' });

    state.logCount += 1;
    if (state.logCount > 120) {
      dom.logList.firstElementChild?.remove();
      state.logCount -= 1;
    }
  }

  /* ------------------------------------------------------------------ */
  /* ui events                                                           */
  /* ------------------------------------------------------------------ */

  function resizeInput() {
    dom.input.style.height = 'auto';
    dom.input.style.height = `${Math.min(dom.input.scrollHeight, 132)}px`;
  }

  function updateTitle() {
    document.title = state.unread > 0 ? `(${state.unread}) IOSignal Chat` : 'IOSignal Chat';
  }

  function bumpUnread() {
    state.unread += 1;
    updateTitle();
  }

  function resetUnread() {
    if (state.unread === 0) return;
    state.unread = 0;
    updateTitle();
  }

  function openNewWindow() {
    window.open(location.href, '_blank', 'noopener');
  }

  function bindEvents() {
    dom.copyCid.addEventListener('click', () => copyText(state.cid));
    dom.newWindow.addEventListener('click', openNewWindow);
    dom.welcomeNewWindow.addEventListener('click', openNewWindow);

    dom.nickInput.addEventListener('change', () => setNick(dom.nickInput.value));
    dom.saveNick.addEventListener('click', () => {
      setNick(dom.nickInput.value);
      toast(`닉네임을 “${state.nick}” (으)로 저장했습니다.`, 'ok');
    });
    dom.nickInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        setNick(dom.nickInput.value);
        dom.nickInput.blur();
      }
    });

    dom.composer.addEventListener('submit', (e) => {
      e.preventDefault();
      sendChat(dom.input.value);
    });
    dom.input.addEventListener('input', resizeInput);
    dom.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        sendChat(dom.input.value);
      }
    });

    dom.leaveRoom.addEventListener('click', () => {
      leaveRoom();
    });
    dom.copyTag.addEventListener('click', () => {
      if (state.room) copyText(state.room.tag);
    });

    dom.manualJoin.addEventListener('click', () => {
      const tag = normalizeChannel(dom.manualChannel.value);
      joinRoom({ channel: tag, via: 'manual' });
    });
    dom.manualChannel.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        dom.manualJoin.click();
      }
    });
    dom.welcomeManual.addEventListener('click', () => {
      dom.manualDetails.open = true;
      dom.manualChannel.focus();
      dom.manualChannel.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });

    dom.clearLog.addEventListener('click', () => {
      dom.logList.replaceChildren();
      dom.logEmpty.hidden = false;
      state.logCount = 0;
    });

    dom.modalRoot.addEventListener('click', (e) => {
      if (e.target === dom.modalRoot) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.activeModal) closeModal();
    });

    window.addEventListener('focus', resetUnread);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) resetUnread();
      else if (state.ready) announcePresence();
    });

    window.addEventListener('pagehide', () => {
      try {
        if (state.ready) {
          signal(LOBBY_BYE, { cid: state.cid, nick: state.nick, ts: Date.now() });
          if (state.room) {
            signal(state.room.tag, {
              kind: 'sys',
              event: 'leave',
              msgId: uid(),
              cid: state.cid,
              nick: state.nick,
              ts: Date.now(),
            });
          }
          state.io.stop();
        }
      } catch {
        /* noop */
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* boot                                                                */
  /* ------------------------------------------------------------------ */

  /** 새 창/새 탭은 새 닉네임, 같은 탭의 새로고침은 기존 닉네임을 유지한다. */
  function tabScopedNickKey() {
    const match = /(?:^|\s)iosignal-tab=([\w-]+)/.exec(window.name || '');
    let id = match?.[1];
    if (!id) {
      id = uid().slice(0, 8);
      window.name = `${window.name ? `${window.name} ` : ''}iosignal-tab=${id}`;
    }
    return `${NICK_KEY}:${id}`;
  }

  function initNick() {
    state.nickKey = tabScopedNickKey();
    let nick = '';
    try {
      nick = sessionStorage.getItem(state.nickKey) || '';
    } catch {
      /* noop */
    }
    if (!nick) {
      nick = randomNick();
      try {
        sessionStorage.setItem(state.nickKey, nick);
      } catch {
        /* noop */
      }
    }
    state.nick = sanitizeNick(nick);
    dom.nickInput.value = state.nick;
  }

  function boot() {
    initNick();
    bindEvents();
    renderPeers();
    updateTitle();
    resizeInput();
    addLog('클라이언트 시작 · 서버 연결 대기', 'out');
    connect();
    startHeartbeat();
  }

  boot();
})();
