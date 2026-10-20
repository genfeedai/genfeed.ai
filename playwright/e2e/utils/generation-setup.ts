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
