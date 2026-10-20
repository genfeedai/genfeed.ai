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

/**
 * Studio asks the operator to confirm the price before any paid submit, and
 * prices Auto or unpriced choices with the server quote
 * (`POST /v1/router/estimate-generation-credits`, a raw body without a JSON:API
 * wrapper). Specs that submit a generation answer that quote here so the
 * confirmation opens instead of a "price could not be confirmed" notice.
 */
export async function mockGenerationQuote(
  page: Page,
  {
    credits = 8,
    routedModelKey,
  }: { credits?: number; routedModelKey?: string } = {},
): Promise<void> {
  await page.route(
    '**/v1/router/estimate-generation-credits',
    async (route) => {
      const body = route.request().postDataJSON() as {
        modelKey?: string;
      } | null;
      const modelKey = body?.modelKey ?? routedModelKey;
      await route.fulfill({
        json: {
          credits,
          isAvailable: true,
          ...(modelKey ? { modelKey } : {}),
        },
      });
    },
  );
}

/** The price confirmation that opens before a paid Studio submit. */
export function spendConfirmation(page: Page) {
  return page.getByRole('dialog').filter({ hasText: /Generate for \d/ });
}

/** Approves the price shown in the Studio confirmation. */
export async function confirmGenerationSpend(page: Page): Promise<void> {
  const dialog = spendConfirmation(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Generate', exact: true }).click();
}
