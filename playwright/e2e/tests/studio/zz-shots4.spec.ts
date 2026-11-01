import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { test } from '../../fixtures/auth.fixture';

const out = '/mnt/project-files/storyboard-new-agent-layout';

test('shots', async ({ authenticatedPage: page }) => {
  test.setTimeout(180_000);
  await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/test-org/brand-1/storyboard/new');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}/3-brief-mode.png` });
  await page.getByRole('combobox', { name: 'Storyboard source' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/4-source-dropdown.png` });
  await page.getByRole('option', { name: 'Slideshow', exact: true }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/5-slideshow-mode.png` });
  await page.getByRole('button', { name: 'Quick tips' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/6-slideshow-picked.png` });
});
