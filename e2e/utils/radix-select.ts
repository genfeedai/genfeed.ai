import { expect, type Locator, type Page } from '@playwright/test';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function selectVisibleRadixOption(
  page: Page,
  trigger: Locator,
  label: string,
): Promise<void> {
  const isExpanded = (await trigger.getAttribute('aria-expanded')) === 'true';
  if (!isExpanded) {
    await trigger.click();
  }

  const option = page
    .locator('[role="option"]:visible')
    .filter({ hasText: new RegExp(`^${escapeRegex(label)}$`) })
    .first();

  await expect(option).toBeVisible();
  await option.click();
  await expect(trigger).toContainText(label);
}
