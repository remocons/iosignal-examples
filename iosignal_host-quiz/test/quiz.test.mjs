import test from 'node:test';
import assert from 'node:assert/strict';
import { QuizGame, cleanName } from '../src/quiz.mjs';

const Q = [
  { text: 'q1', choices: ['a', 'b'], answer: 1 },
  { text: 'q2', choices: ['a', 'b'], answer: 0 },
];
const rules = { QUESTION_MS: 10000, REVEAL_MS: 3000, BASE_POINTS: 10, MAX_PLAYERS: 2, NAME_MAX: 12 };

test('the first player starts the first question', () => {
  const g = new QuizGame({ questions: Q, rules });
  assert.equal(g.state().phase, 'waiting');
  g.join('?a', 'alice', 0);
  assert.equal(g.phase, 'question');
  assert.equal(g.state().no, 1);
  assert.equal(g.state().answer, null, 'the answer stays hidden while answering');
});

test('scoring: correct and faster is more; one answer per question', () => {
  const g = new QuizGame({ questions: Q, rules });
  g.join('?a', 'alice', 0);
  g.join('?b', 'bob', 0);
  assert.equal(g.answer('?a', 1, 2000), true);
  assert.equal(g.answer('?a', 0, 2100), false, 'second answer ignored');
  assert.equal(g.answer('?b', 0, 3000), true); // everyone answered -> reveal now
  assert.equal(g.phase, 'reveal');
  const s = g.state();
  assert.equal(s.answer, 1);
  assert.deepEqual(s.counts, [1, 1]);
  assert.deepEqual(s.players.map((p) => [p.name, p.score]), [['alice', 18], ['bob', 0]]);
  assert.deepEqual(Object.fromEntries(g.results), {
    '?a': { correct: true, points: 18, answer: 1 },
    '?b': { correct: false, points: 0, answer: 0 },
  });
});

test('clock: time runs out, then the next question', () => {
  const g = new QuizGame({ questions: Q, rules });
  g.join('?a', 'alice', 0);
  assert.equal(g.tick(9999), false);
  assert.equal(g.tick(10000), true);
  assert.equal(g.phase, 'reveal');
  assert.equal(g.results[0][1].answer, null);
  assert.equal(g.tick(13000), true);
  assert.equal(g.phase, 'question');
  assert.equal(g.state().no, 2);
});

test('invalid answers, full room, leave and names', () => {
  const g = new QuizGame({ questions: Q, rules });
  g.join('?a', 'alice', 0);
  assert.equal(g.answer('?x', 1, 1), false, 'not a player');
  assert.equal(g.answer('?a', 5, 1), false, 'no such choice');
  assert.equal(g.answer('?a', '1', 1), false, 'not an integer');
  g.join('?b', 'bob', 0);
  assert.equal(g.join('?c', 'carol', 0), false, 'MAX_PLAYERS');
  g.leave('?a'); g.leave('?b');
  assert.equal(g.phase, 'waiting');
  assert.equal(cleanName('<b>홍길동</b>!!', 'x'), 'b홍길동b');
  assert.equal(cleanName('', 'x'), 'x');
});
