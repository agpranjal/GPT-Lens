// Rollup's IIFE format can't do a single multi-entry build (no code-splitting
// support), and these three scripts must each be a fully self-contained
// classic script anyway (service worker / executeScript-injected / content
// script all reject ES module imports by default). So: one lib-mode build
// per entry, all writing into the same dist/.
import { build } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import { cpSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const entries = ['background', 'extract', 'bridge']

for (const [i, name] of entries.entries()) {
  await build({
    build: {
      outDir: 'dist',
      emptyOutDir: i === 0,
      lib: {
        entry: path.resolve(__dirname, `src/${name}.js`),
        name: `GptLens${name}`,
        formats: ['iife'],
        fileName: () => `${name}.js`,
      },
      rollupOptions: {
        output: { inlineDynamicImports: true },
      },
    },
  })
}

cpSync(path.resolve(__dirname, 'manifest.json'), path.resolve(__dirname, 'dist/manifest.json'))
cpSync(path.resolve(__dirname, 'icons'), path.resolve(__dirname, 'dist/icons'), { recursive: true })
