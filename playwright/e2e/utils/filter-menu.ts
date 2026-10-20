import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The shared `FilterMenu` (#7567) is one "Filters" button whose facets are
 * submenus: single-choice facets list `menuitemradio` rows, multi-choice
 * facets list `menuitemcheckbox` rows. Submenus are keyboard-operable, so the
 * helper opens one the same way a keyboard user does: focus the facet row,
 * press ArrowRight.
 */
export function filtersTrigger(scope: Page | Locator): Locator {
  return scope.getByRole('button', { name: /^Filters/ });
}

/**
 * Opens the Filters menu (when closed) and one facet's submenu, and returns
 * the submenu so callers pick its radio or checkbox rows. A facet row is named
 * its label followed by the current summary (for example "StatusAll"), hence
 * the prefix match. While the menu is open the rest of the page is aria-hidden
 * (Radix modal menu), so role queries outside it find nothing until it closes.
 */
export async function openFilterFacet(
  page: Page,
  facet: string,
  scope: Page | Locator = page,
): Promise<Locator> {
  const name = new RegExp(`^${facet}`);
  const row = page.getByRole('menuitem', { name });
  if (!(await row.isVisible())) {
    const trigger = filtersTrigger(scope);
    await expect(trigger).toBeVisible();
    await trigger.click();
  }

  await expect(row).toBeVisible();
  await row.focus();
  await row.press('ArrowRight');
  await expect(row).toHaveAttribute('aria-expanded', 'true');

  const submenu = page.getByRole('menu', { name });
  await expect(submenu).toBeVisible();
  return submenu;
}
