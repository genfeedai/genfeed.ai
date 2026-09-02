import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@genfeedai\/constants$/,
        replacement: path.resolve(__dirname, '../contracts/src/constants/index.ts'),
      },
      {
        find: /^@genfeedai\/constants\/(.*)$/,
        replacement: path.resolve(__dirname, '../contracts/src/constants/$1'),
      },
      {
        find: /^@genfeedai\/enums$/,
        replacement: path.resolve(__dirname, '../contracts/src/index.ts'),
      },
      {
        find: /^@genfeedai\/enums\/(.*)$/,
        replacement: path.resolve(__dirname, '../contracts/src/enums/$1'),
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
        replacement: path.resolve(__dirname, '../contracts/src/interfaces/$1'),
      },
      {
        find: /^@genfeedai\/pricing$/,
        replacement: path.resolve(__dirname, '../pricing/src/index.ts'),
      },
      {
        find: /^@genfeedai\/serializers$/,
        replacement: path.resolve(__dirname, '../helpers/src/deserializer/index.ts'),
      },
      {
        find: /^@genfeedai\/actions$/,
        replacement: path.resolve(__dirname, '../actions/src/index.ts'),
      },
      {
        find: '@',
        replacement: path.resolve(__dirname, './src'),
      },
    ],
  },
  test: {
    coverage: {
      exclude: ['src/index.ts', 'src/commands/**/*.ts', 'src/utils/helpers.ts'],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: { branches: 91, functions: 98, lines: 97, statements: 96 },
    },
    environment: 'node',
    exclude: ['tests/integration/**/*.test.ts'],
    globals: true,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
  },
});
