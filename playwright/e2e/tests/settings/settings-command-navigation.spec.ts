import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { expect, test } from '../../fixtures/auth.fixture';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

const DESTINATIONS = [
  { anchor: 'appearance', label: 'Appearance' },
  { anchor: 'language', label: 'Language' },
];

const HOSTS = ['/settings/help', '/admin/overview/dashboard'];

test.describe('Settings command navigation', () => {
  for (const host of HOSTS) {
    for (const { anchor, label } of DESTINATIONS) {
      test(`${host} reveals ${label} after navigation`, async ({
        authenticatedPage: page,
      }) => {
        await page.setViewportSize({ height: 320, width: 1280 });
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
        await expect(page.locator(`#${anchor}`)).toBeInViewport({ ratio: 1 });
        await expectNoErrorOverlay(page);
      });
    }
  }

  // Agent onboarding holds the user in the flow (#7089), so the command
  // palette is not a way out of it.
  test('/agent/onboarding keeps the command palette closed', async ({
    authenticatedPage: page,
  }) => {
    await page.goto(APP_ROUTES.AGENT.ONBOARDING, {
      waitUntil: 'domcontentloaded',
    });
    await expectNoErrorOverlay(page);

    await page.keyboard.press('Control+k');
    // Give a palette that wrongly opens time to mount before asserting.
    await page.waitForTimeout(500);

    await expect(
      page.getByPlaceholder('Type a command or search…'),
    ).toBeHidden();
    await expect(page).toHaveURL(/\/agent\/onboarding/);
  });
});
