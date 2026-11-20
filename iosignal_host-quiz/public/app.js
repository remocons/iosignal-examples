// Browser client. IO comes from /vendor/io.js (the IOSignal IIFE bundle).
// It only sends 'quiz#in' and listens; the host inside the server decides everything.
const TAGS = { IN: 'quiz#in', STATE: 'quiz#$state', YOU: '@quiz.you' };
const LETTERS = ['A', 'B', 'C', 'D'];
const $ = (id) => document.getElementById(id);

// Relative to the page, so the quiz also works under a sub path behind a proxy (lab.iosignal.net/quiz/ -> /quiz/ws).
const wsURL = new URL('ws', location.href);
wsURL.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const io = new IO(wsURL.href);
let state = null;
let offset = 0;        // server clock - local clock, from state.now
let joined = false;
let myName = '';
let myChoice = null;   // my answer to the current question (shown until the reveal)
let lastNo = 0;

io.on('change', () => { $('state').textContent = io.stateName; $('state').dataset.s = io.stateName; });
io.on('ready', () => {
  $('cid').textContent = io.cid;
  io.subscribe(TAGS.STATE); // the retained state arrives at once
  // A reconnect gets a new CID: join again with the same name.
  if (joined) io.signal(TAGS.IN, { op: 'join', name: myName });
});

io.on('message', (tag, s) => {
  if (tag !== TAGS.STATE) return;
  state = s;
  offset = s.now - Date.now();
  if (s.no !== lastNo || s.phase === 'waiting') { myChoice = null; lastNo = s.no; $('mine').hidden = true; }
  render();
});

// Personal result, sent with host.to(cid, 'quiz.you', ...): only this connection gets it.
io.on(TAGS.YOU, (_tag, r) => {
  const mine = $('mine');
  mine.hidden = false;
  mine.className = 'mine ' + (r.correct ? 'ok' : 'no');
  mine.textContent = r.answer === null ? '시간 안에 답하지 않았습니다.'
    : r.correct ? `정답! +${r.points}점` : '오답입니다.';
});

$('joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  myName = $('name').value.trim();
  joined = true;
  io.signal(TAGS.IN, { op: 'join', name: myName });
  $('join').hidden = true;
  $('quiz').hidden = false;
});

function answer(i) {
  if (!state || state.phase !== 'question' || myChoice !== null) return;
  myChoice = i;
  io.signal(TAGS.IN, { op: 'answer', choice: i });
  render();
}

function render() {
  if (!state) return;
  const s = state;
  $('qno').textContent = s.phase === 'waiting' ? '참가자를 기다리는 중' : `문제 ${s.no} / ${s.total}`;
  $('qtext').textContent = s.phase === 'waiting' ? '대기 중…' : s.text;

  const box = $('choices');
  box.replaceChildren(...s.choices.map((text, i) => {
    const b = document.createElement('button');
    b.className = 'choice';
    if (myChoice === i) b.classList.add('picked');
    if (s.phase === 'reveal') b.classList.add(i === s.answer ? 'right' : 'wrong');
    b.disabled = s.phase !== 'question' || myChoice !== null || !joined;
    const count = s.counts ? `<span class="count">${s.counts[i]}명</span>` : '';
    b.innerHTML = `<b>${LETTERS[i]}</b><span></span>${count}`;
    b.querySelector('span').textContent = text;
    b.onclick = () => answer(i);
    return b;
  }));

  const board = $('board');
  board.replaceChildren(...s.players.map((p) => {
    const li = document.createElement('li');
    if (p.cid === io.cid) li.classList.add('me');
    li.innerHTML = '<span class="name"></span><span class="tick"></span><span class="score"></span>';
    li.querySelector('.name').textContent = p.name + (p.cid === io.cid ? ' (나)' : '');
    li.querySelector('.tick').textContent = s.phase === 'question' && p.answered ? '✓' : '';
    li.querySelector('.score').textContent = p.score;
    li.title = p.cid;
    return li;
  }));
  if (!s.players.length) board.innerHTML = '<li class="muted">아직 아무도 없습니다</li>';
}

// Countdown with the server's clock.
setInterval(() => {
  if (!state || state.phase === 'waiting') { $('timer').textContent = '-'; $('bar').style.width = '0'; return; }
  const left = Math.max(0, state.endsAt - (Date.now() + offset));
  const full = state.phase === 'question' ? 15000 : 5000;
  $('timer').textContent = state.phase === 'question' ? `${Math.ceil(left / 1000)}초` : '정답 공개';
  $('bar').style.width = `${(left / full) * 100}%`;
  $('bar').dataset.phase = state.phase;
}, 100);

// ---------------- forgery tries ----------------
function log(html) {
  const li = document.createElement('li');
  li.innerHTML = `<time>${new Date().toLocaleTimeString()}</time> ${html}`;
  $('log').prepend(li);
}

$('fakeBoard').onclick = () => {
  // 'quiz#$state' is owned by the host: the server drops this, nobody sees it.
  io.signal(TAGS.STATE, { ...state, players: [{ cid: io.cid, name: '해커', score: 9999, answered: true }] });
  log('<code>quiz#$state</code>로 9999점 점수판을 보냈습니다. 호스트 전용 태그라 서버가 버립니다. 점수판은 그대로입니다.');
};

$('fakeCid').onclick = () => {
  const other = state?.players.find((p) => p.cid !== io.cid);
  if (!other) { log('다른 참가자가 없습니다. 창을 하나 더 열어 입장하세요.'); return; }
  // The host reads from.cid from the server, never a cid inside the payload.
  io.signal(TAGS.IN, { op: 'answer', choice: 0, cid: other.cid });
  log(`<b>${other.name}</b>의 CID를 넣어 A로 답했습니다. 서버는 페이로드의 CID를 보지 않으므로, 아직 답하지 않았다면 <b>내</b> 답으로 처리됩니다.`);
  if (state?.phase === 'question' && myChoice === null) { myChoice = 0; render(); }
};
