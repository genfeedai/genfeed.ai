import { expect, test } from '../../fixtures/auth.fixture';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

const DESTINATIONS = [
  { anchor: 'appearance', label: 'Appearance' },
  { anchor: 'language', label: 'Language' },
  { anchor: 'features', label: 'Advanced Mode' },
];

const HOSTS = [
  '/settings/help',
  '/admin/overview/dashboard',
  '/agent/onboarding',
];

test.describe('Settings command navigation', () => {
  for (const host of HOSTS) {
    for (const { anchor, label } of DESTINATIONS) {
      test(`${host} reveals ${label} after navigation`, async ({
        authenticatedPage: page,
      }) => {
        await page.setViewportSize({ height: 600, width: 1280 });
        await page.goto(host, { waitUntil: 'domcontentloaded' });
        await expectNoErrorOverlay(page);

        const search = page.getByPlaceholder('Type a command or search…');
        await expect(async () => {
          if (!(await search.isVisible())) {
            await page.keyboard.press('Control+k');
          }
          await expect(search).toBeVisible({ timeout: 1_000 });
        }).toPass({ timeout: 30_000 });
        await search.fill(label);
        await page
          .getByRole('button', { name: new RegExp(`^${label}`) })
          .click();

        await expect(page).toHaveURL(
          new RegExp(`/settings/personal#${anchor}$`),
        );
        await expect(search).toBeHidden();
        await expect(page.locator(`#${anchor}`)).toBeInViewport();
        await expectNoErrorOverlay(page);
      });
    }
  }
});
