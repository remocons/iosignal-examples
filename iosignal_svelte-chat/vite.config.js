import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { Server } from 'iosignal'

export default defineConfig({
	plugins: [
		sveltekit(),
		{
			name: 'iosignal-server',

			configureServer() {
				let s = new Server({
					port: 7777,
					showMessage: 'message'
				})
				s.on('ready', () => {
					console.log('iosignal server listening port :', s.port)
				})

			}
		},
	]
});

