const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'info',
    plugins: [
      {
        name: 'copy-wasm',
        setup(build) {
          build.onEnd(() => {
            const wasmSource = path.resolve(__dirname, 'node_modules/sql.js/dist/sql-wasm.wasm');
            const wasmDest = path.resolve(__dirname, 'dist/sql-wasm.wasm');
            if (fs.existsSync(wasmSource)) {
              if (!fs.existsSync(path.resolve(__dirname, 'dist'))) {
                fs.mkdirSync(path.resolve(__dirname, 'dist'), { recursive: true });
              }
              fs.copyFileSync(wasmSource, wasmDest);
              console.log('Copied sql-wasm.wasm to dist/');
            }

            const codiconsDir = path.resolve(__dirname, 'node_modules/@vscode/codicons/dist');
            const destCodiconsDir = path.resolve(__dirname, 'dist/codicons');
            if (fs.existsSync(codiconsDir)) {
              if (!fs.existsSync(destCodiconsDir)) {
                fs.mkdirSync(destCodiconsDir, { recursive: true });
              }
              fs.copyFileSync(path.join(codiconsDir, 'codicon.css'), path.join(destCodiconsDir, 'codicon.css'));
              fs.copyFileSync(path.join(codiconsDir, 'codicon.ttf'), path.join(destCodiconsDir, 'codicon.ttf'));
              console.log('Copied codicons to dist/codicons/');
            }
          });
        }
      }
    ]
  });

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
