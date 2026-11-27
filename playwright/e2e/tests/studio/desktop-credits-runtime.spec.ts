import { RouterPriority } from '@genfeedai/contracts';
import type { ThemePreference } from '@genfeedai/contracts/constants';
import { APP_ROUTES, MODEL_KEYS } from '@genfeedai/contracts/constants';
import type {
  IDesktopBootstrap,
  IDesktopRuntimeContext,
  IDesktopSession,
  IGenfeedDesktopBridge,
} from '@genfeedai/contracts/desktop';
import type {
  AgentGenerationQuote,
  ISetting,
} from '@genfeedai/contracts/interfaces';
import type { BrowserContext, Page } from '@playwright/test';
import { test as authenticatedTest, expect } from '../../fixtures/auth.fixture';
import { buildProtectedAppBootstrapPayload } from '../../utils/api-interceptor';
import { brandPath, expectNoAccountCredits } from '../../utils/app-chrome';
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
  generationExecution: 'remote',
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
interface ComposerFixtureOptions {
  quote?: AgentGenerationQuote;
  theme?: ThemePreference;
}
const test = authenticatedTest.extend<{
  desktopRuntime: DesktopFixtureOptions;
  desktopNetwork: DesktopNetworkObservation;
  desktopSetup: undefined;
}>({
  desktopRuntime: [{ context: cloud, pending: false }, { option: true }],
  desktopNetwork: async ({ context }, use) => {
    void context;
    await use({
      walletRequests: 0,
      generationRequests: 0,
      pageErrors: [],
    });
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

async function captureRuntimeState(
  page: Page,
  observation: DesktopNetworkObservation,
  name: string,
) {
  expect(observation.pageErrors).toEqual([]);
  await expectNoErrorOverlay(page);
  await assertNoErrorBoundaryFallback(page, page.url());
  await page.screenshot({
    path: test.info().outputPath(`${name}.png`),
    fullPage: true,
    style: 'nextjs-portal { visibility: hidden !important; }',
  });
}

async function openGenerationSummary(page: Page) {
  const prompt = page
    .getByTestId('studio-playground-prompt')
    .locator('[contenteditable=true]');
  await prompt.focus();
  await expect(prompt).toBeFocused();
  const generate = page
    .getByTestId('studio-playground-composer-shell')
    .getByRole('button', { name: 'Generate', exact: true });
  await generate.focus();
  await expect(generate).toBeFocused();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  const descriptionId = await tooltip.getAttribute('id');
  expect(descriptionId).toBeTruthy();
  await expect(generate).toHaveAttribute(
    'aria-describedby',
    descriptionId ?? '',
  );
  return tooltip;
}

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
      const bootstrapCallbacks = new Set<
        (bootstrap: IDesktopBootstrap) => void
      >();
      const sessionCallbacks = new Set<
        (session: IDesktopSession | null) => void
      >();
      let resolve!: (context: IDesktopRuntimeContext) => void;
      target.desktopRuntimeReads = 0;
      // This fixture supplies only the allowlisted runtime slice; the production
      // hook, shared store and shell components consume it unchanged.
      const app: Pick<
        IGenfeedDesktopBridge['app'],
        | 'getRuntimeContext'
        | 'onDidChangeRuntimeContext'
        | 'onDidBootstrapChange'
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
        onDidBootstrapChange: (callback) => {
          bootstrapCallbacks.add(callback);
          return () => {
            bootstrapCallbacks.delete(callback);
          };
        },
      };
      Object.defineProperty(target, 'genfeedDesktop', {
        value: {
          app,
          auth: {
            onDidChangeSession: (
              callback: (session: IDesktopSession | null) => void,
            ) => {
              sessionCallbacks.add(callback);
              return () => {
                sessionCallbacks.delete(callback);
              };
            },
          } satisfies Pick<IGenfeedDesktopBridge['auth'], 'onDidChangeSession'>,
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
async function mockComposer(page: Page, options: ComposerFixtureOptions = {}) {
  const key = MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4;
  if (options.quote) {
    // RouterService reads the raw quote body, without a JSON:API wrapper.
    await page.route(
      '**/v1/router/estimate-generation-credits',
      async (route) => route.fulfill({ json: options.quote }),
    );
  }
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
    const settings = bootstrap.currentUser.settings as ISetting;
    bootstrap.currentUser.settings = {
      ...settings,
      // Simple mode resets a saved model pick to Auto, which has no quote
      // until routing selects a model. Advanced keeps the explicit Imagen 4
      // pick whose 8-credit estimate this suite asserts.
      isAdvancedMode: true,
      // Account preference sync overrides localStorage after hydration.
      ...(options.theme ? { theme: options.theme } : {}),
    };
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
        await page.emulateMedia({ colorScheme: theme });
        await page.addInitScript(
          (theme) => localStorage.setItem('theme', theme),
          theme,
        );
        await mockComposer(page, {
          quote: {
            credits: 8,
            isAvailable: true,
            modelKey: MODEL_KEYS.REPLICATE_GOOGLE_IMAGEN_4,
          },
          theme,
        });
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
        await page.goto(brandPath(APP_ROUTES.STUDIO.PLAYGROUND));
        await expect(page.locator('body')).toHaveClass(/gf-desktop-shell/);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const generate = page
          .getByTestId('studio-playground-composer-shell')
          .getByRole('button', { name: 'Generate', exact: true });
        let summary = await openGenerationSummary(page);
        await expect(summary.getByRole('status')).toHaveText(
          'Loading cost context…',
        );
        expect(walletRequests).toBe(0);
        expect(desktopNetwork.walletRequests).toBe(0);
        const prompt = page
          .getByTestId('studio-playground-prompt')
          .locator('[contenteditable=true]');
        await expect(generate).toBeDisabled();
        await expect(generate).toHaveAttribute('aria-disabled', 'true');
        await generate.press('Escape');
        await expect(summary).toHaveCount(0);
        await prompt.focus();
        await page.keyboard.press('Enter');
        await page.keyboard.press('Control+Enter');
        await page.keyboard.press('Meta+Enter');
        expect(generationRequests).toBe(0);
        expect(desktopNetwork.generationRequests).toBe(0);
        await captureRuntimeState(
          page,
          desktopNetwork,
          `desktop-loading-${theme}-${width}`,
        );
        await page.evaluate(() =>
          (window as FixtureWindow).desktopRuntimeResolve(),
        );
        await expect.poll(() => walletRequests).toBe(1);
        summary = await openGenerationSummary(page);
        const estimate = summary.getByRole('status', {
          name: 'Estimated 8 credits',
          exact: true,
        });
        await expect(estimate).toBeVisible();
        await expect(estimate).toHaveText('~8');
        await generate.press('Escape');
        await expect(summary).toHaveCount(0);
        await page.evaluate(
          (context) => (window as FixtureWindow).desktopRuntimeEmit(context),
          {
            ...cloud,
            revision: 1,
            status: 'switching',
            generationExecution: 'unknown',
          },
        );
        summary = await openGenerationSummary(page);
        await expect(summary.getByRole('status')).toHaveText(
          'Loading cost context…',
        );
        await generate.press('Escape');
        await expect(summary).toHaveCount(0);
        releaseWallet();
        await expectNoAccountCredits(page);
        await expect(generate).toBeDisabled();
        await expect(generate).toHaveAttribute('aria-disabled', 'true');
        await prompt.focus();
        await page.keyboard.press('Enter');
        await page.keyboard.press('Control+Enter');
        await page.keyboard.press('Meta+Enter');
        expect(generationRequests).toBe(0);
        expect(desktopNetwork.generationRequests).toBe(0);
        await captureRuntimeState(
          page,
          desktopNetwork,
          `desktop-switching-${theme}-${width}`,
        );
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
        summary = await openGenerationSummary(page);
        const balance = summary.getByRole('status', {
          name: '500 available',
          exact: true,
        });
        await expect(balance).toBeVisible();
        await expect(balance).toHaveText('500');
        await generate.press('Escape');
        await expect(summary).toHaveCount(0);
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
        await captureRuntimeState(
          page,
          desktopNetwork,
          `desktop-cloud-${theme}-${width}`,
        );
      },
    );
  }
for (const mode of ['self-hosted', 'unknown'] as const) {
  const context: IDesktopRuntimeContext = {
    ...cloud,
    selectedServerKind: mode === 'self-hosted' ? 'self-hosted' : 'cloud',
    generationExecution: mode === 'unknown' ? 'unknown' : 'remote',
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
      await page.goto(brandPath(APP_ROUTES.STUDIO.PLAYGROUND));
      let summary = await openGenerationSummary(page);
      await expect(summary.getByRole('status')).toHaveText(
        'Cost context unavailable',
      );
      await expectNoAccountCredits(page);
      expect(walletRequests).toBe(0);
      expect(desktopNetwork.walletRequests).toBe(0);
      // Opening the account menu dismissed the cost summary; open it again.
      summary = await openGenerationSummary(page);
      await expect(summary).not.toContainText('Estimated');
      await expect(
        summary.getByRole('status', { name: /^Estimated/ }),
      ).toHaveCount(0);
      const button = page.getByRole('button', {
        name: 'Generate',
        exact: true,
      });
      await button.press('Escape');
      await expect(summary).toHaveCount(0);
      if (mode === 'self-hosted') {
        await expect(button).toBeEnabled();
        await expect(button).not.toHaveAttribute('aria-disabled', 'true');
      } else {
        await expect(button).toBeDisabled();
        await expect(button).toHaveAttribute('aria-disabled', 'true');
        await page
          .getByTestId('studio-playground-prompt')
          .locator('[contenteditable=true]')
          .focus();
        await page.keyboard.press('Enter');
        expect(desktopNetwork.generationRequests).toBe(0);
      }

      expect(desktopNetwork.pageErrors).toEqual([]);
      await expectNoErrorOverlay(page);
      await assertNoErrorBoundaryFallback(page, page.url());
      await captureRuntimeState(page, desktopNetwork, `desktop-${mode}`);
    },
  );
}
