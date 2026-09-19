import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'
import { builtinModules } from 'node:module'
import { resolve } from 'node:path'

/**
 * A packaged app ships `dist/` inside an ASAR archive with no node_modules
 * beside it, so anything left as a bare import resolves at build time and fails
 * at runtime. Only Electron itself and Node's builtins exist there.
 *
 * `@projectspace/core` is a devDependency rather than a dependency for exactly
 * this reason: Vite externalizes runtime dependencies for the main and preload
 * builds, and the workspace library has to be bundled in instead.
 */
const RUNTIME_PROVIDED = new Set([
  'electron',
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
])

const isRuntimeProvided = (id: string): boolean =>
  RUNTIME_PROVIDED.has(id) || id.startsWith('node:')

export default defineConfig({
  main: {
    build: {
      outDir: 'dist/main',
      lib: { entry: resolve(__dirname, 'src/main/index.ts'), formats: ['es'] },
      rollupOptions: {
        external: isRuntimeProvided,
        output: { entryFileNames: 'index.js' },
      },
    },
  },
  preload: {
    build: {
      outDir: 'dist/preload',
      // A sandboxed preload cannot be an ES module, so this one stays CommonJS.
      lib: { entry: resolve(__dirname, 'src/preload/index.ts'), formats: ['cjs'] },
      rollupOptions: {
        external: isRuntimeProvided,
        output: { entryFileNames: 'index.cjs' },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    build: {
      outDir: resolve(__dirname, 'dist/renderer'),
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') },
    },
  },
})
