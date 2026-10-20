import type { Page } from '@playwright/test';

/**
 * Pick a model in Advanced mode. Auto delegates routing, so an explicit model
 * needs Advanced. The Auto/Advanced switch is an icon pair at the start of the
 * prompt bar; Model, Output, Look, Brand and Presets are chips
 * (`GenerationSetupSectionChips`), each opening only its own section.
 */
export async function selectAdvancedModel(
  page: Page,
  modelLabel: string,
): Promise<void> {
  await page
    .getByRole('group', { name: 'Setup mode' })
    .getByRole('button', { name: 'Advanced', exact: true })
    .click();

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
