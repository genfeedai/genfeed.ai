import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import type {
  IDesktopRuntimeContext,
  IGenfeedDesktopBridge,
} from '@genfeedai/contracts/desktop';
import {
  _electron,
  type ElectronApplication,
  expect,
  test,
} from '@playwright/test';
import { createAuthenticatedPage } from '../../fixtures/auth.fixture';
import { buildUnhandledApiMockBody } from '../../utils/api-interceptor';
import {
  assertNoErrorBoundaryFallback,
  expectNoErrorOverlay,
} from '../../utils/route-assertions';

const desktopRoot = path.resolve(__dirname, '../../../../apps/desktop/app');
type Control = 'start' | 'defer' | 'confirm' | 'cancel' | 'fail-mode-rename';
interface AcceptanceAudit {
  dialogCalls: number;
  relaunchCalls: number;
  nodeRequests: string[];
  blocked: string[];
  savedMode: string;
}
interface AcceptanceBoundary {
  __genfeedRuntimeAcceptance: {
    control: (action: Control) => void;
    read: () => AcceptanceAudit;
  };
}
type AcceptanceMain = typeof globalThis & AcceptanceBoundary;
type AcceptanceWindow = Window & {
  genfeedDesktop: IGenfeedDesktopBridge;
  runtimeEvents: IDesktopRuntimeContext[];
  selectionResult?: Promise<string>;
};
async function control(electron: ElectronApplication, action: Control) {
  await electron.evaluate(
    (_electron, action) =>
      (globalThis as AcceptanceMain).__genfeedRuntimeAcceptance.control(action),
    action,
  );
}
async function audit(electron: ElectronApplication) {
  return electron.evaluate(() =>
    (globalThis as AcceptanceMain).__genfeedRuntimeAcceptance.read(),
  );
}

// `cloud` runs the shipped cloud-only build; the local scenarios force local
// mode on through the launcher's test-only override (see
// isDesktopLocalModeEnabled in @genfeedai/contracts/desktop).
for (const failure of ['cloud', 'rename', 'relaunch'] as const) {
  test(`actual Electron runtime IPC and ${failure} ${failure === 'cloud' ? 'refusal of local mode' : 'recovery'}`, async ({
    baseURL,
  }, testInfo) => {
    if (!baseURL) throw new Error('The isolated shell URL is required.');
    const data = fs.mkdtempSync(
      path.join(os.tmpdir(), 'genfeed-runtime-electron-'),
    );
    const apiRequests: string[] = [];
    const api = http.createServer((request, response) => {
      const pathname = new URL(request.url || '/', baseURL).pathname;
      apiRequests.push(pathname);
      response.setHeader('Content-Type', 'application/json');
      if (pathname.endsWith('/auth/whoami'))
        response.end(
          JSON.stringify({
            data: {
              user: {
                id: 'mock-user-id-e2e-test',
                email: 'fixture@invalid.test',
                name: 'Fixture',
              },
            },
          }),
        );
      else if (pathname.endsWith('/health'))
        response.end(JSON.stringify({ status: 'ok' }));
      else {
        response.statusCode = 403;
        response.end('{}');
      }
    });
    await new Promise<void>((resolve, reject) => {
      api.once('error', reject);
      api.listen(57162, '127.0.0.1', resolve);
    });
    const address = api.address();
    if (!address || typeof address === 'string')
      throw new Error('Fixture API did not bind.');
    const apiURL = `http://127.0.0.1:${address.port}`;
    let electron: ElectronApplication | undefined;
    try {
      const requireDesktop = createRequire(
        path.join(desktopRoot, 'package.json'),
      );
      const executablePath = requireDesktop('electron') as string;
      electron = await _electron.launch({
        executablePath,
        args: [
          path.join(desktopRoot, 'scripts/runtime-acceptance-launcher.cjs'),
        ],
        cwd: desktopRoot,
        env: {
          PATH: process.env.PATH || '',
          ELECTRON_RUN_AS_NODE: '',
          GENFEED_RUNTIME_ACCEPTANCE_DATA: data,
          GENFEED_RUNTIME_ACCEPTANCE_API: apiURL,
          GENFEED_DESKTOP_APP_URL: baseURL,
          GENFEED_DESKTOP_APP_PORT: new URL(baseURL).port,
          GENFEED_DESKTOP_CDN_URL: apiURL,
          GENFEED_DESKTOP_SENTRY_DSN: '',
          ...(failure === 'cloud'
            ? {}
            : { GENFEED_RUNTIME_ACCEPTANCE_LOCAL_MODE: '1' }),
        },
      });
      const activeElectron = electron;
      const context = electron.context();
      let walletRequests = 0;
      const pageErrors: string[] = [];
      context.on('request', (request) => {
        if (
          new URL(request.url()).pathname.endsWith('/credits/topbar-balances')
        )
          walletRequests++;
      });
      context.on('page', (page) =>
        page.on('pageerror', (error) => pageErrors.push(error.message)),
      );
      await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== baseURL && url.origin !== apiURL)
          return route.abort();
        if (url.pathname.startsWith('/v1/'))
          return route.fulfill({ json: buildUnhandledApiMockBody(url.href) });
        await route.continue();
      });
      if (failure !== 'cloud')
        await context.addInitScript(() => {
          (globalThis as { [key: symbol]: unknown })[
            Symbol.for('genfeed.desktop.localModeTestOverride')
          ] = true;
        });
      await context.addCookies([
        { name: '__playwright_test', value: 'true', url: baseURL },
        {
          name: '__playwright_workspace',
          value: '/test-org/brand-1',
          url: baseURL,
        },
      ]);
      await control(electron, 'start');
      const page = await electron.firstWindow();
      await expect.poll(() => page.url()).toContain(baseURL);
      // Electron pages have no Playwright baseURL, so navigations must be absolute.
      await createAuthenticatedPage(
        page,
        context,
        {},
        new URL('/workspace', baseURL).href,
      );
      const initial = await page.evaluate(() =>
        (window as AcceptanceWindow).genfeedDesktop.app.getRuntimeContext(),
      );
      expect(initial).toMatchObject({
        status: 'ready',
        runtimeMode: 'cloud',
        selectedServerKind: 'cloud',
        generationExecution: 'remote',
      });
      expect(initial.localProvider).toBeNull();
      await page.evaluate(() => {
        const target = window as AcceptanceWindow;
        target.runtimeEvents = [];
        target.genfeedDesktop.app.onDidChangeRuntimeContext((value) =>
          target.runtimeEvents.push(value),
        );
      });
      await page.route('**/v1/credits/topbar-balances**', (route) =>
        route.fulfill({
          json: {
            data: {
              id: 'topbar-balances',
              type: 'topbar-balances',
              attributes: {
                segments: [
                  {
                    provider: 'genfeed',
                    balance: 500,
                    status: 'available',
                    label: 'Genfeed',
                    currencyOrUnit: 'credits',
                  },
                ],
              },
            },
          },
        }),
      );
      await page.goto(
        new URL('/test-org/brand-1/studio/generate', baseURL).href,
      );
      await expect(page.getByTestId('topbar-credits-trigger')).toContainText(
        '500',
      );
      await page.screenshot({
        path: testInfo.outputPath(`electron-${failure}-cloud.png`),
        fullPage: true,
      });
      if (failure === 'cloud') {
        const refusal = await page.evaluate(() =>
          (window as AcceptanceWindow).genfeedDesktop.app
            .enableOfflineMode()
            .then(
              () => 'unexpected success',
              (error: Error) => error.message,
            ),
        );
        expect(refusal).toContain('Local mode is not available');
        const stillCloud = await page.evaluate(() =>
          (window as AcceptanceWindow).genfeedDesktop.app.getRuntimeContext(),
        );
        expect(stillCloud).toMatchObject({
          status: 'ready',
          runtimeMode: 'cloud',
        });
        expect((await audit(electron)).savedMode).toBe('cloud');
        expect(pageErrors).toEqual([]);
        return;
      }
      await page.evaluate(async () => {
        const bridge = (window as AcceptanceWindow).genfeedDesktop;
        await bridge.app.enableOfflineMode();
        await bridge.generation.saveProviderConfig({
          provider: 'ollama',
          baseUrl: 'http://127.0.0.1:11434',
          model: 'fixture',
        });
      });
      const local = await page.evaluate(() =>
        (window as AcceptanceWindow).genfeedDesktop.app.getRuntimeContext(),
      );
      expect(local).toMatchObject({
        status: 'ready',
        runtimeMode: 'local',
        generationExecution: 'local-byok',
        localProvider: { provider: 'ollama', networkAccess: 'local' },
      });
      await page.route('**/v1/public/platform-flags**', (route) =>
        route.fulfill({ json: { desktop_local_workspace: true } }),
      );
      await page.goto(new URL('/desktop/local', baseURL).href);
      await expect(
        page.getByTestId('desktop-local-generation-cost'),
      ).toHaveText('Local generation · no Genfeed credits');
      await expect(
        page.getByTestId('desktop-provider-generation-cost'),
      ).toHaveText('Local generation · no Genfeed credits');
      await page.screenshot({
        path: testInfo.outputPath(`electron-${failure}-local.png`),
        fullPage: true,
      });
      await page.goto(
        new URL('/test-org/brand-1/studio/generate', baseURL).href,
      );
      await expect(page.getByTestId('topbar-credits-trigger')).toHaveCount(0);
      const walletBeforeRecovery = walletRequests;
      await control(electron, 'defer');
      await page.evaluate((apiURL) => {
        const target = window as AcceptanceWindow;
        target.runtimeEvents = [];
        target.genfeedDesktop.app.onDidChangeRuntimeContext((value) =>
          target.runtimeEvents.push(value),
        );
        target.selectionResult = target.genfeedDesktop.server
          .select({
            kind: 'self-hosted',
            selfHosted: { apiEndpoint: `${apiURL}/v1` },
          })
          .then(
            () => 'unexpected success',
            (error: Error) => error.message,
          );
      }, apiURL);
      await expect
        .poll(async () => (await audit(activeElectron)).dialogCalls)
        .toBe(1);
      const overlap = await page.evaluate(() =>
        (window as AcceptanceWindow).genfeedDesktop.server
          .select({ kind: 'cloud' })
          .then(
            () => 'unexpected success',
            (error: Error) => error.message,
          ),
      );
      expect(overlap).toContain('already pending');
      if (failure === 'rename') await control(electron, 'fail-mode-rename');
      const transitionError = await page.evaluate(() =>
        (window as AcceptanceWindow).genfeedDesktop.app
          .switchToCloudMode()
          .then(
            () => 'unexpected success',
            (error: Error) => error.message,
          ),
      );
      expect(transitionError).toContain(
        failure === 'rename' ? 'persistence failure' : 'relaunch failure',
      );
      await control(electron, 'confirm');
      const selectionError = await page.evaluate(
        () => (window as AcceptanceWindow).selectionResult,
      );
      expect(selectionError).toContain(
        failure === 'rename' ? 'Restart Genfeed Desktop' : 'switching servers',
      );
      const recovered = await page.evaluate(() =>
        (window as AcceptanceWindow).genfeedDesktop.app.getRuntimeContext(),
      );
      expect(recovered).toMatchObject({
        status: failure === 'rename' ? 'unavailable' : 'switching',
        runtimeMode: failure === 'rename' ? 'local' : 'cloud',
        generationExecution: 'unknown',
      });
      expect(recovered.runtimeId).toBe(initial.runtimeId);
      expect(recovered.revision).toBeGreaterThan(local.revision);
      expect(recovered.localProvider).toEqual(
        failure === 'rename' ? local.localProvider : null,
      );
      const blocked = await page.evaluate(async () => {
        const bridge = (window as AcceptanceWindow).genfeedDesktop;
        const operations = [
          () => bridge.app.enableOfflineMode(),
          () => bridge.app.switchToCloudMode(),
          () => bridge.server.select({ kind: 'cloud' }),
          () => bridge.generation.getProviderConfig(),
          () =>
            bridge.cloud.generateContent({
              platform: 'linkedin',
              prompt: 'Blocked fixture',
              publishIntent: 'draft',
              type: 'caption',
            }),
        ];
        return Promise.all(
          operations.map((operation) =>
            operation().then(
              () => 'unexpected success',
              (error: Error) => error.message,
            ),
          ),
        );
      });
      for (const message of blocked)
        expect(message).toContain(
          failure === 'rename'
            ? 'Restart Genfeed Desktop'
            : 'switching servers',
        );
      await expect(page.getByTestId('topbar-credits-trigger')).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Generate', exact: true }),
      ).toBeDisabled();
      expect(walletRequests).toBe(walletBeforeRecovery);
      const events = await page.evaluate(
        () => (window as AcceptanceWindow).runtimeEvents,
      );
      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(
        events.every(
          (value, index) =>
            index === 0 || value.revision > events[index - 1].revision,
        ),
      ).toBe(true);
      const receipt = await audit(electron);
      expect(receipt.dialogCalls).toBe(1);
      expect(receipt.savedMode).toBe(failure === 'rename' ? 'local' : 'cloud');
      expect(apiRequests.every((value) => value.endsWith('/auth/whoami'))).toBe(
        true,
      );
      expect(pageErrors).toEqual([]);
      await expectNoErrorOverlay(page);
      await assertNoErrorBoundaryFallback(page, page.url());
      await page.screenshot({
        path: testInfo.outputPath(`electron-${failure}-recovery.png`),
        fullPage: true,
      });
      fs.writeFileSync(
        testInfo.outputPath(`electron-${failure}-receipt.json`),
        JSON.stringify(
          {
            initial,
            local,
            recovered,
            events,
            receipt,
            apiRequests,
            walletRequests,
          },
          null,
          2,
        ),
      );
    } finally {
      if (electron) await electron.close();
      await new Promise<void>((resolve) => api.close(() => resolve()));
      // Preserve the task's temporary data directory for recovery inspection.
    }
  });
}
