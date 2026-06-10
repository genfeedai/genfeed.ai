import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    index: 'src/index.ts',
    'topological-sort': 'src/topological-sort.ts',
    validation: 'src/validation.ts',
  },
  external: ['@genfeedai/pricing', '@genfeedai/types'],
  format: ['esm'],
  sourcemap: true,
  splitting: true,
  treeshake: true,
});
