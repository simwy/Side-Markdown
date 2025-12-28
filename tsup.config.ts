import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['electron/main.ts', 'electron/preload.ts'],
  format: ['cjs'],
  target: 'es2022',
  outDir: 'dist-electron',
  sourcemap: true,
  clean: true,
  dts: false,
  splitting: false,
  outExtension() {
    return { js: '.cjs' }
  },
  external: ['electron']
})


