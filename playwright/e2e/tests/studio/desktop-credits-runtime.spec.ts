import { RouterPriority } from '@genfeedai/contracts';
import { APP_ROUTES, MODEL_KEYS } from '@genfeedai/contracts/constants';
import type {
  IDesktopRuntimeContext,
  IGenfeedDesktopBridge,
} from '@genfeedai/contracts/desktop';
import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';
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

async function installBridge(
  page: Page,
  context: IDesktopRuntimeContext,
  pending = false,
) {
  await page.addInitScript(
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
      Object.defineProperty(target, 'genfeedDesktop', {
        value: { app },
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
    test(`desktop cloud readiness and switching ${theme} ${width}`, async ({
      authenticatedPage: page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(
        (theme) => localStorage.setItem('theme', theme),
        theme,
      );
      await installBridge(page, cloud, true);
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
      const summary = page.getByTestId('studio-generation-summary');
      await expect(summary).toContainText('Loading cost context');
      expect(walletRequests).toBe(0);
      const prompt = page
        .getByTestId('studio-generate-prompt')
        .locator('[contenteditable=true]');
      await prompt.focus();
      await page.keyboard.press('Control+Enter');
      await page.keyboard.press('Meta+Enter');
      expect(generationRequests).toBe(0);
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
      await prompt.focus();
      await page.keyboard.press('Control+Enter');
      await page.keyboard.press('Meta+Enter');
      expect(generationRequests).toBe(0);
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
    });
  }
for (const mode of ['self-hosted', 'local', 'unknown'] as const)
  test(`desktop ${mode} never infers a managed wallet`, async ({
    authenticatedPage: page,
  }) => {
    const context: IDesktopRuntimeContext = {
      ...cloud,
      selectedServerKind: mode === 'self-hosted' ? 'self-hosted' : 'cloud',
      runtimeMode: mode === 'local' ? 'local' : 'cloud',
      generationExecution:
        mode === 'unknown'
          ? 'unknown'
          : mode === 'local'
            ? 'local-byok'
            : 'remote',
      localProvider:
        mode === 'local'
          ? { provider: 'replicate', networkAccess: 'remote' }
          : null,
    };
    await installBridge(page, context);
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
    await expectNoErrorOverlay(page);
    await assertNoErrorBoundaryFallback(page, page.url());
  });

for (const networkAccess of ['local', 'remote', 'unknown', 'missing'] as const)
  test(`desktop local route cost ${networkAccess}`, async ({
    authenticatedPage: page,
  }) => {
    const context: IDesktopRuntimeContext = {
      ...cloud,
      runtimeMode: 'local',
      generationExecution:
        networkAccess === 'missing' ? 'unknown' : 'local-byok',
      localProvider:
        networkAccess === 'missing'
          ? null
          : { provider: 'openai-compatible', networkAccess },
    };
    await installBridge(page, context);
    await page.addInitScript(() => {
      const target = window as FixtureWindow;
      const bootstrap = {
        isOfflineMode: true,
        activeWorkspaceId: null,
        workspaces: [],
      };
      Object.assign(target.genfeedDesktop.app, {
        getBootstrap: async () => bootstrap,
        enableOfflineMode: async () => bootstrap,
      });
      Object.assign(target.genfeedDesktop, {
        generation: { getProviderConfig: async () => null },
      });
    });
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
    };
    await expect(page.getByTestId('desktop-local-generation-cost')).toHaveText(
      labels[networkAccess],
    );
    await expect(
      page.getByTestId('desktop-provider-generation-cost'),
    ).toHaveText(labels[networkAccess]);
    expect(walletRequests).toBe(0);
    await expectNoErrorOverlay(page);
    await assertNoErrorBoundaryFallback(page, page.url());
  });
