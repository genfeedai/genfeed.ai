import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: [
    'src/index.ts',
    'src/contracts/index.ts',
    'src/engine/index.ts',
    'src/generation/index.ts',
    'src/generation/comfyui/index.ts',
    'src/nodes/index.ts',
  ],
  format: ['esm'],
  sourcemap: true,
});
