import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { z } from 'zod';
import { createPlaywrightMockApiRoutePattern } from '../../config/environment';
import { expect, test } from '../../fixtures/auth.fixture';
import {
  buildProtectedAppBootstrapPayload,
  generateMockApiUser,
  generateMockOrganizationSettings,
} from '../../utils/api-interceptor';
import { orgPath } from '../../utils/app-chrome';

test.describe('Inline account cards', () => {
  test.setTimeout(120_000);

  test('profile edits persist, failed saves keep the draft, and onboarding resets only after confirmation', async ({
    adminPage: page,
  }) => {
    let user = generateMockApiUser({
      id: 'qa-inline-user',
      firstName: 'Jane',
      lastName: 'Example',
      email: 'jane@example.com',
      handle: 'jane',
      platformRole: 'USER',
    });
    let writes = 0;
    let failNextSave = true;
    await page.route(
      createPlaywrightMockApiRoutePattern(
        'users/qa-inline-user(?:/[^?]*)?(?:\\?.*)?$',
      ),
      async (route) => {
        const request = route.request();
        if (request.method() === 'PATCH') {
          writes++;
          if (failNextSave) {
            failNextSave = false;
            await route.fulfill({
              status: 503,
              json: {
                errors: [
                  {
                    status: '503',
                    title: 'Service Unavailable',
                    detail: 'Please retry this save',
                  },
                ],
              },
            });
            return;
          }
          const profile = z
            .object({
              firstName: z.string(),
              lastName: z.string(),
              handle: z.string(),
            })
            .parse(request.postDataJSON());
          user = { ...user, ...profile };
        }
        if (request.method() === 'POST') {
          writes++;
          expect(request.url()).toContain('/onboarding/reset');
          user = {
            ...user,
            isOnboardingCompleted: false,
            onboardingStartedAt: null,
            onboardingCompletedAt: null,
            onboardingType: null,
            onboardingStepsCompleted: [],
          };
        }
        await route.fulfill({
          json: {
            data: { id: 'qa-inline-user', type: 'users', attributes: user },
          },
        });
      },
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${APP_ROUTES.ADMIN.ADMINISTRATION.USERS}/qa-inline-user`);
    await page
      .getByRole('button', { name: 'Edit profile', exact: true })
      .click();
    await page.getByLabel('First name', { exact: true }).fill('Draft');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(writes).toBe(0);
    await page
      .getByRole('button', { name: 'Edit profile', exact: true })
      .click();
    await expect(page.getByLabel('First name', { exact: true })).toHaveValue(
      'Jane',
    );
    await page.getByLabel('First name', { exact: true }).fill('Janet');
    await page.screenshot({
      path: test.info().outputPath('user-edit-wide.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Please retry this save' }),
    ).toBeVisible();
    await expect(page.getByLabel('First name', { exact: true })).toHaveValue(
      'Janet',
    );
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Janet Example', exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Janet Example', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Reset onboarding', exact: true })
      .click();
    expect(writes).toBe(2);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(writes).toBe(2);
    await page
      .getByRole('button', { name: 'Reset onboarding', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Confirm reset', exact: true })
      .click();
    await expect(page.getByText('In progress', { exact: true })).toBeVisible();
    expect(writes).toBe(3);
    await page.reload();
    await expect(page.getByText('In progress', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole('button', { name: 'Edit profile', exact: true })
      .click();
    await expect(page.getByLabel('First name', { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: test.info().outputPath('user-edit-narrow.png'),
      fullPage: true,
    });
  });

  test('member edits update role, brand assignment and active state in the list and detail card', async ({
    adminPage: page,
  }) => {
    let writes = 0;
    await page.route(
      createPlaywrightMockApiRoutePattern('auth/bootstrap(?:\\?.*)?$'),
      (route) => {
        const bootstrap = buildProtectedAppBootstrapPayload();
        return route.fulfill({
          json: {
            ...bootstrap,
            access: { ...bootstrap.access, subscriptionTier: 'scale' },
            settings: { ...bootstrap.settings, subscriptionTier: 'scale' },
          },
        });
      },
    );
    await page.route(
      createPlaywrightMockApiRoutePattern(
        'organizations/[^/]+/settings(?:\\?.*)?$',
      ),
      (route) =>
        route.fulfill({
          json: {
            data: {
              id: 'org-settings-1',
              type: 'organization-settings',
              attributes: {
                ...generateMockOrganizationSettings(),
                subscriptionTier: 'scale',
              },
            },
          },
        }),
    );
    const roles = [
      { id: 'role-user', key: 'user', label: 'User' },
      { id: 'role-creator', key: 'creator', label: 'Creator' },
      { id: 'role-owner', key: 'owner', label: 'Owner' },
    ];
    let member = {
      id: 'qa-inline-member',
      organizationId: 'mock-org-id-12345',
      roleId: 'role-user',
      roleKey: 'user',
      role: roles[0],
      isActive: true,
      isDeleted: false,
      brands: [{ id: 'brand-1', label: 'Brand 1' }],
      createdAt: '2026-10-01T12:00:00.000Z',
      user: {
        id: 'qa-inline-user',
        firstName: 'Jane',
        lastName: 'Example',
        email: 'jane@example.com',
      },
    };
    const resource = () => ({
      id: member.id,
      type: 'members',
      attributes: member,
    });
    await page.route(
      createPlaywrightMockApiRoutePattern('roles(?:\\?.*)?$'),
      (route) =>
        route.fulfill({
          json: {
            data: roles.map((role) => ({
              id: role.id,
              type: 'roles',
              attributes: role,
            })),
          },
        }),
    );
    await page.route(
      createPlaywrightMockApiRoutePattern('members(?:\\?.*)?$'),
      (route) => route.fulfill({ json: { data: [resource()] } }),
    );
    await page.route(
      createPlaywrightMockApiRoutePattern(
        'organizations/[^/]+/members/qa-inline-member$',
      ),
      async (route) => {
        const body = z
          .object({
            roleId: z.string(),
            brandIds: z.array(z.string()),
            isActive: z.boolean(),
          })
          .parse(route.request().postDataJSON());
        writes++;
        const role = roles.find((item) => item.id === body.roleId);
        expect(role).toBeDefined();
        member = {
          ...member,
          ...body,
          role,
          roleKey: role?.key ?? 'user',
          brands: body.brandIds.map((id) => ({ id, label: 'Brand 1' })),
        };
        await route.fulfill({ json: { data: resource() } });
      },
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(orgPath(APP_ROUTES.SETTINGS.MEMBERS));
    await expect(
      page
        .getByTestId('section-topbar-actions')
        .getByRole('button', { name: 'Invite Member', exact: true }),
    ).toBeVisible();
    await page.getByText('Jane Example', { exact: true }).first().click();
    await page
      .getByRole('button', { name: 'Edit member', exact: true })
      .click();
    await page.getByRole('combobox', { name: 'Role', exact: true }).click();
    await expect(
      page.getByRole('option', { name: 'Owner', exact: true }),
    ).toHaveCount(0);
    await page.getByRole('option', { name: 'Creator', exact: true }).click();
    await page
      .getByRole('checkbox', { name: 'Active member', exact: true })
      .uncheck();
    await page
      .getByRole('checkbox', { name: 'Brand 1', exact: true })
      .uncheck();
    await page.screenshot({
      path: test.info().outputPath('member-edit-wide.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Member saved', { exact: true })).toBeVisible();
    expect(writes).toBe(1);
    await expect(page.getByText('Creator', { exact: true })).toHaveCount(2);
    await expect(page.getByText('Inactive', { exact: true })).toHaveCount(2);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(page.getByText('Inactive', { exact: true })).toBeVisible();
    await expect(
      page
        .getByTestId('section-topbar-actions')
        .getByRole('button', { name: 'Invite Member', exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath('member-topbar-narrow.png'),
      fullPage: true,
    });
    await page.getByText('Jane Example', { exact: true }).first().click();
    await page
      .getByRole('button', { name: 'Edit member', exact: true })
      .click();
    await expect(
      page.getByRole('checkbox', { name: 'Active member', exact: true }),
    ).not.toBeChecked();
    await expect(
      page.getByRole('checkbox', { name: 'Active member', exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: test.info().outputPath('member-edit-narrow.png'),
      fullPage: true,
    });
  });
});
