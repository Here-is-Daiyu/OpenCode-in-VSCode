import * as esbuild from 'esbuild';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  absWorkingDir: ROOT_DIR,
  entryPoints: [resolve(ROOT_DIR, 'src/extension.ts')],
  bundle: true,
  outfile: resolve(ROOT_DIR, 'out/extension.js'),
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: !production,
  minify: production,
  treeShaking: true,
  logLevel: 'info',
};

async function main() {
  if (watch) {
    const ctx = await esbuild.context(extensionConfig);
    await ctx.watch();
    console.log('[esbuild] Watching for changes...');
  } else {
    await esbuild.build(extensionConfig);
    console.log('[esbuild] Build complete.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
