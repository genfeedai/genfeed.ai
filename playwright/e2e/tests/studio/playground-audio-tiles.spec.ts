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

function audioIngredient(
  id: string,
  category: 'MUSIC' | 'VOICE',
  prompt: string,
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
      cdnUrl: `https://cdn.genfeed.ai/mock/${id}.wav`,
      createdAt: '2026-11-04T08:28:00Z',
      prompt: { original: prompt },
      metadata: { label: prompt, duration: SECONDS },
    },
  };
}

test.describe('Playground audio tiles', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
    await page.setViewportSize({ width: 1500, height: 950 });
    await page.route('**/cdn.genfeed.ai/mock/*.wav', (route) =>
      route.fulfill({ body: silentWav(), contentType: 'audio/wav' }),
    );
    await page.route('**/v1/ingredients**', (route) => {
      const url = new URL(route.request().url());
      if (/\/(posts|children)$/.test(url.pathname)) {
        return route.fulfill({ json: { data: [] } });
      }
      return route.fulfill({
        json: {
          data: [
            audioIngredient('lofi-beat', 'MUSIC', 'Lo-fi beat, warm vinyl'),
            audioIngredient('brand-intro', 'VOICE', 'Warm brand intro'),
          ],
          meta: { page: 1, pageSize: 100, totalCount: 2 },
        },
      });
    });
    await page.goto(brandPath(APP_ROUTES.STUDIO.PLAYGROUND), {
      waitUntil: 'domcontentloaded',
    });
  });

  test('music and voice show as content-sized tiles with a scrubbable waveform', async ({
    authenticatedPage: page,
  }) => {
    for (const id of ['lofi-beat', 'brand-intro']) {
      const card = page.getByTestId(`studio-asset-${id}`);
      await expect(card).toBeVisible();
      await expect(card.getByRole('slider', { name: /^Seek/ })).toBeVisible();
      await expect(
        card.getByRole('button', { name: /^Play preview for/ }),
      ).toBeVisible();

      // The old card was a tall empty frame; a tile is wider than it is tall.
      const box = await card.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(
        box?.width ?? 0,
      );
    }
    await expect(
      page.getByTestId('studio-asset-lofi-beat').getByText('0:00 / 0:30'),
    ).toBeVisible();
  });

  test('playing a tile does not select the card, and starting another stops the first', async ({
    authenticatedPage: page,
  }) => {
    const music = page.getByTestId('studio-asset-lofi-beat');
    const voice = page.getByTestId('studio-asset-brand-intro');

    await music.getByRole('button', { name: /^Play preview for/ }).click();
    await expect(
      music.getByRole('button', { name: /^Pause preview for/ }),
    ).toBeVisible();
    await expect(music).not.toHaveClass(/gen-selected-card/);

    await voice.getByRole('button', { name: /^Play preview for/ }).click();
    await expect(
      voice.getByRole('button', { name: /^Pause preview for/ }),
    ).toBeVisible();
    await expect(
      music.getByRole('button', { name: /^Play preview for/ }),
    ).toBeVisible();
  });
});
