import type { Page } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';

interface ModalGlobalState {
  appRootAriaHidden: string | null;
  appRootInert: boolean;
  bodyOverflow: string;
  bodyPointerEvents: string;
  dataScrollLocked: string | null;
}

async function setStaleModalGlobalState(page: Page): Promise<void> {
  await page.evaluate(() => {
    const appRoot = Array.from(document.body.children).find(
      (element) =>
        !['SCRIPT', 'STYLE', 'LINK', 'META'].includes(element.tagName),
    );

    document.body.style.pointerEvents = 'none';
    document.body.style.overflow = 'hidden';
    document.body.setAttribute('data-scroll-locked', '1');
    appRoot?.setAttribute('aria-hidden', 'true');
    appRoot?.setAttribute('inert', '');
  });
}

async function readModalGlobalState(page: Page): Promise<ModalGlobalState> {
  return page.evaluate(() => {
    const appRoot = Array.from(document.body.children).find(
      (element) =>
        !['SCRIPT', 'STYLE', 'LINK', 'META'].includes(element.tagName),
    );

    return {
      appRootAriaHidden: appRoot?.getAttribute('aria-hidden') ?? null,
      appRootInert: appRoot?.hasAttribute('inert') ?? false,
      bodyOverflow: document.body.style.overflow,
      bodyPointerEvents: document.body.style.pointerEvents,
      dataScrollLocked: document.body.getAttribute('data-scroll-locked'),
    };
  });
}

test.describe('Modal cleanup', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  test('route transitions clear stale modal body and app-root locks', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/workspace/overview');
    // Page h1 is "Dashboard" (level 1); "Workspace" now lives in the breadcrumb.
    await expect(
      authenticatedPage.getByRole('heading', { level: 1, name: 'Dashboard' }),
    ).toBeVisible();

    await setStaleModalGlobalState(authenticatedPage);

    await authenticatedPage
      .getByRole('link', { name: 'Open Inbox' })
      .evaluate((link) => (link as HTMLAnchorElement).click());

    await expect(authenticatedPage).toHaveURL(/\/workspace\/inbox\/unread/);
    await expect
      .poll(() => readModalGlobalState(authenticatedPage))
      .toEqual({
        appRootAriaHidden: null,
        appRootInert: false,
        bodyOverflow: '',
        bodyPointerEvents: '',
        dataScrollLocked: null,
      });
  });
});
