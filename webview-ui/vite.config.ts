import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const REACT_PACKAGES = [
  'react',
  'react-dom',
  'scheduler',
  'use-sync-external-store',
  'zustand',
  '@tanstack/react-virtual',
  '@tanstack/virtual-core',
];

const MARKDOWN_PACKAGES = [
  'dompurify',
  'katex',
  'marked',
  'marked-katex-extension',
  'marked-shiki',
  'morphdom',
];

const SHIKI_CORE_PACKAGES = [
  'shiki',
  '@shikijs/core',
  '@shikijs/engine-javascript',
  '@shikijs/engine-oniguruma',
  '@shikijs/primitive',
  '@shikijs/themes',
  '@shikijs/types',
  '@shikijs/vscode-textmate',
];

function normalizeModuleId(id: string): string {
  return id.replace(/\\/g, '/');
}

function isPackageModule(id: string, packageName: string): boolean {
  return id.includes(`/node_modules/${packageName}/`);
}

function getManualChunk(id: string): string | undefined {
  const normalizedId = normalizeModuleId(id);
  if (!normalizedId.includes('/node_modules/')) {
    return undefined;
  }

  const shikiLangMatch = normalizedId.match(/\/node_modules\/@shikijs\/langs\/dist\/([^/]+)\.mjs$/);
  if (shikiLangMatch && shikiLangMatch[1] !== 'index') {
    return `shiki-lang-${shikiLangMatch[1]}`;
  }

  if (
    isPackageModule(normalizedId, '@shikijs/langs')
    || SHIKI_CORE_PACKAGES.some((packageName) => isPackageModule(normalizedId, packageName))
  ) {
    return 'vendor-shiki';
  }

  if (REACT_PACKAGES.some((packageName) => isPackageModule(normalizedId, packageName))) {
    return 'vendor-react';
  }

  if (MARKDOWN_PACKAGES.some((packageName) => isPackageModule(normalizedId, packageName))) {
    return 'vendor-markdown';
  }

  return 'vendor';
}

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../out/webview',
    emptyOutDir: true,
    // Inject CSS into JS bundles so the extension only needs to load a single script
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        chat: resolve(__dirname, 'src/panels/chat/index.html'),
        settings: resolve(__dirname, 'src/panels/settings/index.html'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks: getManualChunk,
      },
    },
    sourcemap: true,
    minify: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
