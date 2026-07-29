import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
            // En producción, Authentik inyecta X-authentik-username antes de
            // llegar al backend (ver api/app/services/auth.py). En local no
            // hay Authentik, así que se simula aquí para no tener que
            // desactivar require_auth en el backend.
            '/api': {
                target: 'http://localhost:8000',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, ''),
                headers: {
                    'X-authentik-username': 'dev-local',
                },
            },
        },
    },
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, '.'),
        }
    }
});
