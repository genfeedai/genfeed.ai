import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    canvas: 'src/canvas/index.ts',
    hooks: 'src/hooks/index.ts',
    index: 'src/index.ts',
    lib: 'src/lib/index.ts',
    nodes: 'src/nodes/index.ts',
    panels: 'src/panels/index.ts',
    provider: 'src/provider/index.ts',
    stores: 'src/stores/index.ts',
    toolbar: 'src/toolbar/index.ts',
    ui: 'src/ui/index.ts',
  },
  esbuildOptions(options) {
    options.banner = {
      js: '"use client";',
    };
  },
  external: [
    'react',
    'react-dom',
    '@xyflow/react',
    'zustand',
    'zundo',
    'next',
    'next/image',
    '@genfeedai/core',
    '@genfeedai/types',
  ],
  format: ['esm'],
  jsx: 'automatic',
  noExternal: ['react-compare-slider'],
  outExtension: () => ({ js: '.mjs' }),
  sourcemap: true,
  splitting: true,
  treeshake: true,
  tsconfig: 'tsconfig.build.json',
});
