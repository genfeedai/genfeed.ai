import { brandPath } from '@e2e/utils/app-chrome';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';

const CLIPPER_URL = brandPath(APP_ROUTES.STUDIO.CLIPPER);
const UPLOAD_ERROR =
  'Upload could not start. The storage service did not answer in time, so try again in a moment.';

/**
 * A creative app with no project open shows a hero with starter cards and the
 * prompt bar under it. The bar is capped at 70% of the pane and scrolls
 * inside that, so a tall bar on a short window still reaches its input and
 * send button. Clipper's upload source makes the tallest bar: the file
 * status, the source limits, the credits hint and an upload error together.
 */
const VIEWPORTS = [
  { height: 320, name: 'short landscape', width: 568 },
  { height: 664, name: 'phone', width: 390 },
  { height: 900, name: 'desktop', width: 1440 },
] as const;

async function openClipper(page: Page) {
  await page.route(
    (url) => /\/clipper-projects\/?$/.test(url.pathname),
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({ json: { data: [] } });
    },
  );
  await page.route('**/clipper-projects/from-upload', async (route) => {
    await route.fulfill({
      json: { errors: [{ detail: UPLOAD_ERROR }] },
      status: 500,
    });
  });

  await page.goto(CLIPPER_URL);
  return page.getByTestId('clipper-prompt-bar');
}

async function openTallClipperBar(page: Page) {
  const bar = await openClipper(page);
  await page.getByRole('button', { name: /upload audio or video/i }).click();
  await page.getByLabel(/audio or video file/i).setInputFiles({
    buffer: Buffer.from('fixture-video'),
    mimeType: 'video/mp4',
    name: 'podcast.mp4',
  });
  await page.getByRole('button', { name: /import & transcribe/i }).click();

  // The shell reports the failed request in its own dialog; dismiss it so
  // the bar is reachable.
  await page
    .getByRole('dialog', { name: 'Request failed' })
    .getByRole('button', { name: /close/i })
    .first()
    .click({ timeout: 5_000 })
    .catch(() => undefined);

  await expect(bar.getByRole('alert')).toHaveText(UPLOAD_ERROR);
  return bar;
}

async function expectReachable(part: Locator): Promise<void> {
  await part.scrollIntoViewIfNeeded();
  await expect(part).toBeInViewport();
}

for (const viewport of VIEWPORTS) {
  test(`a tall Clipper prompt bar stays reachable (${viewport.name})`, async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize(viewport);
    const bar = await openTallClipperBar(authenticatedPage);

    // Every part of the bar can be scrolled to and used, send last.
    await expectReachable(bar.getByRole('alert'));
    await expectReachable(bar.getByLabel(/audio or video file/i));
    await expectReachable(
      bar.getByRole('status').filter({ hasText: 'podcast.mp4' }),
    );
    await expectReachable(bar.getByText(/uses credits to transcribe/i));
    const send = bar.getByRole('button', { name: /import & transcribe/i });
    await expectReachable(send);
    await send.click({ trial: true });
  });
}

for (const viewport of VIEWPORTS) {
  test(`the hero and its starter cards sit above the prompt bar (${viewport.name})`, async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize(viewport);
    const bar = await openClipper(authenticatedPage);
    const heading = authenticatedPage.getByRole('heading', {
      name: 'What should Clipper cut?',
    });
    const cards = authenticatedPage.getByRole('toolbar', {
      name: 'Prompt suggestions',
    });
    await expect(heading).toBeVisible();
    await expect(bar).toBeVisible();

    const [barBox, headingBox, cardsBox] = await Promise.all([
      bar.boundingBox(),
      heading.boundingBox(),
      cards.boundingBox(),
    ]);
    if (!barBox || !headingBox || !cardsBox) {
      throw new Error(
        'The hero, its starter cards and the bar must be laid out.',
      );
    }
    // Order only: cards below the hero's fold scroll inside the hero and are
    // clipped there, so their full height is allowed to pass the bar's top.
    expect(headingBox.y).toBeLessThan(barBox.y);
    expect(cardsBox.y).toBeGreaterThanOrEqual(headingBox.y + headingBox.height);
    expect(cardsBox.y).toBeLessThan(barBox.y + barBox.height);
    // The cards stay inside the window sideways.
    expect(cardsBox.x).toBeGreaterThanOrEqual(0);
    expect(cardsBox.x + cardsBox.width).toBeLessThanOrEqual(viewport.width);
  });
}
