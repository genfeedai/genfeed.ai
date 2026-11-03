import { expect, type Page } from '@playwright/test';

/**
 * A creative app's starter cards each show an illustration of what the prompt
 * makes. The images are lazy, so scroll each one into view and wait until it
 * has actually decoded: a 404 leaves a card with an empty grey tile.
 */
export async function expectStarterThumbnails(
  page: Page,
  count: number,
): Promise<void> {
  const cards = page
    .getByRole('toolbar', { name: 'Prompt suggestions' })
    .first();
  await expect(cards).toBeVisible({ timeout: 30_000 });
  const images = cards.locator('img');
  await expect(images).toHaveCount(count);
  for (let index = 0; index < count; index += 1) {
    const image = images.nth(index);
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBeGreaterThan(0);
  }
}
