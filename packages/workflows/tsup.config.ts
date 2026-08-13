import { defineConfig } from 'tsup';

/**
 * Server/runtime JS only. Do not add `dts` here — rollup-plugin-dts forks a
 * TypeScript worker that OOMs this package on a 7 GB runner. Declarations
 * come from `tsc --emitDeclarationOnly` (`build:types`).
 *
 * Do not add the UI entries. The app compiles `src/ui` via Next aliases.
 * Docker already called this surface `build:server`.
 */
export default defineConfig({
  bundle: true,
  clean: true,
  entry: [
    'src/index.ts',
    'src/contracts/index.ts',
    'src/engine/index.ts',
    'src/generation/index.ts',
    'src/generation/comfyui/index.ts',
    'src/nodes/index.ts',
  ],
  format: ['esm'],
  sourcemap: false,
});
