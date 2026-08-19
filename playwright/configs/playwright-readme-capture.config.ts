import path from 'node:path';
import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

/**
 * Mocked README asset capture. Not part of CI e2e — invoke via
 * `bun run readme:capture`. Reuses app-core webServer + auth bypass.
 */
const repoRoot = process.cwd();

const captureWebServerCommand =
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: not a turbo task
  process.env.PLAYWRIGHT_APP_COMMAND ||
  'bun run --cwd apps/app dev:debug -- --hostname ::';

function withDebugAppCommand(
  webServer: typeof baseConfig.webServer,
): typeof baseConfig.webServer {
  if (!webServer) {
    return webServer;
  }

  const servers = Array.isArray(webServer) ? webServer : [webServer];
  return servers.map((server) => ({
    ...server,
    command: captureWebServerCommand,
  }));
}

export default defineConfig({
  ...baseConfig,
  fullyParallel: false,
  globalTeardown: undefined,
  projects: baseConfig.projects?.filter(
    (project) => project.name === 'app-core',
  ),
  reporter: [['list']],
  retries: 0,
  testDir: path.join(repoRoot, 'playwright/e2e/readme'),
  testIgnore: [],
  testMatch: /capture-readme-assets\.spec\.ts/,
  timeout: 300_000,
  webServer: withDebugAppCommand(baseConfig.webServer),
  use: {
    ...baseConfig.use,
    colorScheme: 'dark',
    deviceScaleFactor: 1,
    screenshot: 'off',
    trace: 'off',
    video: 'off',
    viewport: { height: 900, width: 1440 },
  },
  workers: 1,
});
