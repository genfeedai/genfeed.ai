import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { expect, test } from '../../fixtures/onboarding.fixture';
import { setupOnboardingFirstDraftsMocks } from '../../utils/onboarding-first-drafts-mocks';

test.describe('Output-first onboarding', () => {
  test.setTimeout(120_000);
  test('confirms the brand link, previews content and restores without generating again', async ({
    onboardingPage: page,
  }) => {
    const { draftRequests } = await setupOnboardingFirstDraftsMocks(page);
    await page.reload();
    await expect(
      page.getByRole('textbox', { name: 'Website or social profile' }),
    ).toBeVisible();
    expect(draftRequests).toHaveLength(0);
    await page.getByRole('button', { name: 'Submit brand link' }).click();
    for (const platform of ['twitter', 'instagram', 'tiktok', 'linkedin'])
      await expect(page.getByText(`Round 1 ${platform} draft`)).toBeVisible();
    await expect(page.getByTestId('preview-account-header')).toHaveCount(4);
    await expect(
      page.getByRole('button', { name: 'Review drafts' }),
    ).toHaveAttribute('aria-current', 'step');
    await expect(page.getByRole('button', { name: /edit/i })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText('Round 1 twitter draft')).toBeVisible();
    expect(draftRequests).toHaveLength(1);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    for (const platform of ['instagram', 'tiktok', 'twitter', 'linkedin'])
      await expect(page.getByTestId(`connect-card-${platform}`)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Connect accounts' }),
    ).toHaveAttribute('aria-current', 'step');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByText('Round 1 twitter draft')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Review drafts' }),
    ).toHaveAttribute('aria-current', 'step');
    expect(draftRequests).toHaveLength(1);
  });

  test('offers an optional account connection before the scan', async ({
    onboardingPage: page,
  }) => {
    const { draftRequests } = await setupOnboardingFirstDraftsMocks(page);
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Connect your accounts (optional)' }),
    ).toBeVisible();
    for (const platform of ['twitter', 'instagram', 'tiktok', 'linkedin'])
      await expect(page.getByTestId(`connect-card-${platform}`)).toBeVisible();
    await expect(page.getByTestId('connect-card-youtube')).toHaveCount(0);
    await page.route('https://mock-oauth.example.com/**', (route) =>
      route.fulfill({ body: '<html></html>', contentType: 'text/html' }),
    );
    const connectRequest = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        request.url().includes('/services/twitter/connect'),
    );
    await page.getByRole('button', { name: 'Connect X' }).click();
    expect((await connectRequest).postDataJSON()).toMatchObject({
      brandId: expect.any(String),
    });
    expect(draftRequests).toHaveLength(0);
  });

  test('finishes onto the drafts that were just reviewed', async ({
    onboardingPage: page,
  }) => {
    await setupOnboardingFirstDraftsMocks(page);
    await page.reload();
    await page.getByRole('button', { name: 'Submit brand link' }).click();
    await expect(page.getByText('Round 1 twitter draft')).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByTestId('connect-card-twitter')).toBeVisible();
    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    await expect(page).toHaveURL(
      /\/test-org\/brand-1\/publishing\/posts\?status=draft$/,
    );
  });

  test('falls back to brand context when a public profile is blocked', async ({
    personalEmailOnboardingPage: page,
  }) => {
    await setupOnboardingFirstDraftsMocks(page, { isScanFailing: true });
    await page.getByRole('textbox').fill('https://instagram.com/brand');
    await page.getByRole('button', { name: 'Submit brand link' }).click();
    await expect(
      page.getByText("We couldn't read that link", { exact: false }),
    ).toBeVisible();
    await page
      .getByPlaceholder('Founders who ship fast')
      .fill('Indie founders');
    await page.getByRole('button', { name: 'Redo my posts' }).click();
    await expect(page.getByText('Round 1 twitter draft')).toBeVisible();
  });

  test('asks before skipping and can stay in onboarding', async ({
    personalEmailOnboardingPage: page,
  }) => {
    await page
      .getByRole('button', { name: 'Skip onboarding', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toContainText('better content');
    await page.getByRole('button', { name: 'Keep reviewing' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('textbox')).toBeVisible();
  });

  test('accepts brand context without a website', async ({
    personalEmailOnboardingPage: page,
  }) => {
    await page.getByRole('button', { name: "I don't have a link yet" }).click();
    await expect(page.getByText('Tell us what we missed')).toBeVisible();
  });

  test('asks for a real web address instead of scanning a typo', async ({
    personalEmailOnboardingPage: page,
  }) => {
    const { draftRequests } = await setupOnboardingFirstDraftsMocks(page);
    await page.getByRole('textbox').fill('na');
    await page.getByRole('button', { name: 'Submit brand link' }).click();
    await expect(
      page.getByText('doesn’t look like a web address', { exact: false }),
    ).toBeVisible();
    expect(draftRequests).toHaveLength(0);
  });

  test('keeps the onboarding entry route', async ({ onboardingPage: page }) => {
    await page.goto(APP_ROUTES.ONBOARDING.ROOT);
    await expect(page).toHaveURL(new RegExp(`${APP_ROUTES.ONBOARDING.BRAND}$`));
  });
});
