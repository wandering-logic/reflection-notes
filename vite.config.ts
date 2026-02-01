import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        app: resolve(__dirname, 'app/index.html'),
      },
    },
  },
  server: {
    // Redirect / to /index.html in dev mode (public/ files don't get this automatically)
    proxy: {},
    open: false,
  },
  plugins: [
    {
      name: 'redirect-root',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/') {
            req.url = '/index.html'
          }
          next()
        })
      },
    },
  ],
})
