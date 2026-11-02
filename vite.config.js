import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // O padrão do Vite 6 exige navegador recente (Chrome 107+). O celular da
    // loja é antigo: sem isto, o bundle usa sintaxe que ele não entende e a
    // página fica em branco em vez de abrir.
    target: ['es2019', 'chrome80', 'safari13', 'firefox78', 'edge88'],
  },
  server: {
    proxy: {
      '/api/mercadopago': {
        target: 'https://api.mercadopago.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/mercadopago/, '')
      }
    }
  }
})
