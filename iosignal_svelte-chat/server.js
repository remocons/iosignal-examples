import { Server, version } from 'iosignal';

// For build/preview: run this in a separate terminal instead of npm run dev.
const server = new Server({ port: 7778 });
server.on('ready', () => console.log(`IOSignal ${version}: ws://localhost:${server.port}`));
let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
