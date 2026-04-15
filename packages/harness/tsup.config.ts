import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    contracts: 'src/contracts/index.ts',
    index: 'src/index.ts',
  },
  format: ['esm', 'cjs'],
  sourcemap: true,
  splitting: true,
  treeshake: true,
  tsconfig: 'tsconfig.build.json',
});
