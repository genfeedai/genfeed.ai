import { AdminPage } from '@e2e/pages/admin.page';
import { DiscoverPage } from '@e2e/pages/discover.page';
import { StudioPage } from '@e2e/pages/studio.page';
import { expect, test } from '@playwright/test';

const pageObjects = [AdminPage, DiscoverPage, StudioPage] as const;

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
