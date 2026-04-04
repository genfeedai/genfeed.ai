import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    comfyui: 'src/comfyui/index.ts',
    index: 'src/index.ts',
    nodes: 'src/nodes/index.ts',
    replicate: 'src/replicate/index.ts',
    workflow: 'src/workflow.ts',
  },
  external: ['@xyflow/react'],
  format: ['esm', 'cjs'],
  sourcemap: true,
  splitting: true,
  treeshake: true,
});
