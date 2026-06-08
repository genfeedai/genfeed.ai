import { expect, type Page } from '@playwright/test';
import { expectNoErrorOverlay } from './route-assertions';

/**
 * Shared best-effort interaction helpers for the deep-interaction E2E specs.
 *
 * These keep the interaction specs DRY: deterministic settling, a standard
 * end-of-test health assertion, and guarded prompt/field fills that never throw
 * when a control is missing.
 *
 * @module interaction-helpers
 */

const PROMPT_SELECTORS = [
  '[data-testid="prompt-textarea"]',
  '[data-testid="prompt-input"]',
  'textarea',
];

/**
 * Wait for the page to settle without an arbitrary timeout: first the DOM is
 * parsed, then the network goes idle (bounded, best-effort).
 *
 * @param page - Playwright page
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page
    .waitForLoadState('networkidle', { timeout: 5_000 })
    .catch(() => {});
}

/**
 * Standard end-of-test health assertion: a visible body, no framework error
 * overlay, and no redirect to /login.
 *
 * @param page - Playwright page
 */
export async function assertHealthy(page: Page): Promise<void> {
  await expect(page.locator('body')).toBeVisible();
  await expectNoErrorOverlay(page);
  expect(page.url()).not.toMatch(/\/login/);
}

/**
 * Best-effort: fill the first visible prompt field with text. Never throws.
 *
 * @param page - Playwright page
 * @param text - Prompt text to enter
 */
export async function fillPrompt(page: Page, text: string): Promise<void> {
  for (const selector of PROMPT_SELECTORS) {
    const field = page.locator(selector).first();
    const isVisible = await field.isVisible().catch(() => false);
    if (isVisible) {
      await field.fill(text).catch(() => {});
      return;
    }
  }
}

/**
 * Best-effort: fill a field matched by `selector` with `value` when visible.
 *
 * @param page - Playwright page
 * @param selector - CSS / text selector for the field
 * @param value - Value to fill
 */
export async function fillField(
  page: Page,
  selector: string,
  value: string,
): Promise<void> {
  const field = page.locator(selector).first();
  const isVisible = await field.isVisible().catch(() => false);
  if (isVisible) {
    await field.fill(value).catch(() => {});
  }
}
