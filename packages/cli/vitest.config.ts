import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@genfeedai\/constants$/,
        replacement: path.resolve(__dirname, '../constants/src/index.ts'),
      },
      {
        find: /^@genfeedai\/constants\/(.*)$/,
        replacement: path.resolve(__dirname, '../constants/src/$1'),
      },
      {
        find: /^@genfeedai\/enums$/,
        replacement: path.resolve(__dirname, '../enums/src/index.ts'),
      },
      {
        find: /^@genfeedai\/enums\/(.*)$/,
        replacement: path.resolve(__dirname, '../enums/src/$1'),
      },
      {
        find: /^@genfeedai\/errors$/,
        replacement: path.resolve(__dirname, '../errors/src/index.ts'),
      },
      {
        find: /^@genfeedai\/helpers$/,
        replacement: path.resolve(__dirname, '../helpers/src/index.ts'),
      },
      {
        find: /^@genfeedai\/helpers\/(.*)$/,
        replacement: path.resolve(__dirname, '../helpers/src/$1'),
      },
      {
        find: /^@genfeedai\/interfaces\/(.*)$/,
        replacement: path.resolve(__dirname, '../interfaces/src/$1'),
      },
      {
        find: /^@genfeedai\/serializers$/,
        replacement: path.resolve(__dirname, '../helpers/src/deserializer/index.ts'),
      },
      {
        find: /^@genfeedai\/tools$/,
        replacement: path.resolve(__dirname, '../tools/src/index.ts'),
      },
      {
        find: '@',
        replacement: path.resolve(__dirname, './src'),
      },
    ],
  },
  test: {
    coverage: {
      exclude: [
        'src/index.ts',
        'src/commands/**/*.ts',
        'src/api/darkroom-api.ts',
        'src/middleware/**/*.ts',
        'src/scripts/**/*.ts',
        'src/utils/helpers.ts',
      ],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        branches: 60,
        functions: 70,
        lines: 70,
        statements: 70,
      },
    },
    environment: 'node',
    exclude: ['tests/integration/**/*.test.ts'],
    globals: true,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
  },
});
