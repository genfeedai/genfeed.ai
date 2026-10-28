import { brandPath } from '@e2e/utils/app-chrome';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Page, Request } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { mockGenerationQuote } from '../../utils/generation-setup';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

// #8496: a generation's stored prompt slots and the text the model was sent
// are visible in the Studio inspector, and "Edit slots and run again" reopens
// the generation in the composer. Paid generation writes are mocked and fail.

const imageId = 'slots-image';
const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=',
  'base64',
);
const sentText =
  'A founder at a desk beside a window, lit by soft window light.';

/** Any write to a generation surface would spend credits. */
function isGenerationWrite(request: Request): boolean {
  if (request.method() === 'GET') return false;
  const { pathname } = new URL(request.url());
  return /\/v1\/(images|videos|audios|musics|avatars)(\/|$)/.test(pathname);
}

function slotsImage(id: string) {
  return {
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
      createdAt: '2026-10-28T08:00:00Z',
      prompt: {
        original: 'A founder at a desk',
        subject: 'a founder at a desk',
        lighting: 'soft window light',
        mood: 'confident',
        // Images carry no audio, so these two must not be offered.
        sounds: ['rain'],
        speech: 'Welcome back',
        renderedPrompt: sentText,
        renderTarget: 'prose',
      },
      metadata: { label: id, width: 1024, height: 768 },
    },
  };
}

async function mountPlayground(page: Page): Promise<string[]> {
  const generationWrites: string[] = [];
  page.on('request', (request) => {
    if (isGenerationWrite(request))
      generationWrites.push(`${request.method()} ${request.url()}`);
  });
  await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  await mockGenerationQuote(page);
  await page.route('**/cdn.genfeed.ai/mock/*.png', (route) =>
    route.fulfill({ contentType: 'image/png', body: pixel }),
  );
  await page.route('**/v1/studio-generate-drafts/current**', (route) =>
    route.fulfill({ json: { data: null } }),
  );
  await page.route('**/v1/ingredients**', (route) => {
    const url = new URL(route.request().url());
    if (/\/(posts|children)$/.test(url.pathname))
      return route.fulfill({ json: { data: [] } });
    const id = url.pathname.split('/').at(-1);
    return route.fulfill({
      json:
        id && id !== 'ingredients'
          ? { data: slotsImage(id) }
          : {
              data: [slotsImage(imageId)],
              meta: { page: 1, pageSize: 100, totalCount: 1 },
            },
    });
  });
  // Saved-asset reads only; every other write is a paid generation.
  await page.route('**/v1/images/**', (route) => {
    if (route.request().method() !== 'GET')
      return route.fulfill({ status: 500, json: { message: 'unexpected' } });
    const id = new URL(route.request().url()).pathname.split('/').at(-1) ?? '';
    return route.fulfill({ json: { data: slotsImage(id) } });
  });
  await page.goto(brandPath(APP_ROUTES.STUDIO.PLAYGROUND), {
    waitUntil: 'domcontentloaded',
  });
  return generationWrites;
}

test('the inspector shows the stored slots and the text the model was sent', async ({
  authenticatedPage: page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const generationWrites = await mountPlayground(page);

  await page.getByTestId(`studio-asset-${imageId}`).click();
  const slots = page.getByTestId('studio-inspector-prompt-slots');
  await expect(slots.getByText('a founder at a desk')).toBeVisible();
  await expect(slots.getByText('soft window light')).toBeVisible();
  await expect(slots.getByText('confident')).toBeVisible();
  await expect(slots.getByText('Sounds')).toHaveCount(0);
  await expect(slots.getByText('Speech')).toHaveCount(0);

  const sent = page.getByTestId('studio-inspector-sent-text');
  await expect(sent.getByText(sentText)).toBeVisible();
  await expect(sent.getByText('Written as prose')).toBeVisible();

  expect(generationWrites).toEqual([]);
  await expectNoErrorOverlay(page);
});

test('Edit slots and run again reopens the generation without generating', async ({
  authenticatedPage: page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const generationWrites = await mountPlayground(page);

  await page.getByTestId(`studio-asset-${imageId}`).click();
  await page
    .getByTestId('studio-inspector-prompt-slots')
    .getByRole('button', { name: 'Edit slots and run again' })
    .click();

  // Nothing is submitted: the person edits the slots in the composer first.
  await expect(page.getByTestId('studio-inspector-prompt-slots')).toBeVisible();
  expect(generationWrites).toEqual([]);
  await expectNoErrorOverlay(page);
});
