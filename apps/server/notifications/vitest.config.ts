import path from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
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
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: '@config', replacement: path.resolve(__dirname, './src/config') },
      {
        find: '@genfeedai/constants',
        replacement: path.resolve(
          __dirname,
          '../../../packages/constants/src/index.ts',
        ),
      },
      {
        find: '@genfeedai/enums',
        replacement: path.resolve(
          __dirname,
          '../../../packages/enums/src/index.ts',
        ),
      },
      {
        find: '@controllers',
        replacement: path.resolve(__dirname, './src/controllers'),
      },
      {
        find: '@genfeedai/config',
        replacement: path.resolve(__dirname, '../../../packages/config/src'),
      },
      {
        find: /^@genfeedai\/config\/(.*)$/,
        replacement: path.resolve(__dirname, '../../../packages/config/src/$1'),
      },
      {
        find: '@helpers',
        replacement: path.resolve(__dirname, '../../../packages/helpers/src'),
      },
      {
        find: /^@helpers\/(.*)$/,
        replacement: path.resolve(
          __dirname,
          '../../../packages/helpers/src/$1',
        ),
      },
      {
        find: '@libs',
        replacement: path.resolve(__dirname, '../../../packages/libs'),
      },
      { find: '@notifications', replacement: path.resolve(__dirname, './src') },
      {
        find: '@services',
        replacement: path.resolve(__dirname, './src/services'),
      },
      { find: '@shared', replacement: path.resolve(__dirname, './src/shared') },
    ],
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
    exclude: [
      'src/config/config.module.spec.ts',
      'src/config/config.service.spec.ts',
      'src/controllers/dev.controller.spec.ts',
      'src/services/notification-handler.service.spec.ts',
      'src/services/discord/discord.module.spec.ts',
      'src/services/discord/discord.service.spec.ts',
      'src/services/discord/discord-bot.service.spec.ts',
      'src/services/telegram/telegram.api.service.spec.ts',
      'src/services/telegram/telegram.module.spec.ts',
      'src/services/telegram/telegram.service.spec.ts',
      'src/services/chatbot/chatbot.module.spec.ts',
      'src/services/genfeed/genfeed.module.spec.ts',
      'src/services/resend/resend.module.spec.ts',
      'src/shared/shared.module.spec.ts',
    ],
    globals: true,
    include: ['src/**/*.spec.ts'],
    passWithNoTests: true,
    setupFiles: ['./test/setup-unit.ts'],
    testTimeout: 30000,
  },
});
