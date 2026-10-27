import { expect, type Page } from '@playwright/test';

/**
 * Pick a model in Advanced mode. Auto delegates routing, so an explicit model
 * needs Advanced. The Auto/Advanced mode is one button at the start of the
 * prompt bar that names the current mode and switches to the other; Model,
 * Output, Look, Brand and Presets are chips (`GenerationSetupSectionChips`),
 * each opening only its own section.
 */
export async function selectAdvancedModel(
  page: Page,
  modelLabel: string,
): Promise<void> {
  const mode = page.getByRole('button', { name: /^Setup mode: / });
  await expect(mode).toBeVisible();
  if ((await mode.getAttribute('aria-label')) === 'Setup mode: Auto') {
    await mode.click();
  }

  await page
    .getByTestId('generation-setup-section-chips')
    .getByRole('button', { name: 'Configure Model', exact: true })
    .click();
  // Catalog models sit under their family row ("FLUX.3" with a model count);
  // opening it lists the family's own models in a dialog named after the
  // family. A model without a family is picked straight from the list.
  const row = page.getByRole('option').filter({ hasText: modelLabel }).first();
  await expect(row).toBeVisible();
  await row.click();
  const family = page.getByRole('dialog', { name: modelLabel });
  const isFamily = await family
    .waitFor({ state: 'visible', timeout: 2_000 })
    .then(
      () => true,
      () => false,
    );
  if (isFamily) {
    await family
      .getByRole('option')
      .filter({ has: page.getByText(modelLabel, { exact: true }) })
      .click();
  }
}

/**
 * Studio prices Auto or unpriced choices with the server quote before a paid
 * submit (`POST /v1/router/estimate-generation-credits`, a raw body without a
 * JSON:API wrapper). Specs that submit a generation answer that quote here so
 * the submit goes ahead instead of a "price could not be confirmed" notice.
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
