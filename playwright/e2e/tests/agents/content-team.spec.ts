import { APP_ROUTES } from '@genfeedai/constants';
import {
  mockActiveSubscription,
  mockAutomationData,
  mockBrandsData,
  mockWorkflowCrud,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';
import { skipIfPlaywrightAuthBypassed } from '../../utils/playwright-auth-bypass';

test.describe('Agents — Content Team', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockBrandsData(authenticatedPage, 2);
    await mockAutomationData(authenticatedPage);
    await mockWorkflowCrud(authenticatedPage, []);
  });

  test('agents page owns the agent library and creation control', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(brandPath(APP_ROUTES.AUTOMATION.AGENTS), {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/automation\/agents/);
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Agents' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'Add agent' }),
    ).toBeVisible();
  });

  test('legacy hire route opens the agent library dialog', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(brandPath(APP_ROUTES.AUTOMATION.HIRE), {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(
      /\/automation\/agents\?add=library$/,
    );
    await expect(authenticatedPage.getByRole('dialog')).toBeVisible();

    await authenticatedPage
      .getByLabel('Agent Label')
      .fill('Instagram Shorts Captain');
    await authenticatedPage
      .getByLabel('Primary Topic')
      .fill('AI creator monetization');
    await authenticatedPage.getByRole('button', { name: 'Add agent' }).click();

    await expect
      .poll(() => new URL(authenticatedPage.url()).pathname)
      .toBe(brandPath(APP_ROUTES.AUTOMATION.AGENTS));
    await expect(authenticatedPage.getByRole('dialog')).toBeHidden();
  });

  test('legacy orchestrator route opens the Creator Studio Program template', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      brandPath(APP_ROUTES.AUTOMATION.ORCHESTRATOR),
      {
        waitUntil: 'domcontentloaded',
      },
    );

    await expect(authenticatedPage).toHaveURL(
      /\/automation\/campaigns\/new\?template=creator-studio$/,
    );
    await expect(authenticatedPage.locator('form').first()).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: /Creator Studio/ }),
    ).toHaveAttribute('aria-pressed', 'true');

    await authenticatedPage
      .locator('#agent-campaign-label')
      .fill('Creator Growth Machine');
    await authenticatedPage
      .locator('#agent-campaign-brief')
      .fill('Coordinate a multi-role creator launch.');
    await authenticatedPage
      .locator('#agent-campaign-start-date')
      .fill('2026-09-01');
    await authenticatedPage
      .getByRole('button', { name: 'Create Program' })
      .click();

    await expect
      .poll(() => new URL(authenticatedPage.url()).pathname)
      .toBe(
        `${brandPath(APP_ROUTES.AUTOMATION.CAMPAIGNS)}/agent-campaign-created`,
      );
    await expect(
      authenticatedPage.getByRole('heading', {
        name: 'Creator Growth Machine',
      }),
    ).toBeVisible();
    await expect(authenticatedPage.getByText('Growth Autopilot')).toBeVisible();
  });
});

test.describe('Agents — Content Team — Unauthenticated Access', () => {
  test('unauthenticated user is redirected from content team routes', async ({
    unauthenticatedPage,
  }) => {
    skipIfPlaywrightAuthBypassed();

    await unauthenticatedPage.goto(APP_ROUTES.AUTOMATION.ROOT, {
      waitUntil: 'domcontentloaded',
    });
    await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
      timeout: 15000,
    });
    expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
  });
});
