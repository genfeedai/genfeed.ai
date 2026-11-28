import { expect, test } from '@playwright/test';
import { PRESET_CATALOG } from '../../../../packages/contracts/src/constants/preset-catalog.constant';
import { presetSlug } from '../../../../packages/contracts/src/constants/preset-slug.constant';

/** The presets that have an example: only these get a card and a page. */
const published = PRESET_CATALOG.filter((preset) => preset.examples.length > 0);

test.describe('Website preset pages', () => {
  test('/presets lists every preset that has an example, and links each page', async ({
    page,
  }) => {
    test.skip(published.length === 0, 'No catalog preset has an example yet');

    await page.goto('/presets', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', { level: 1, name: 'Presets' }),
    ).toBeVisible();
    for (const preset of published) {
      await expect(
        page
          .locator(`main a[href="/presets/${presetSlug(preset.label)}"]`)
          .first(),
      ).toBeVisible();
    }
  });

  test('no preset page exists until its preset has an example', async ({
    request,
  }) => {
    for (const preset of PRESET_CATALOG.filter(
      (candidate) => candidate.examples.length === 0,
    )) {
      const response = await request.get(
        `/presets/${presetSlug(preset.label)}`,
      );
      expect(response.status(), preset.key).toBe(404);
    }
    if (published.length === 0)
      expect((await request.get('/presets')).status()).toBe(404);
  });

  for (const preset of published) {
    test(`${preset.label} shows its example, recipe and how to run it`, async ({
      page,
    }) => {
      await page.goto(`/presets/${presetSlug(preset.label)}`, {
        waitUntil: 'domcontentloaded',
      });

      await expect(
        page.getByRole('heading', { level: 1, name: preset.label }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { level: 2, name: 'What it makes' }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { level: 2, name: 'The recipe' }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Copy Recipe' }),
      ).toBeVisible();
      await expect(page.getByText(preset.key).first()).toBeVisible();
    });
  }
});
