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
  await page.keyboard.press('Escape');
  await expect(setupTrigger).toHaveAttribute('aria-expanded', 'false');

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
