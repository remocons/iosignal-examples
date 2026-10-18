import { Server } from 'iosignal';
const port = Number(process.env.PORT || 7781);
const server = new Server({ port });
server.on('ready', () => console.log(`IOSignal listening on ${port}; production needs a WSS reverse proxy.`));
let closing = false;
for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => {
  if (closing) return;
  closing = true;
  server.close(() => process.exit(0));
});
