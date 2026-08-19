import { expect, test } from '@playwright/test';
import { AdminPage } from '../../pages/admin.page';
import { DiscoverPage } from '../../pages/discover.page';
import { StudioPage } from '../../pages/studio.page';

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
