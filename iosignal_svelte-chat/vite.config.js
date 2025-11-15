import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { Server, version} from 'iosignal'

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
		        console.log(`iosignal server ${version} listening port : ${s.port}`)
				})

			}
		},
	]
});

