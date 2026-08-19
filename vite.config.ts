import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

// Scribble is a local-first desktop application. Nothing here may introduce a
// remote origin: all assets are bundled and served from the local dev server or
// from the Tauri asset protocol.

/** True when Vite is running under the Tauri CLI (`tauri dev` / `tauri build`). */
const underTauri = process.env.TAURI_ENV_PLATFORM !== undefined;

/**
 * Injects the Content Security Policy.
 *
 * The desktop policy is the strict one, and it is also declared in
 * `src-tauri/tauri.conf.json`. The browser development build additionally needs
 * `'wasm-unsafe-eval'`, because it runs SQLite compiled to WebAssembly; the
 * packaged desktop build uses a real SQLite file and never receives it.
 */
function contentSecurityPolicy(): Plugin {
  const scriptSrc = underTauri ? "'self'" : "'self' 'wasm-unsafe-eval'";
  const policy = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob: asset: http://asset.localhost",
    "media-src 'self' data: blob: asset: http://asset.localhost",
    "connect-src 'self' ipc: http://ipc.localhost ws://127.0.0.1:1420",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');

  return {
    name: 'scribble-csp',
    // Production only. The development server injects React's Fast Refresh
    // preamble inline, which a policy this strict would block; `tauri dev` uses
    // the separate `devCsp` declared in `src-tauri/tauri.conf.json`.
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: '127.0.0.1',
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'chrome110',
    sourcemap: true,
    outDir: 'dist',
  },
});
