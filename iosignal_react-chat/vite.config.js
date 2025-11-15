import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { Server, version } from 'iosignal'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(),
  {
    name: 'iosignal-server',

    configureServer() {
      let s = new Server({
        port: 7777,
        showMessage: 'message'
      })
      s.on('ready', () => {
        console.log(`iosignal server ${version} listening port : ${s.port}`)
      })

    }
  },
  ],
})
