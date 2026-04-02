import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  outDir: 'dist',
  splitting: false,
  clean: true,
  target: 'es2020',
  /** Root tsconfig may use `incremental`; tsup's DTS step requires incremental off (TS5074). */
  tsconfig: 'tsconfig.build.json',
});
