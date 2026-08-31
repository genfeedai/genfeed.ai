import { AdminPage } from '@e2e/pages/admin.page';
import { DiscoveryPage } from '@e2e/pages/discovery.page';
import { StudioPage } from '@e2e/pages/studio.page';
import { expect, test } from '@playwright/test';

const pageObjects = [AdminPage, DiscoveryPage, StudioPage] as const;

test.describe('Sidebar page-object compatibility', () => {
  for (const testId of ['sidebar-shell', 'sidebar']) {
    test(`resolves the ${testId} identifier`, async ({ page }) => {
      await page.setContent(
        `<aside data-testid="${testId}">Navigation</aside>`,
      );

      for (const PageObject of pageObjects) {
        await expect(new PageObject(page).sidebar).toBeVisible();
      }
    });
  }
});
