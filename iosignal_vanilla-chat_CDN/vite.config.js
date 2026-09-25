import { defineConfig } from 'vite';
import { Server, version } from 'iosignal';

// Keep each example self-contained: Vite starts and stops its chat server.
function iosignalServer() {
  let server;
  let closing;

  return {
    name: 'iosignal-server',
    configureServer() {
      closing = undefined;
      server = new Server({
        port: 7780,
        showMessage: 'message',
      });
      server.on('ready', () => {
        console.log(`iosignal server ${version} listening port : ${server.port}`);
      });
    },
    closeBundle() {
      // Vite awaits this hook on shutdown and before restarting the server.
      if (!server) return;
      closing ??= new Promise((resolve) => server.close(resolve));
      return closing;
    },
  };
}

export default defineConfig({
  server: { port: 5176, strictPort: true },
  plugins: [iosignalServer()],
});
