import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
	plugins: [vue()],
	server: {
		headers: {
			'Content-Security-Policy': "script-src 'self' 'unsafe-eval' 'unsafe-inline';"
		}
	},
	base: './',
})