// Quiz rules with no networking, so they can be tested on their own.
// The server feeds in joins, answers and the clock; it publishes what state() returns.

export const QUESTIONS = [
  { text: 'IOSignal 서버에서 게임 로직을 실행하는 API는?', choices: ['io.call()', 'server.host()', 'server.attach()', 'io.listen()'], answer: 1 },
  { text: '호스트가 받는 입력에 붙어 오는 보낸 사람 정보는?', choices: ['페이로드의 cid', 'from.cid', '태그의 앞부분', '알 수 없음'], answer: 1 },
  { text: "태그에 '$'가 들어가면 서버는?", choices: ['메시지를 버린다', '마지막 값을 보관한다', '암호화한다', '모두에게 보낸다'], answer: 1 },
  { text: "'own'에 넣은 태그로 클라이언트가 보내면?", choices: ['모두에게 전달', '호스트에게 전달', '버려진다', '연결이 끊긴다'], answer: 2 },
  { text: "host.to(cid, 'quiz.you', …)를 받는 쪽의 태그는?", choices: ["'quiz.you'", "'@quiz.you'", "'<cid>@quiz.you'", "'quiz#you'"], answer: 1 },
];

export const RULES = {
  QUESTION_MS: 15000, // time to answer
  REVEAL_MS: 5000,    // correct answer shown before the next question
  BASE_POINTS: 10,    // a correct answer, plus 1 point per second left
  MAX_PLAYERS: 50,
  NAME_MAX: 12,
};

export function cleanName(name, fallback) {
  const clean = String(name ?? '').replace(/[^\p{L}\p{N}_\- ]/gu, '').trim().slice(0, RULES.NAME_MAX);
  return clean || fallback;
}

export class QuizGame {
  constructor({ questions = QUESTIONS, rules = RULES } = {}) {
    this.questions = questions;
    this.rules = rules;
    this.players = new Map(); // cid -> { cid, name, score, answer, at }
    this.index = -1;          // current question; -1 before the first player joins
    this.phase = 'waiting';   // 'waiting' | 'question' | 'reveal'
    this.endsAt = 0;
    this.results = [];        // [[cid, { correct, points }]] personal results of the last reveal
  }

  join(cid, name, now) {
    if (this.players.has(cid)) {
      this.players.get(cid).name = cleanName(name, this.players.get(cid).name);
      return true;
    }
    if (this.players.size >= this.rules.MAX_PLAYERS) return false;
    this.players.set(cid, { cid, name: cleanName(name, 'p-' + cid.replace(/\W/g, '').slice(-4)), score: 0, answer: null, at: 0 });
    if (this.phase === 'waiting') this.next(now);
    return true;
  }

  leave(cid) {
    const left = this.players.delete(cid);
    if (this.players.size === 0) { this.phase = 'waiting'; this.index = -1; }
    return left;
  }

  // The first answer of a player for the current question counts; later ones are ignored.
  answer(cid, choice, now) {
    const p = this.players.get(cid);
    const q = this.questions[this.index];
    if (!p || this.phase !== 'question' || p.answer !== null) return false;
    if (!Number.isInteger(choice) || choice < 0 || choice >= q.choices.length) return false;
    p.answer = choice;
    p.at = now;
    if ([...this.players.values()].every((x) => x.answer !== null)) this.reveal(now);
    return true;
  }

  next(now) {
    this.index = (this.index + 1) % this.questions.length;
    this.phase = 'question';
    this.endsAt = now + this.rules.QUESTION_MS;
    for (const p of this.players.values()) { p.answer = null; p.at = 0; }
  }

  reveal(now) {
    const q = this.questions[this.index];
    this.results = [];
    for (const p of this.players.values()) {
      const correct = p.answer === q.answer;
      const points = correct ? this.rules.BASE_POINTS + Math.max(0, Math.ceil((this.endsAt - p.at) / 1000)) : 0;
      p.score += points;
      this.results.push([p.cid, { correct, points, answer: p.answer }]);
    }
    this.phase = 'reveal';
    this.endsAt = now + this.rules.REVEAL_MS;
  }

  // Returns true when the phase changed.
  tick(now) {
    if (this.phase === 'waiting' || now < this.endsAt) return false;
    if (this.phase === 'question') this.reveal(now);
    else this.next(now);
    return true;
  }

  // Everything a screen needs. Answers stay hidden until the reveal.
  state() {
    const q = this.questions[this.index];
    const reveal = this.phase === 'reveal';
    const counts = q ? q.choices.map((_, i) => [...this.players.values()].filter((p) => p.answer === i).length) : [];
    return {
      phase: this.phase,
      no: this.index + 1,
      total: this.questions.length,
      text: q?.text ?? '',
      choices: q?.choices ?? [],
      endsAt: this.endsAt,
      answer: reveal ? q.answer : null,
      counts: reveal ? counts : null,
      players: [...this.players.values()]
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
        .map((p) => ({ cid: p.cid, name: p.name, score: p.score, answered: p.answer !== null })),
    };
  }
}
