import path from 'node:path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

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
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: '@config', replacement: path.resolve(__dirname, './src/config') },
      {
        find: '@controllers',
        replacement: path.resolve(__dirname, './src/controllers'),
      },
      { find: '@files', replacement: path.resolve(__dirname, './src') },
      {
        find: '@genfeedai/config',
        replacement: path.resolve(__dirname, '../../../packages/config/src'),
      },
      {
        find: '@genfeedai/storage',
        replacement: path.resolve(__dirname, '../../../packages/storage/src'),
      },
      {
        find: /^@genfeedai\/config\/(.*)$/,
        replacement: path.resolve(__dirname, '../../../packages/config/src/$1'),
      },
      {
        find: '@libs',
        replacement: path.resolve(__dirname, '../../../packages/libs'),
      },
      {
        find: '@processors',
        replacement: path.resolve(__dirname, './src/processors'),
      },
      { find: '@queues', replacement: path.resolve(__dirname, './src/queues') },
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
      'src/controllers/controllers.module.spec.ts',
      'src/controllers/files.controller.spec.ts',
      'src/processors/processors.module.spec.ts',
      'src/processors/video.processor.spec.ts',
      'src/services/services.module.spec.ts',
      'src/services/ffmpeg/ffmpeg.module.spec.ts',
      'src/services/ffmpeg/services/ffmpeg.service.spec.ts',
      'src/services/ffmpeg/config/binary-validation.service.spec.ts',
      'src/services/ffmpeg/stream/ffmpeg-stream.service.spec.ts',
      'src/services/ffmpeg/performances/ffmpeg-performance.service.spec.ts',
      'src/services/files/files.module.spec.ts',
      'src/services/files/files.service.spec.ts',
      'src/services/files/blur/files-portrait-blur.service.spec.ts',
      'src/services/files/split/files-split-screen.service.spec.ts',
      'src/services/files/captions/files-captions.service.spec.ts',
      'src/services/files/gif/files-gif.service.spec.ts',
      'src/services/files/ken-burns/files-ken-burns-effect.service.spec.ts',
      'src/services/files/image-to-video/files-image-to-video.service.spec.ts',
      'src/services/images/images-split.service.spec.ts',
      'src/services/thumbnails/video-thumbnail.service.spec.ts',
      'src/services/upload/upload.service.spec.ts',
      'src/services/youtube/youtube.service.spec.ts',
      'src/services/s3/s3.service.spec.ts',
      'src/services/ytdlp/ytdlp.service.spec.ts',
      'src/queues/youtube-queue.service.spec.ts',
      'src/queues/task-queue.service.spec.ts',
      'src/shared/shared.module.spec.ts',
    ],
    globals: true,
    include: ['src/**/*.spec.ts'],
    passWithNoTests: true,
    setupFiles: ['./test/setup-unit.ts'],
    testTimeout: 30000,
  },
});
