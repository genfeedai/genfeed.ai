import path from 'node:path';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: path.resolve(import.meta.dirname, '../e2e/tests/desktop'),
  testMatch: 'desktop-runtime-electron.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  outputDir: path.resolve(import.meta.dirname, '../artifacts/electron-runtime'),
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:57161' },
});
