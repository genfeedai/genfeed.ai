import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Page } from '@playwright/test';
import {
  mockActiveSubscription,
  mockAvatarTwinEnrollment,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

/**
 * The digital twin recorder (#9684) with Chromium's fake camera and
 * microphone: the browser grants both without a prompt and streams a test
 * pattern, so a real take is recorded and uploaded.
 */
test.use({
  launchOptions: {
    args: [
      '--disable-web-security',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
  permissions: ['camera', 'microphone'],
});

const MINIMUM_TAKE_SECONDS = 15;

async function openRecorder(page: Page): Promise<void> {
  const route = brandPath(APP_ROUTES.LIBRARY.AVATAR_TWIN);
  await page.goto(route, { timeout: 60000, waitUntil: 'domcontentloaded' });
  await assertNoErrorBoundaryFallback(page, route);
  await expect(page.getByRole('region', { name: 'Read this' })).toBeVisible();
  await page.getByRole('button', { name: 'Turn on camera' }).click();
  await expect(page.getByLabel('Your camera')).toBeVisible();
}

test.describe('Digital twin recorder', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  test('refuses a take shorter than 15 seconds', async ({
    authenticatedPage: page,
  }) => {
    await mockAvatarTwinEnrollment(page);
    await openRecorder(page);

    await page.getByRole('button', { name: 'Start recording' }).click();
    await expect(
      page.getByText(`Keep going: at least ${MINIMUM_TAKE_SECONDS} seconds.`),
    ).toBeVisible();
    // The recorder flushes a chunk every second; wait for a few so the take
    // holds data and is refused for its length, not for being empty.
    await expect(page.getByText(/0:0[3-9] of /)).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole('button', { name: 'Stop' }).click();

    await expect(
      page.getByText(
        `This take is shorter than ${MINIMUM_TAKE_SECONDS} seconds. Record again.`,
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Use this take' }),
    ).toBeDisabled();
  });

  test('records a take with the camera and uploads it to start training', async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(180_000);
    const enrollment = await mockAvatarTwinEnrollment(page);
    await openRecorder(page);

    await page.getByRole('button', { name: 'Start recording' }).click();
    const keepGoing = page.getByText(
      `Keep going: at least ${MINIMUM_TAKE_SECONDS} seconds.`,
    );
    await expect(keepGoing).toBeVisible();
    await expect(keepGoing).toBeHidden({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Stop' }).click();

    await expect(
      page.getByRole('button', { name: 'Record again' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Use this take' }).click();

    await expect(
      page.getByText('Training your twin. This usually takes a few minutes.'),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Delete twin' }),
    ).toBeVisible();
    expect(enrollment.uploads()).toBe(1);
    expect(enrollment.startRequests).toEqual([
      expect.objectContaining({
        isRecordingKept: false,
        sourceIngredientId: 'twin-take-1',
      }),
    ]);
  });
});
