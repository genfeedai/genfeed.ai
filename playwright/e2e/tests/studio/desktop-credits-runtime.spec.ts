import { RouterPriority } from '@genfeedai/contracts';
import { APP_ROUTES, MODEL_KEYS } from '@genfeedai/contracts/constants';
import type {
  IDesktopRuntimeContext,
  IGenfeedDesktopBridge,
} from '@genfeedai/contracts/desktop';
import type { BrowserContext, Page } from '@playwright/test';
import { test as authenticatedTest, expect } from '../../fixtures/auth.fixture';
import { buildProtectedAppBootstrapPayload } from '../../utils/api-interceptor';
import { brandPath } from '../../utils/app-chrome';
import {
  assertNoErrorBoundaryFallback,
  expectNoErrorOverlay,
} from '../../utils/route-assertions';

const cloud: IDesktopRuntimeContext = {
  version: 1,
  runtimeId: 'desktop-acceptance',
  revision: 0,
  status: 'ready',
  selectedServerId: 'cloud-a',
  selectedServerKind: 'cloud',
  selectedApiEndpoint: 'https://api.genfeed.ai/v1',
  runtimeMode: 'cloud',
  generationExecution: 'remote',
  localProvider: null,
};
type FixtureWindow = Window & {
  genfeedDesktop: Pick<IGenfeedDesktopBridge, 'app'>;
  desktopRuntimeEmit: (context: IDesktopRuntimeContext) => void;
  desktopRuntimeResolve: () => void;
  desktopRuntimeReads: number;
};

interface DesktopFixtureOptions {
  context: IDesktopRuntimeContext;
  pending: boolean;
}
interface DesktopNetworkObservation {
  walletRequests: number;
  generationRequests: number;
  pageErrors: string[];
}
const test = authenticatedTest.extend<{
  desktopRuntime: DesktopFixtureOptions;
  desktopNetwork: DesktopNetworkObservation;
  desktopSetup: undefined;
}>({
  desktopRuntime: [{ context: cloud, pending: false }, { option: true }],
  desktopNetwork: async ({ context }, use) => {
    void context;
    await use({ walletRequests: 0, generationRequests: 0, pageErrors: [] });
  },
  desktopSetup: [
    async ({ context, desktopRuntime, desktopNetwork }, use) => {
      context.on('request', (request) => {
        const pathname = new URL(request.url()).pathname;
        if (pathname.endsWith('/credits/topbar-balances'))
          desktopNetwork.walletRequests++;
        if (pathname.includes('/ingredients/generate'))
          desktopNetwork.generationRequests++;
      });
      context.on('page', (page) =>
        page.on('pageerror', (error) =>
          desktopNetwork.pageErrors.push(error.message),
        ),
      );
      await installBridge(
        context,
        desktopRuntime.context,
        desktopRuntime.pending,
      );
      await use();
    },
    { auto: true },
  ],
});
const desktopTest = (context: IDesktopRuntimeContext, pending = false) =>
  test.extend({ desktopRuntime: [{ context, pending }, { option: true }] });

async function installBridge(
  browser: BrowserContext,
  context: IDesktopRuntimeContext,
  pending = false,
) {
  await browser.setExtraHTTPHeaders({ 'x-genfeed-desktop-version': '0.1.0' });
  await browser.addInitScript(
    ({ context, pending }) => {
      const target = window as FixtureWindow;
      const callbacks = new Set<(context: IDesktopRuntimeContext) => void>();
      let resolve!: (context: IDesktopRuntimeContext) => void;
      target.desktopRuntimeReads = 0;
      // This fixture supplies only the allowlisted runtime slice; the production
      // hook, shared store and shell components consume it unchanged.
      const app: Pick<
        IGenfeedDesktopBridge['app'],
        'getRuntimeContext' | 'onDidChangeRuntimeContext'
      > = {
        getRuntimeContext: () => {
          target.desktopRuntimeReads++;
          return pending
            ? new Promise((done) => {
                resolve = done;
              })
            : Promise.resolve(context);
        },
        onDidChangeRuntimeContext: (callback) => {
          callbacks.add(callback);
          return () => callbacks.delete(callback);
        },
      };
      const bootstrap = {
        isOfflineMode: context.runtimeMode === 'local',
        activeWorkspaceId: null,
        workspaces: [],
      };
      Object.assign(app, {
        getBootstrap: async () => bootstrap,
        enableOfflineMode: async () => {
          if (context.status === 'unavailable')
            throw new Error(
              'Restart Genfeed Desktop to recover the local workspace.',
            );
          return bootstrap;
        },
      });
      Object.defineProperty(target, 'genfeedDesktop', {
        value: {
          app,
          generation: {
            getProviderConfig: async () => {
              if (context.status === 'unavailable')
                throw new Error(
                  'Restart Genfeed Desktop to recover the local workspace.',
                );
              return null;
            },
          },
        },
        configurable: true,
      });
      target.desktopRuntimeEmit = (value) => {
        for (const callback of callbacks) callback(value);
      };
      target.desktopRuntimeResolve = () => resolve(context);
    },
    { context, pending },
  );
}
async function mockComposer(page: Page) {
  const key = MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4;
  await page.route('**/v1/models**', async (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: 'desktop-model',
            type: 'models',
            attributes: {
              key,
              label: 'Imagen 4',
              category: 'image',
              provider: 'replicate',
              cost: 8,
              pricingType: 'flat',
              isActive: true,
              isDeleted: false,
              lifecycle: 'AVAILABLE',
            },
          },
        ],
        meta: { totalCount: 1 },
        links: { pagination: { page: 1, pages: 1, total: 1 } },
      },
    }),
  );
  await page.route('**/v1/auth/bootstrap**', async (route) => {
    const bootstrap = buildProtectedAppBootstrapPayload();
    await route.fulfill({
      json: {
        ...bootstrap,
        settings: { ...bootstrap.settings, enabledModelIds: [key] },
      },
    });
  });
  await page.route('**/v1/studio-generate-drafts/current**', async (route) =>
    route.fulfill({
      json: {
        data: {
          id: 'desktop-draft',
          type: 'studio-generate-draft',
          attributes: {
            attachments: [],
            references: [],
            knowledgeSelection: {},
            prompt: 'A product photo on a neutral desk',
            type: 'image',
            settingsByType: {
              image: {
                aspectRatio: '16:9',
                blacklist: [],
                brandingMode: 'brand',
                isAudioEnabled: false,
                modelKey: key,
                outputs: 1,
                prioritize: RouterPriority.BALANCED,
                resolution: '1K',
                tags: [],
              },
            },
            droppedReferenceIds: [],
          },
        },
      },
    }),
  );
}
const walletBody = {
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
};
for (const theme of ['light', 'dark'] as const)
  for (const width of [390, 1440]) {
    desktopTest(cloud, true)(
      `desktop cloud readiness and switching ${theme} ${width}`,
      async ({ authenticatedPage: page, desktopNetwork }) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.addInitScript(
          (theme) => localStorage.setItem('theme', theme),
          theme,
        );
        await mockComposer(page);
        let walletRequests = 0;
        let releaseWallet!: () => void;
        await page.route('**/v1/credits/topbar-balances**', async (route) => {
          walletRequests++;
          await new Promise<void>((done) => {
            releaseWallet = done;
          });
          await route.fulfill({ json: walletBody });
        });
        let generationRequests = 0;
        await page.route('**/v1/ingredients/generate**', async (route) => {
          generationRequests++;
          await route.fulfill({ json: { data: [] } });
        });
        await page.goto(brandPath(APP_ROUTES.STUDIO.GENERATE));
        await expect(page.locator('body')).toHaveClass(/gf-desktop-shell/);
        const summary = page.getByTestId('studio-generation-summary');
        await expect(summary).toContainText('Loading cost context');
        expect(walletRequests).toBe(0);
        expect(desktopNetwork.walletRequests).toBe(0);
        const prompt = page
          .getByTestId('studio-generate-prompt')
          .locator('[contenteditable=true]');
        await expect(
          page.getByRole('button', { name: 'Generate', exact: true }),
        ).toBeDisabled();
        await prompt.focus();
        await page.keyboard.press('Enter');
        await page.keyboard.press('Control+Enter');
        await page.keyboard.press('Meta+Enter');
        expect(generationRequests).toBe(0);
        expect(desktopNetwork.generationRequests).toBe(0);
        await page.evaluate(() =>
          (window as FixtureWindow).desktopRuntimeResolve(),
        );
        await expect.poll(() => walletRequests).toBe(1);
        await expect(summary).toContainText('Estimated 8 credits');
        await page.evaluate(
          (context) => (window as FixtureWindow).desktopRuntimeEmit(context),
          {
            ...cloud,
            revision: 1,
            status: 'switching',
            generationExecution: 'unknown',
          },
        );
        await expect(summary).toContainText('Loading cost context');
        releaseWallet();
        await expect(page.getByTestId('topbar-credits-trigger')).toHaveCount(0);
        await expect(
          page.getByRole('button', { name: 'Generate', exact: true }),
        ).toBeDisabled();
        await prompt.focus();
        await page.keyboard.press('Enter');
        await page.keyboard.press('Control+Enter');
        await page.keyboard.press('Meta+Enter');
        expect(generationRequests).toBe(0);
        expect(desktopNetwork.generationRequests).toBe(0);
        await page.evaluate(
          (context) => (window as FixtureWindow).desktopRuntimeEmit(context),
          {
            ...cloud,
            revision: 2,
            selectedServerId: 'cloud-b',
            selectedApiEndpoint: 'https://other.example/v1',
          },
        );
        await expect.poll(() => walletRequests).toBe(2);
        releaseWallet();
        await expect(summary).toContainText('500 available');
        expect(
          await page.evaluate(
            () => (window as FixtureWindow).desktopRuntimeReads,
          ),
        ).toBe(1);
        expect(desktopNetwork.pageErrors).toEqual([]);
        await expectNoErrorOverlay(page);
        await assertNoErrorBoundaryFallback(page, page.url());
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
        ).toBe(false);
        await page.screenshot({
          path: test.info().outputPath(`desktop-cloud-${theme}-${width}.png`),
          fullPage: true,
          style: 'nextjs-portal { visibility: hidden !important; }',
        });
      },
    );
  }
for (const mode of [
  'self-hosted',
  'local',
  'unknown',
  'unavailable',
] as const) {
  const context: IDesktopRuntimeContext = {
    ...cloud,
    selectedServerKind: mode === 'self-hosted' ? 'self-hosted' : 'cloud',
    runtimeMode: mode === 'local' || mode === 'unavailable' ? 'local' : 'cloud',
    status: mode === 'unavailable' ? 'unavailable' : 'ready',
    generationExecution:
      mode === 'unknown' || mode === 'unavailable'
        ? 'unknown'
        : mode === 'local'
          ? 'local-byok'
          : 'remote',
    localProvider:
      mode === 'local' || mode === 'unavailable'
        ? { provider: 'replicate', networkAccess: 'remote' }
        : null,
  };
  desktopTest(context)(
    `desktop ${mode} never infers a managed wallet`,
    async ({ authenticatedPage: page, desktopNetwork }) => {
      await mockComposer(page);
      let walletRequests = 0;
      await page.route('**/v1/credits/topbar-balances**', async (route) => {
        walletRequests++;
        await route.fulfill({ json: walletBody });
      });
      await page.goto(brandPath(APP_ROUTES.STUDIO.GENERATE));
      await expect(page.getByTestId('studio-generation-summary')).toContainText(
        mode === 'local'
          ? 'This Studio generator requires a server connection'
          : 'Cost context unavailable',
      );
      await expect(page.getByTestId('topbar-credits-trigger')).toHaveCount(0);
      expect(walletRequests).toBe(0);
      expect(desktopNetwork.walletRequests).toBe(0);
      await expect(
        page.getByTestId('studio-generation-summary'),
      ).not.toContainText('Estimated');
      const button = page.getByRole('button', {
        name: 'Generate',
        exact: true,
      });
      if (mode === 'self-hosted') await expect(button).toBeEnabled();
      else {
        await expect(button).toBeDisabled();
        await page
          .getByTestId('studio-generate-prompt')
          .locator('[contenteditable=true]')
          .focus();
        await page.keyboard.press('Enter');
        expect(desktopNetwork.generationRequests).toBe(0);
      }

      expect(desktopNetwork.pageErrors).toEqual([]);
      await expectNoErrorOverlay(page);
      await assertNoErrorBoundaryFallback(page, page.url());
    },
  );
}

for (const networkAccess of [
  'local',
  'remote',
  'unknown',
  'missing',
  'unavailable',
] as const) {
  const context: IDesktopRuntimeContext = {
    ...cloud,
    runtimeMode: 'local',
    status: networkAccess === 'unavailable' ? 'unavailable' : 'ready',
    generationExecution:
      networkAccess === 'missing' || networkAccess === 'unavailable'
        ? 'unknown'
        : 'local-byok',
    localProvider:
      networkAccess === 'missing'
        ? null
        : {
            provider: 'openai-compatible',
            networkAccess:
              networkAccess === 'unavailable' ? 'local' : networkAccess,
          },
  };
  desktopTest(context)(
    `desktop local route cost ${networkAccess}`,
    async ({ authenticatedPage: page, desktopNetwork }) => {
      await page.route('**/v1/public/platform-flags**', async (route) =>
        route.fulfill({ json: { desktop_local_workspace: true } }),
      );
      let walletRequests = 0;
      await page.route('**/v1/credits/topbar-balances**', async (route) => {
        walletRequests++;
        await route.fulfill({ json: walletBody });
      });
      await page.goto('/desktop/local');
      const labels = {
        local: 'Local generation · no Genfeed credits',
        remote: 'Your provider · no Genfeed credits. Provider fees may apply',
        unknown: 'Provider cost unavailable',
        missing: 'Choose a local provider',
        unavailable: 'Provider cost unavailable',
      };
      await expect(
        page.getByTestId('desktop-local-generation-cost'),
      ).toHaveText(labels[networkAccess]);
      await expect(
        page.getByTestId('desktop-provider-generation-cost'),
      ).toHaveText(labels[networkAccess]);
      expect(walletRequests).toBe(0);
      expect(desktopNetwork.walletRequests).toBe(0);
      if (networkAccess === 'unavailable')
        await expect(page.getByRole('alert')).toContainText(
          'Restart Genfeed Desktop to recover the local workspace.',
        );
      expect(desktopNetwork.pageErrors).toEqual([]);
      await expectNoErrorOverlay(page);
      await assertNoErrorBoundaryFallback(page, page.url());
    },
  );
}
