import { expect, type Page } from '@playwright/test';

/**
 * Pick a model in Advanced mode. Auto delegates routing, so an explicit model
 * needs Advanced. The setup popover only lists the type tiles, Brand and
 * Presets; Model, Output and Look are chips in the prompt bar
 * (`GenerationSetupSectionChips`), each opening only its own section.
 */
export async function selectAdvancedModel(
  page: Page,
  modelLabel: string,
): Promise<void> {
  const setupTrigger = page.getByRole('button', {
    name: /^Generation setup:/,
  });
  await setupTrigger.click();
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  // A resting pointer can open the Presets submenu next to Advanced, so the
  // first Escape may only close that submenu. Keep pressing until the popover
  // itself is closed.
  await expect(async () => {
    if ((await setupTrigger.getAttribute('aria-expanded')) !== 'false') {
      await page.keyboard.press('Escape');
    }
    await expect(setupTrigger).toHaveAttribute('aria-expanded', 'false', {
      timeout: 500,
    });
  }).toPass({ timeout: 10_000 });

  await page
    .getByTestId('generation-setup-section-chips')
    .getByRole('button', { name: 'Configure Model', exact: true })
    .click();
  await page
    .getByRole('option')
    .filter({ hasText: modelLabel })
    .first()
    .click();
}
