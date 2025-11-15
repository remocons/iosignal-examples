import { defineConfig } from 'vite';
import { Server } from 'iosignal'

export default {
  plugins: [
    {
      name: 'iosignal-server',

      configureServer() {
        let s = new Server({
          port:7777, congPort:8888,
          showMessage: 'message'
        })
        s.on('ready',()=>{
          console.log('iosignal server listening port :', s.port, s.congPort )
        })

      }
    },
  ],
};





