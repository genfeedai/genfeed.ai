import {
  mockActiveSubscription,
  mockAnalyticsData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { ResearchPage } from '../../pages/research.page';

/**
 * E2E Tests for Research Section
 *
 * Tests verify /research (redirects to /research/discovery),
 * /research/discovery, /research/socials, /research/ads,
 * /research/ads/google, and /research/ads/meta pages.
 * All API calls are mocked - no real backend requests occur.
 */
test.describe('Research Section', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockAnalyticsData(authenticatedPage);
  });

  test.describe('Discovery Page', () => {
    test('should redirect /research to /research/discovery', async ({
      authenticatedPage,
    }) => {
      const researchPage = new ResearchPage(authenticatedPage);

      await researchPage.goto('/research');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveURL(/research\/discovery/);
    });

    test('should display /research/discovery with main content', async ({
      authenticatedPage,
    }) => {
      const researchPage = new ResearchPage(authenticatedPage);

      await researchPage.gotoSection('discovery');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveURL(/research\/discovery/);
      await expect(researchPage.mainContent).toBeVisible();
    });

    test('should have proper page title for discovery', async ({
      authenticatedPage,
    }) => {
      const researchPage = new ResearchPage(authenticatedPage);

      await researchPage.gotoSection('discovery');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveTitle(
        /Research|Discovery|Genfeed/i,
      );
    });

    test('should display sidebar on discovery page', async ({
      authenticatedPage,
    }) => {
      const researchPage = new ResearchPage(authenticatedPage);

      await researchPage.gotoSection('discovery');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(researchPage.sidebar).toBeVisible();
    });
  });

  test.describe('Socials Page', () => {
    test('should display /research/socials with main content', async ({
      authenticatedPage,
    }) => {
      const researchPage = new ResearchPage(authenticatedPage);

      await researchPage.gotoSection('socials');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveURL(/research\/socials/);
      await expect(researchPage.mainContent).toBeVisible();
      await expect(
        authenticatedPage.getByRole('tab', { name: 'Overview' }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByText('Total Posts', { exact: true }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByRole('heading', { name: 'Viral Videos' }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByRole('heading', {
          name: 'Trending Content Feed',
        }),
      ).toBeVisible();
    });

    test('should have proper page title for socials', async ({
      authenticatedPage,
    }) => {
      const researchPage = new ResearchPage(authenticatedPage);

      await researchPage.gotoSection('socials');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveTitle(/Social|Research|Genfeed/i);
    });
  });

  test.describe('Ads Research Pages', () => {
    test('should display /research/ads with main content', async ({
      authenticatedPage,
    }) => {
      const researchPage = new ResearchPage(authenticatedPage);

      await researchPage.gotoSection('ads');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveURL(/research\/ads/);
      await expect(researchPage.mainContent).toBeVisible();
      await expect(
        authenticatedPage.getByRole('tab', { name: 'Overview' }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByText('Public Winners', { exact: true }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByRole('heading', {
          name: 'Public Niche Winners',
        }),
      ).toBeVisible();
    });

    test('should have proper page title for ads', async ({
      authenticatedPage,
    }) => {
      const researchPage = new ResearchPage(authenticatedPage);

      await researchPage.gotoSection('ads');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveTitle(
        /Ads|Intelligence|Research|Genfeed/i,
      );
    });

    test('should display /research/ads/google with main content', async ({
      authenticatedPage,
    }) => {
      const researchPage = new ResearchPage(authenticatedPage);

      await researchPage.gotoSection('ads/google');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveURL(/research\/ads\/google/);
      await expect(researchPage.mainContent).toBeVisible();
    });

    test('should have proper page title for Google ads', async ({
      authenticatedPage,
    }) => {
      const researchPage = new ResearchPage(authenticatedPage);

      await researchPage.gotoSection('ads/google');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveTitle(
        /Google|Ads|Research|Genfeed/i,
      );
    });

    test('should display /research/ads/meta with main content', async ({
      authenticatedPage,
    }) => {
      const researchPage = new ResearchPage(authenticatedPage);

      await researchPage.gotoSection('ads/meta');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveURL(/research\/ads\/meta/);
      await expect(researchPage.mainContent).toBeVisible();
    });

    test('should have proper page title for Meta ads', async ({
      authenticatedPage,
    }) => {
      const researchPage = new ResearchPage(authenticatedPage);

      await researchPage.gotoSection('ads/meta');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveTitle(/Meta|Ads|Research|Genfeed/i);
    });
  });

  test.describe('Navigation', () => {
    test('should maintain state after page refresh on discovery', async ({
      authenticatedPage,
    }) => {
      const researchPage = new ResearchPage(authenticatedPage);

      await researchPage.gotoSection('discovery');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await authenticatedPage.reload();
      await researchPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/research\/discovery/);
      await expect(researchPage.mainContent).toBeVisible();
    });

    test('should handle browser back from ads to discovery', async ({
      authenticatedPage,
    }) => {
      const researchPage = new ResearchPage(authenticatedPage);

      await researchPage.gotoSection('discovery');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await researchPage.gotoSection('ads');
      await expect(authenticatedPage).toHaveURL(/research\/ads/);

      await authenticatedPage.goBack();
      await expect(authenticatedPage).toHaveURL(/research\/discovery/);
    });

    test('should display a platform research page with content feed', async ({
      authenticatedPage,
    }) => {
      const researchPage = new ResearchPage(authenticatedPage);

      await researchPage.goto('/research/twitter');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveURL(/research\/twitter/);
      await expect(researchPage.mainContent).toBeVisible();
      await expect(
        authenticatedPage.getByRole('tab', { name: 'X' }),
      ).toBeVisible();
    });
  });
});

test.describe('Research — Unauthenticated Access', () => {
  test('should redirect unauthenticated user from /research to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/research');
    await unauthenticatedPage.waitForLoadState('domcontentloaded');

    await expect(unauthenticatedPage).toHaveURL(/login|sign-in/, {
      timeout: 10000,
    });
  });

  test('should redirect unauthenticated user from /research/discovery to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/research/discovery');
    await unauthenticatedPage.waitForLoadState('domcontentloaded');

    await expect(unauthenticatedPage).toHaveURL(/login|sign-in/, {
      timeout: 10000,
    });
  });

  test('should redirect unauthenticated user from /research/ads to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/research/ads');
    await unauthenticatedPage.waitForLoadState('domcontentloaded');

    await expect(unauthenticatedPage).toHaveURL(/login|sign-in/, {
      timeout: 10000,
    });
  });
});
