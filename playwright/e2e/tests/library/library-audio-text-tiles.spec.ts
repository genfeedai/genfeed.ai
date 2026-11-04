import { brandPath } from '@e2e/utils/app-chrome';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';

const SAMPLE_RATE = 8000;
const SECONDS = 30;

/** A silent 8-bit mono WAV the audio element can load and play. */
function silentWav(): Buffer {
  const dataSize = SAMPLE_RATE * SECONDS;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, Buffer.alloc(dataSize, 128)]);
}

function ingredient(
  id: string,
  category: 'MUSIC' | 'VOICE' | 'TEXT',
  label: string,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    type: 'ingredients',
    attributes: {
      brandId: 'brand-1',
      organizationId: 'mock-org-id-e2e-test',
      category,
      scope: 'USER',
      status: 'GENERATED',
      createdAt: new Date().toISOString(),
      metadata: { label, duration: SECONDS },
      ...extra,
    },
  };
}

test.describe('Library masonry audio and text tiles', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
    await page.setViewportSize({ width: 1500, height: 950 });
    await page.route('**/cdn.genfeed.ai/mock/*.wav', (route) =>
      route.fulfill({ body: silentWav(), contentType: 'audio/wav' }),
    );
    await page.route('**/v1/ingredients**', (route) => {
      const url = new URL(route.request().url());
      if (
        route.request().method() !== 'GET' ||
        /\/summary$/.test(url.pathname)
      ) {
        return route.fallback();
      }
      return route.fulfill({
        json: {
          data: [
            ingredient('lofi-beat', 'MUSIC', 'Lo-fi beat', {
              cdnUrl: 'https://cdn.genfeed.ai/mock/lofi-beat.wav',
            }),
            ingredient('brand-intro', 'VOICE', 'Warm brand intro', {
              cdnUrl: 'https://cdn.genfeed.ai/mock/brand-intro.wav',
            }),
            ingredient('launch-caption', 'TEXT', 'Launch caption', {
              text: 'Ship the content, not the slide deck.',
            }),
          ],
          meta: { page: 1, pageSize: 100, totalCount: 3 },
        },
      });
    });
    await page.goto(`${brandPath(APP_ROUTES.LIBRARY.ASSETS)}?view=grid`, {
      waitUntil: 'domcontentloaded',
    });
  });

  test('audio, voice and text sit in the masonry, not in a table below it', async ({
    authenticatedPage: page,
  }) => {
    await expect(
      page.getByRole('button', { name: 'Play preview for Lo-fi beat' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Play preview for Warm brand intro' }),
    ).toBeVisible();
    await expect(
      page.getByText('Ship the content, not the slide deck.'),
    ).toBeVisible();
    await expect(page.getByText('Other assets')).toHaveCount(0);
    await expect(page.getByRole('table')).toHaveCount(0);
  });

  test('selecting a tile does not play it, and playing a tile does not select it', async ({
    authenticatedPage: page,
  }) => {
    const music = page
      .locator('[data-masonry-item][data-selected]')
      .filter({ hasText: 'Lo-fi beat' });

    await music.hover();
    await music.getByRole('button', { name: 'Select asset' }).click();
    await expect(music).toHaveAttribute('data-selected', 'true');
    await expect(
      music.getByRole('button', { name: /^Play preview for/ }),
    ).toBeVisible();

    await music.getByRole('button', { name: 'Deselect asset' }).click();
    await music.getByRole('button', { name: /^Play preview for/ }).click();
    await expect(
      music.getByRole('button', { name: /^Pause preview for/ }),
    ).toBeVisible();
    await expect(music).toHaveAttribute('data-selected', 'false');
  });

  test('starting a second tile stops the first', async ({
    authenticatedPage: page,
  }) => {
    const music = page
      .locator('[data-masonry-item][data-selected]')
      .filter({ hasText: 'Lo-fi beat' });
    const voice = page
      .locator('[data-masonry-item][data-selected]')
      .filter({ hasText: 'Warm brand intro' });

    await music.getByRole('button', { name: /^Play preview for/ }).click();
    await expect(
      music.getByRole('button', { name: /^Pause preview for/ }),
    ).toBeVisible();

    await voice.getByRole('button', { name: /^Play preview for/ }).click();
    await expect(
      voice.getByRole('button', { name: /^Pause preview for/ }),
    ).toBeVisible();
    await expect(
      music.getByRole('button', { name: /^Play preview for/ }),
    ).toBeVisible();
  });
});
