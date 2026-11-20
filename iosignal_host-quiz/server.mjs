import { version } from 'iosignal';
import { startQuiz } from './src/quiz-server.mjs';

const PORT = Number(process.env.PORT || 5181);
// HOST=127.0.0.1 keeps the port private behind a proxy (lab.iosignal.net/quiz/ runs it that way).
const HOST = process.env.HOST || undefined;
// DASHBOARD=off turns the status page off; DASHBOARD_TOKEN=... asks viewers for that token (8+ characters).
const dashboard = process.env.DASHBOARD === 'off' ? false
  : process.env.DASHBOARD_TOKEN ? { access: { token: process.env.DASHBOARD_TOKEN } } : true;
const quiz = await startQuiz({ port: PORT, listenHost: HOST, dashboard });

console.log(`
IOSignal ${version} — Host Quiz
  Web page   http://localhost:${quiz.port}
  WebSocket  ws://localhost:${quiz.port}/ws${dashboard ? `
  Dashboard  http://localhost:${quiz.port}/dashboard${dashboard.access ? '   (token)' : ''}` : ''}
`);

const stop = async () => { await quiz.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
