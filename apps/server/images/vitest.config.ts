import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const serviceDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  oxc: false, // Disable OXC transformer — SWC required for NestJS decorator metadata
  plugins: [
    swc.vite({
      jsc: {
        parser: { decorators: true, syntax: 'typescript' },
        transform: { decoratorMetadata: true, legacyDecorator: true },
      },
      module: { type: 'es6' },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(serviceDir, './src'),
      '@genfeedai/config': path.resolve(
        serviceDir,
        '../../../packages/config/src/index.ts',
      ),
      '@genfeedai/enums': path.resolve(
        serviceDir,
        '../../../packages/enums/src/index.ts',
      ),
      '@genfeedai/pricing': path.resolve(
        serviceDir,
        '../../../packages/pricing/src/index.ts',
      ),
      '@genfeedai/storage': path.resolve(
        serviceDir,
        '../../../packages/storage/src/index.ts',
      ),
      '@genfeedai/types': path.resolve(
        serviceDir,
        '../../../packages/types/src/index.ts',
      ),
      '@genfeedai/workflows/generation/comfyui': path.resolve(
        serviceDir,
        '../../../packages/workflows/src/generation/comfyui/index.ts',
      ),
      '@genfeedai/workflows': path.resolve(
        serviceDir,
        '../../../packages/workflows/src/index.ts',
      ),
      '@config': path.resolve(serviceDir, './src/config'),
      '@images': path.resolve(serviceDir, './src'),
      '@libs': path.resolve(serviceDir, '../../../packages/libs'),
      '@services': path.resolve(serviceDir, './src/services'),
      '@shared': path.resolve(serviceDir, './src/shared'),
    },
  },
  test: {
    coverage: {
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.e2e-spec.ts',
        'src/**/test/**',
        'src/**/*.d.ts',
        'src/**/index.ts',
        'src/**/*.module.ts',
        'src/main.ts',
        'src/instrument.ts',
      ],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      thresholds: { branches: 0, functions: 0, lines: 0, statements: 0 },
    },
    environment: 'node',
    globals: true,
    include: ['src/**/*.spec.ts'],
    passWithNoTests: true,
    testTimeout: 30000,
  },
});
