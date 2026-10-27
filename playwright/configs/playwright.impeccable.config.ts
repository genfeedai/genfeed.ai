import baseConfig from './playwright.config';

export default {
  ...baseConfig,
  projects: (baseConfig.projects ?? [])
    .filter((p) => p.name === 'app-core')
    .map((p) => ({
      ...p,
      testIgnore: [/marketplace\/.+\.spec\.ts/, /website\/.+\.spec\.ts/, /\.authed\.spec\.ts/],
      use: {
        ...p.use,
        video: 'off',
        trace: 'off',
        launchOptions: { executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox', '--disable-web-security', '--remote-debugging-port=9333'] },
      },
    })),
  use: { ...(baseConfig.use ?? {}), video: 'off', trace: 'off', screenshot: 'off' },
  reporter: [['list']],
  fullyParallel: false,
  workers: 1,
};
