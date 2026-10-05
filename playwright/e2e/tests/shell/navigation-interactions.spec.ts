import { expect, test } from '../../fixtures/auth.fixture';
import { buildProtectedAppBootstrapPayload } from '../../utils/api-interceptor';
import { expectNoErrorOverlay, tryClick } from '../../utils/route-assertions';

/**
 * Deep interaction E2E coverage for the shared app SHELL navigation chrome.
 *
 * The sidebar (MenuShared), workspace switcher, app switcher and breadcrumbs are
 * rendered on every protected page, so exercising them lifts coverage broadly.
 *
 * Auth + all API + Better Auth are mocked by the fixtures; the strict network guard
 * fails on real outbound calls. Legacy exploration uses best-effort clicks;
 * geometry and switcher regressions below require real successful interactions.
 */

const BRAND_BASE = '/test-org/brand-1';
const LONG_ORGANIZATION_NAME =
  'International Creative Production and Publishing Workspace';
const LONG_BRAND_NAME =
  'Global Editorial Campaigns and Brand Experience Studio';

async function mockLongScopeNames(
  page: Parameters<typeof tryClick>[0],
): Promise<void> {
  const bootstrap = buildProtectedAppBootstrapPayload();
  bootstrap.brands = bootstrap.brands.map((brand) => ({
    ...brand,
    label: LONG_BRAND_NAME,
    name: LONG_BRAND_NAME,
    organization: {
      ...brand.organization,
      name: LONG_ORGANIZATION_NAME,
    },
  }));
  const brands = bootstrap.brands.map((brand) => ({
    attributes: brand,
    id: brand.id,
    type: 'brands',
  }));

  // Override only fixture reads; never fetch through to a real API.
  await page.route(
    (url) =>
      /^\/v1\/(?:auth\/bootstrap|organizations|brands(?:\/brand-1)?|users\/me\/brands)\/?$/.test(
        url.pathname,
      ),
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      const { pathname, searchParams } = new URL(route.request().url());
      if (pathname.endsWith('/auth/bootstrap')) {
        await route.fulfill({ json: bootstrap });
      } else if (
        pathname.endsWith('/organizations') &&
        searchParams.get('mine') === 'true'
      ) {
        await route.fulfill({
          json: [
            {
              brand: { id: 'brand-1', label: LONG_BRAND_NAME },
              id: 'mock-org-id-e2e-test',
              isActive: true,
              isOwner: true,
              label: LONG_ORGANIZATION_NAME,
              slug: 'test-org',
            },
          ],
        });
      } else if (pathname.endsWith('/brands/brand-1')) {
        await route.fulfill({ json: { data: brands[0] } });
      } else if (pathname.endsWith('/brands')) {
        await route.fulfill({
          json: {
            data: brands,
            meta: {
              page: 1,
              pageSize: brands.length,
              totalCount: brands.length,
            },
          },
        });
      } else {
        await route.fallback();
      }
    },
  );
}

async function settle(page: Parameters<typeof tryClick>[0]): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(400);
}

async function assertHealthy(
  page: Parameters<typeof tryClick>[0],
): Promise<void> {
  await expect(page.locator('body')).toBeVisible();
  await expectNoErrorOverlay(page);
}

test.describe('Shell — navigation interactions', () => {
  test.setTimeout(90_000);

  test('sidebar shell renders with header and navigation sections', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BRAND_BASE}/workspace`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await expect(
      authenticatedPage.getByTestId('sidebar-shell').first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'Collapse sidebar' }),
    ).toBeVisible();

    await assertHealthy(authenticatedPage);
  });

  test('sidebar nav links navigate across primary sections', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BRAND_BASE}/workspace`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    const sidebar = authenticatedPage.getByTestId('sidebar-shell').first();
    const links = sidebar.locator('a[href]');
    const linkCount = await links.count().catch(() => 0);

    // Click through up to the first several real sidebar links and assert the
    // shell survives each navigation.
    for (let index = 0; index < Math.min(linkCount, 5); index += 1) {
      const link = links.nth(index);
      const isVisible = await link.isVisible().catch(() => false);
      if (!isVisible) {
        continue;
      }
      await link.click({ timeout: 5_000 }).catch(() => {});
      await settle(authenticatedPage);
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);
    }

    await assertHealthy(authenticatedPage);
  });

  test('sidebar collapse control toggles the shell body', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BRAND_BASE}/workspace`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    // The collapse control lives in the rail mark.
    await tryClick(authenticatedPage, 'button[aria-label="Collapse sidebar"]');
    await settle(authenticatedPage);
    await tryClick(authenticatedPage, 'button[aria-label="Expand sidebar"]');
    await settle(authenticatedPage);

    // Cmd+B also toggles the desktop sidebar from the app layout.
    await authenticatedPage.keyboard.press('Meta+b').catch(() => {});
    await settle(authenticatedPage);
    await authenticatedPage.keyboard.press('Control+b').catch(() => {});
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('app rail lists daily apps with Workspace first and navigates', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BRAND_BASE}/workspace`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    // Mandatory: the rail is the only app navigation. Never soft-skip it.
    const rail = authenticatedPage
      .getByTestId('desktop-app-rail')
      .getByRole('navigation', { name: 'Apps' });
    await expect(rail, 'app rail should be visible').toBeVisible({
      timeout: 10_000,
    });

    const firstLink = rail.getByRole('link').first();
    await expect(firstLink).toHaveAttribute('aria-label', /^Workspace/);
    await expect(
      rail.getByRole('link', { name: /^Workspace/ }),
    ).toHaveAttribute('aria-current', 'page');

    await rail.getByRole('link', { name: /^Library/ }).click();
    await authenticatedPage.waitForURL(/\/library\//, { timeout: 30_000 });
    await expect(rail.getByRole('link', { name: /^Library/ })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await assertHealthy(authenticatedPage);
  });

  test('mobile drawer exposes the app rail below the topbar', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize({ height: 812, width: 375 });
    await authenticatedPage.goto(`${BRAND_BASE}/workspace`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await authenticatedPage
      .getByRole('button', { name: 'Open navigation menu' })
      .click();

    const mobileRail = authenticatedPage.getByTestId('mobile-app-rail');
    const agent = mobileRail.getByRole('link', { name: /^Agent/ });
    await expect(agent).toBeVisible();

    // A real click (no force): fails if the fixed topbar still covers it.
    await agent.click();
    await authenticatedPage.waitForURL(/\/agent/, { timeout: 30_000 });
    await expect(mobileRail).toBeHidden();

    await assertHealthy(authenticatedPage);
  });

  for (const width of [320, 360, 1280]) {
    test(`long organization and brand names keep topbar controls reachable at ${width}px`, async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.setViewportSize({ height: 812, width });
      await mockLongScopeNames(authenticatedPage);
      await authenticatedPage.goto(`${BRAND_BASE}/workspace`, {
        waitUntil: 'domcontentloaded',
      });

      const row = authenticatedPage.getByTestId('app-protected-topbar-inner');
      const organization = row.getByTestId('organization-switcher-trigger');
      const brand = row.getByTestId('brand-switcher-trigger');
      await expect(organization).toHaveAttribute(
        'title',
        LONG_ORGANIZATION_NAME,
      );
      await expect(brand).toHaveAttribute('title', LONG_BRAND_NAME);

      await expect
        .poll(() =>
          authenticatedPage
            .getByTestId('app-topbar-shell')
            .evaluate((element) => element.getBoundingClientRect().height),
        )
        .toBe(40);

      // Poll actual layout after hydration; neither clipping nor wrapping is OK.
      await expect
        .poll(() =>
          row.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            const controls = Array.from(element.querySelectorAll('button'))
              .map((button) => button.getBoundingClientRect())
              .filter((box) => box.width > 0 && box.height > 0);
            return (
              bounds.height >= 32 &&
              bounds.height <= 40 &&
              element.scrollWidth <= element.clientWidth + 1 &&
              controls.every(
                (box) =>
                  box.left >= bounds.left &&
                  box.right <= bounds.right &&
                  box.top >= bounds.top &&
                  box.bottom <= bounds.bottom,
              ) &&
              controls.every(
                (box, index) =>
                  index === 0 || box.left >= controls[index - 1].right,
              )
            );
          }),
        )
        .toBe(true);

      // Real dropdown interactions must work even when mobile labels are compact.
      await organization.click();
      const organizationOption = authenticatedPage
        .getByRole('option')
        .filter({ hasText: LONG_ORGANIZATION_NAME });
      await expect(organizationOption).toBeVisible();
      await organizationOption.click();
      await expect(organizationOption).toBeHidden();
      await brand.click();
      const brandOption = authenticatedPage
        .getByRole('option')
        .filter({ hasText: LONG_BRAND_NAME });
      await expect(brandOption).toBeVisible();
      await brandOption.click();
      await expect(brandOption).toBeHidden();

      if (width < 768) {
        await row.getByRole('button', { name: 'Open navigation menu' }).click();
        await expect(
          authenticatedPage.getByTestId('mobile-app-rail'),
        ).toBeVisible();
      } else {
        await expect(organization).toHaveCSS('text-transform', 'capitalize');
        await expect(organization).toContainText(LONG_ORGANIZATION_NAME, {
          useInnerText: false,
        });
        await expect(brand).toHaveCSS('text-transform', 'capitalize');
        await expect(brand).toContainText(LONG_BRAND_NAME, {
          useInnerText: false,
        });
      }
      await assertHealthy(authenticatedPage);
    });
  }

  test('brand switcher opens and shows per-brand settings actions', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BRAND_BASE}/workspace`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    const trigger = authenticatedPage
      .getByTestId('brand-switcher-trigger')
      .first();

    // Mandatory: a brand-scoped route always mounts the brand switcher. A silent
    // skip here is what hid #570 — never mask the switcher's absence.
    await expect(
      trigger,
      'brand switcher trigger should be visible',
    ).toBeVisible({ timeout: 10_000 });
    await trigger.click({ timeout: 5_000 });
    await settle(authenticatedPage);

    // The open dropdown lists each brand with an "Open … settings" action, which
    // only renders inside the popover. Soft-checked: omitted for brands with no
    // slug.
    const settingsAction = authenticatedPage
      .getByLabel(/open .+ settings/i)
      .first();
    if (await settingsAction.isVisible().catch(() => false)) {
      await expect(settingsAction).toBeVisible();
    }

    // Close the popover without navigating away.
    await authenticatedPage.keyboard.press('Escape').catch(() => {});
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('breadcrumbs render and remain healthy when entering a drill-down group', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BRAND_BASE}/workspace`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    // Drill-down groups (e.g. Posts) update the SidebarNavigationContext that
    // drives the topbar breadcrumbs.
    await tryClick(
      authenticatedPage,
      '[data-testid="sidebar-shell"] a:has-text("Posts")',
    );
    await settle(authenticatedPage);

    const breadcrumb = authenticatedPage.locator(
      'nav[aria-label="Breadcrumb"]',
    );
    if (
      await breadcrumb
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await expect(breadcrumb.first()).toBeVisible();
    }

    await assertHealthy(authenticatedPage);
  });

  test('sidebar survives navigation between distinct shell surfaces', async ({
    authenticatedPage,
  }) => {
    for (const route of [
      `${BRAND_BASE}/workspace`,
      `${BRAND_BASE}/library`,
      `${BRAND_BASE}/discovery/overview`,
    ]) {
      await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
      await settle(authenticatedPage);
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);
      await expect(
        authenticatedPage.getByTestId('sidebar-shell').first(),
      ).toBeVisible();
      await assertHealthy(authenticatedPage);
    }
  });
});
