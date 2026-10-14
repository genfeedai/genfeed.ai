import { brandPath } from '@e2e/utils/app-chrome';
import {
  APP_ROUTES,
  FLUX_3_IMAGE_CONTRACT_VERSION,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import type { Locator, Page, Request } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { buildProtectedAppBootstrapPayload } from '../../utils/api-interceptor';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

// #6585 / #6691: More opens by pointer and keyboard without selecting the
// card, including one 200% zoom case. A saved preview that fails to load
// recovers through Retry preview, and a rejected submit keeps the prompt
// after exactly one image write. Paid generation writes are mocked.

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=',
  'base64',
);
const model = MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE;
const menuId = 'menu-first';
const brokenId = 'preview-broken';

/** Any write to a generation or transform surface would spend credits. */
function isGenerationWrite(request: Request): boolean {
  if (request.method() === 'GET') return false;
  const { pathname } = new URL(request.url());
  return /\/v1\/(images|videos|audios|musics|avatars)(\/|$)/.test(pathname);
}

const PAID_GENERATION_SURFACES =
  '**/v1/{images,videos,audios,musics,avatars}**';

async function expectInsideViewport(
  control: Locator,
  viewport: { height: number; width: number },
): Promise<void> {
  await expect
    .poll(async () => {
      const bounds = await control.boundingBox();
      return (
        bounds !== null &&
        bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= viewport.width &&
        bounds.y + bounds.height <= viewport.height
      );
    })
    .toBe(true);
}

/** The control's center is the topmost hit target, so a pointer can operate it. */
async function expectPointerReachable(control: Locator): Promise<void> {
  await expect
    .poll(() =>
      control.evaluate((element) => {
        const box = element.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0) return false;
        const target = document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        );
        return Boolean(target && element.contains(target));
      }),
    )
    .toBe(true);
}

async function mountPlayground(page: Page) {
  const media = { isBrokenHealthy: false };
  const generationWrites: string[] = [];
  page.on('request', (request) => {
    if (isGenerationWrite(request))
      generationWrites.push(`${request.method()} ${request.url()}`);
  });
  await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  const image = (id: string) => ({
    id,
    type: 'ingredients',
    attributes: {
      brandId: 'brand-1',
      organizationId: 'mock-org-id-e2e-test',
      category: 'IMAGE',
      scope: 'USER',
      status: 'GENERATED',
      cdnUrl: `https://cdn.genfeed.ai/mock/${id}.png`,
      width: 1024,
      height: 768,
      createdAt: '2026-10-10T00:00:00Z',
      prompt: { original: id },
      generationHarness: {
        brandId: 'brand-1',
        originalPrompt: id,
        enhancedPrompt: id,
        status: 'skipped',
        source: 'request',
        appliedPacks: [],
      },
      metadata: { label: id, model, width: 1024, height: 768 },
    },
  });
  await page.route('**/cdn.genfeed.ai/mock/*.png', (route) => {
    const isBroken = route.request().url().includes(`/${brokenId}.png`);
    return isBroken && !media.isBrokenHealthy
      ? route.fulfill({ status: 404, headers: { 'cache-control': 'no-store' } })
      : route.fulfill({
          contentType: 'image/png',
          headers: { 'cache-control': 'no-store' },
          body: pixel,
        });
  });
  await page.route('**/v1/auth/bootstrap**', (route) => {
    const bootstrap = buildProtectedAppBootstrapPayload();
    return route.fulfill({
      json: {
        ...bootstrap,
        settings: { ...bootstrap.settings, enabledModelIds: [model] },
      },
    });
  });
  await page.route('**/v1/models**', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: 'recovery-model',
            type: 'models',
            attributes: {
              key: model,
              label: 'FLUX.3',
              provider: 'replicate',
              category: 'image',
              isDefault: true,
              isActive: true,
              isDeleted: false,
              cost: 8,
              maxOutputs: 1,
              reviewedProviderContractVersion: FLUX_3_IMAGE_CONTRACT_VERSION,
            },
          },
        ],
        meta: { totalCount: 1 },
      },
    }),
  );
  await page.route('**/v1/studio-generate-drafts/current**', (route) =>
    route.fulfill({
      json:
        route.request().method() === 'GET'
          ? { data: null }
          : {
              data: {
                id: 'recovery-draft',
                type: 'studio-generate-drafts',
                attributes:
                  route.request().postDataJSON()?.data?.attributes ??
                  route.request().postDataJSON(),
              },
            },
    }),
  );
  await page.route('**/v1/ingredients**', (route) => {
    const url = new URL(route.request().url());
    if (/\/(posts|children)$/.test(url.pathname))
      return route.fulfill({ json: { data: [] } });
    const id = url.pathname.split('/').at(-1);
    return route.fulfill({
      json:
        id && id !== 'ingredients'
          ? { data: image(id) }
          : {
              data: [image(menuId), image(brokenId)],
              meta: { page: 1, pageSize: 100, totalCount: 2 },
            },
    });
  });
  // Saved-asset reads only; generation writes are recorded above and fail.
  await page.route('**/v1/images/**', (route) => {
    if (route.request().method() !== 'GET')
      return route.fulfill({ status: 500, json: { message: 'unexpected' } });
    const id = new URL(route.request().url()).pathname.split('/').at(-1) ?? '';
    return route.fulfill({ json: { data: image(id) } });
  });
  // Last matching route wins. GET falls through to the handler above; every
  // other paid write is fulfilled here and never reaches a provider. The
  // rejected-submit test registers its 422 after mount so that response wins.
  await page.route(PAID_GENERATION_SURFACES, (route) => {
    if (route.request().method() === 'GET') return route.fallback();
    return route.fulfill({ status: 500, json: { message: 'unexpected' } });
  });
  await page.goto(brandPath(APP_ROUTES.STUDIO.PLAYGROUND), {
    waitUntil: 'domcontentloaded',
  });
  return { generationWrites, media };
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 1000 },
]) {
  test(`More opens by pointer and keyboard without selecting the first card at ${viewport.width}px`, async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { generationWrites } = await mountPlayground(page);
    const card = page.getByTestId(`studio-asset-${menuId}`);
    await expect(card).toHaveAttribute('data-asset-media-state', 'ready');
    const more = card.getByRole('button', { name: 'More', exact: true });

    // Pointer: hover reveals the bar and the click opens the menu.
    await card.hover();
    await more.click();
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(card).toHaveAttribute('data-selected', 'false');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toBeHidden();
    await expect(more).toBeFocused();
    await expect(card).toHaveAttribute('data-selected', 'false');

    // Keyboard: a focused trigger reveals the bar; Enter and Space open it.
    await page.mouse.move(0, 0);
    for (const key of ['Enter', ' ']) {
      await more.focus();
      await expect(more).toBeVisible();
      await page.keyboard.press(key);
      await expect(page.getByRole('menu')).toBeVisible();
      await expect(page.getByRole('menuitem').first()).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(more).toBeFocused();
    }
    await expect(card).toHaveAttribute('data-selected', 'false');

    // The global reduced-motion rule collapses the reveal transition.
    const transitionSeconds = await more.evaluate((element) => {
      const bar = element.closest('.z-50');
      return bar
        ? Number.parseFloat(getComputedStyle(bar).transitionDuration)
        : NaN;
    });
    expect(transitionSeconds).toBeLessThanOrEqual(0.001);

    expect(generationWrites).toEqual([]);
    await expectNoErrorOverlay(page);
  });
}

// Browser zoom at 200% halves the CSS viewport (generation-setup-responsive).
// deviceScaleFactor is pixel density, not zoom, so this case does not set it.
test('More stays reachable by pointer and keyboard at 200% zoom', async ({
  authenticatedPage: page,
}) => {
  test.setTimeout(90_000);
  const viewport = { width: 1440 / 2, height: 600 };
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { generationWrites } = await mountPlayground(page);
  const card = page.getByTestId(`studio-asset-${menuId}`);
  await expect(card).toHaveAttribute('data-asset-media-state', 'ready');
  const more = card.getByRole('button', { name: 'More', exact: true });
  const menu = page.getByRole('menu');
  const firstItem = page.getByRole('menuitem').first();

  await card.scrollIntoViewIfNeeded();
  await card.hover();
  await expect(more).toBeInViewport();
  await expectInsideViewport(more, viewport);
  await expectPointerReachable(more);
  await more.click();
  await expect(menu).toBeVisible();
  await expectInsideViewport(firstItem, viewport);
  await expectPointerReachable(firstItem);
  await expect(card).toHaveAttribute('data-selected', 'false');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(more).toBeFocused();

  await page.mouse.move(0, 0);
  for (const key of ['Enter', ' ']) {
    await more.focus();
    await expectPointerReachable(more);
    await page.keyboard.press(key);
    await expect(menu).toBeVisible();
    await expectInsideViewport(firstItem, viewport);
    await page.keyboard.press('Escape');
    await expect(more).toBeFocused();
  }
  await expect(card).toHaveAttribute('data-selected', 'false');
  expect(generationWrites).toEqual([]);
  await expectNoErrorOverlay(page);
});

test('an unavailable saved preview recovers through Retry preview without generating', async ({
  authenticatedPage: page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { generationWrites, media } = await mountPlayground(page);
  const card = page.getByTestId(`studio-asset-${brokenId}`);

  await expect(card).toHaveAttribute('data-asset-media-state', 'fallback');
  const cardStatus = page.getByTestId(`studio-asset-media-status-${brokenId}`);
  await expect(cardStatus).toHaveAttribute('role', 'status');
  await expect(cardStatus).toContainText('Preview unavailable');

  await card.click();
  const inspector = page.getByTestId('studio-playground-inspector');
  await expect(
    inspector.getByText('This saved asset’s preview could not be loaded.'),
  ).toBeVisible();

  media.isBrokenHealthy = true;
  await inspector
    .getByRole('button', { name: 'Retry preview', exact: true })
    .click();

  await expect(
    inspector.locator(`img[src*="/mock/${brokenId}.png"]`),
  ).toBeVisible();
  await expect(card).toHaveAttribute('data-asset-media-state', 'ready');
  await expect(cardStatus).toBeHidden();
  expect(generationWrites).toEqual([]);
  await expectNoErrorOverlay(page);
});

test('a rejected submit keeps the prompt for another attempt', async ({
  authenticatedPage: page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  let admissions = 0;
  const { generationWrites } = await mountPlayground(page);
  // Registered after the paid-write mock so this 422 is the one that answers.
  await page.route('**/v1/images', (route) => {
    admissions++;
    // A validation rejection: surfaces own 422 handling, so no debug modal.
    return route.fulfill({
      status: 422,
      json: { message: 'Prompt rejected by the provider' },
    });
  });
  const editor = page
    .getByTestId('studio-playground-prompt')
    .getByRole('textbox');
  await expect(editor).toBeVisible();
  await page.getByRole('button', { name: /^Generation setup:/ }).click();
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await page
    .getByRole('button', { name: 'Configure Model', exact: true })
    .click();
  await page.getByRole('option').filter({ hasText: 'FLUX.3' }).first().click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await editor.fill('Keep this prompt after a rejected submit');
  await page.getByRole('button', { name: 'Generate', exact: true }).click();

  await expect.poll(() => admissions).toBe(1);
  expect(generationWrites).toHaveLength(1);
  expect(generationWrites[0]).toMatch(/^POST .*\/v1\/images(\?|$)/);
  await expect(editor).toHaveText('Keep this prompt after a rejected submit');
  await expect(
    page.getByRole('button', { name: 'Generate', exact: true }),
  ).toBeEnabled();
  await expectNoErrorOverlay(page);
});
