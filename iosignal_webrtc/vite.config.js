import { defineConfig } from 'vite';
import { Server } from 'iosignal';
let signalServer;
export default defineConfig({
  base: './',
  server: { port: 5180, strictPort: true },
  preview: { port: 4180, strictPort: true },
  plugins: [{
    name: 'iosignal-development-server',
    configureServer() {
      signalServer = new Server({ port: 7781 });
      signalServer.on('ready', () => console.log('IOSignal: ws://localhost:7781'));
    },
    closeBundle() { return signalServer && new Promise(resolve => signalServer.close(resolve)); },
  }],
});
