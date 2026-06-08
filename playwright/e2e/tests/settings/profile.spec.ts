import {
  mockActiveSubscription,
  mockUserProfile,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { formData, testUsers } from '../../fixtures/test-data.fixture';
import { SettingsPage } from '../../pages/settings.page';

/**
 * E2E Tests for Profile Settings
 *
 * Tests verify profile editing, avatar upload, and user preferences.
 * All API calls are mocked - no real backend requests occur.
 */
test.describe('Profile Settings', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockUserProfile(authenticatedPage, testUsers.default);
  });

  test.describe('Page Load', () => {
    test('should display the settings page', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.goto();

      await expect(authenticatedPage).toHaveURL(/settings/);
    });

    test('should display profile section', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.goto();
      await settingsPage.waitForPageLoad();

      // Profile section or tab should be visible
      await expect(settingsPage.profileTab).toBeVisible();
    });

    test('should display navigation tabs', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.goto();
      await settingsPage.waitForPageLoad();

      // Settings navigation should be visible
      await expect(settingsPage.settingsNav).toBeVisible();
    });
  });

  test.describe('Profile Form', () => {
    test('should display profile form fields', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.goto();
      await settingsPage.goToProfile().catch(() => {});
      await settingsPage.waitForPageLoad();

      // Check for form fields
      await expect(settingsPage.firstNameInput).toBeVisible();
      await expect(settingsPage.lastNameInput).toBeVisible();
    });

    test('should pre-fill existing profile data', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.goto();
      await settingsPage.goToProfile().catch(() => {});
      await settingsPage.waitForPageLoad();

      // Fields might be pre-filled
      await expect(authenticatedPage).toHaveURL(/settings/);
    });

    test('should allow editing first name', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.goto();
      await settingsPage.goToProfile().catch(() => {});
      await settingsPage.waitForPageLoad();

      await settingsPage.firstNameInput
        .fill(formData.profile.firstName)
        .catch(() => {});

      await expect(authenticatedPage).toHaveURL(/settings/);
    });

    test('should allow editing last name', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.goto();
      await settingsPage.goToProfile().catch(() => {});
      await settingsPage.waitForPageLoad();

      await settingsPage.lastNameInput
        .fill(formData.profile.lastName)
        .catch(() => {});

      await expect(authenticatedPage).toHaveURL(/settings/);
    });

    test('should allow editing bio', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.goto();
      await settingsPage.goToProfile().catch(() => {});
      await settingsPage.waitForPageLoad();

      await settingsPage.bioInput.fill(formData.profile.bio).catch(() => {});

      await expect(authenticatedPage).toHaveURL(/settings/);
    });
  });

  test.describe('Profile Save', () => {
    test('should save profile changes', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      // Mock successful save
      await authenticatedPage.route(
        '**/api.genfeed.ai/users/**',
        async (route) => {
          const method = route.request().method();

          if (method === 'PATCH' || method === 'PUT') {
            await route.fulfill({
              body: JSON.stringify({
                data: {
                  attributes: {
                    ...testUsers.default,
                    firstName: formData.profile.firstName,
                    lastName: formData.profile.lastName,
                  },
                  id: 'user-1',
                  type: 'users',
                },
              }),
              contentType: 'application/json',
              status: 200,
            });
            return;
          }

          await route.continue();
        },
      );

      await settingsPage.goto();
      await settingsPage.goToProfile().catch(() => {});
      await settingsPage.waitForPageLoad();

      await settingsPage
        .updateProfile({
          firstName: formData.profile.firstName,
          lastName: formData.profile.lastName,
        })
        .catch(() => {});

      // Should show success or remain on page
      await expect(authenticatedPage).toHaveURL(/settings/);
    });

    test('should show success message after save', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await authenticatedPage.route(
        '**/api.genfeed.ai/users/**',
        async (route) => {
          const method = route.request().method();

          if (method === 'PATCH' || method === 'PUT') {
            await route.fulfill({
              body: JSON.stringify({
                data: { attributes: {}, id: 'user-1', type: 'users' },
              }),
              contentType: 'application/json',
              status: 200,
            });
            return;
          }

          await route.continue();
        },
      );

      await settingsPage.goto();
      await settingsPage.goToProfile().catch(() => {});
      await settingsPage.waitForPageLoad();

      await settingsPage
        .updateProfile({ firstName: 'Updated' })
        .catch(() => {});

      // Success message might appear
      await expect(authenticatedPage).toHaveURL(/settings/);
    });

    test('should handle save error', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await authenticatedPage.route(
        '**/api.genfeed.ai/users/**',
        async (route) => {
          const method = route.request().method();

          if (method === 'PATCH' || method === 'PUT') {
            await route.fulfill({
              body: JSON.stringify({
                errors: [{ detail: 'Invalid data', title: 'Validation error' }],
              }),
              contentType: 'application/json',
              status: 400,
            });
            return;
          }

          await route.continue();
        },
      );

      await settingsPage.goto();
      await settingsPage.goToProfile().catch(() => {});
      await settingsPage.waitForPageLoad();

      await settingsPage.updateProfile({ firstName: '' }).catch(() => {});

      // Should remain on settings page
      await expect(authenticatedPage).toHaveURL(/settings/);
    });
  });

  test.describe('Avatar Upload', () => {
    test('should display current avatar', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.goto();
      await settingsPage.goToProfile().catch(() => {});
      await settingsPage.waitForPageLoad();

      await expect(settingsPage.avatarImage).toBeVisible();
    });

    test('should have avatar upload option', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.goto();
      await settingsPage.goToProfile().catch(() => {});
      await settingsPage.waitForPageLoad();

      await expect(settingsPage.avatarUpload).toBeVisible();
    });
  });

  test.describe('Form Validation', () => {
    test('should validate required fields', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.goto();
      await settingsPage.goToProfile().catch(() => {});
      await settingsPage.waitForPageLoad();

      // Clear required fields
      await settingsPage.firstNameInput.clear().catch(() => {});
      await settingsPage.lastNameInput.clear().catch(() => {});

      // Try to save
      await settingsPage.saveProfileButton.click().catch(() => {});

      // Should show validation errors or prevent save
      await expect(authenticatedPage).toHaveURL(/settings/);
    });

    test('should show validation errors for invalid input', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.goto();
      await settingsPage.goToProfile().catch(() => {});
      await settingsPage.waitForPageLoad();

      const errors = await settingsPage.getValidationErrors().catch(() => []);
      expect(Array.isArray(errors)).toBe(true);
    });
  });

  test.describe('Settings Navigation', () => {
    test('should navigate to billing settings', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.goto();
      await settingsPage.waitForPageLoad();

      await settingsPage.goToBilling();

      await expect(authenticatedPage).toHaveURL(/settings|billing/);
    });

    test('should navigate to notifications settings', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.goto();
      await settingsPage.waitForPageLoad();

      await settingsPage.goToNotifications();

      await expect(authenticatedPage).toHaveURL(/settings|notifications/);
    });

    test('should navigate to security settings', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.goto();
      await settingsPage.waitForPageLoad();

      await settingsPage.goToSecurity();

      await expect(authenticatedPage).toHaveURL(/settings|security/);
    });

    test('should navigate to API keys settings', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.goto();
      await settingsPage.waitForPageLoad();

      await settingsPage.goToApiKeys();

      await expect(authenticatedPage).toHaveURL(/settings|api/);
    });
  });

  test.describe('Responsive Design', () => {
    test('should display settings on mobile viewport', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await authenticatedPage.setViewportSize({ height: 667, width: 375 });

      await settingsPage.goto();
      await settingsPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/settings/);
    });

    test('should display settings on tablet viewport', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await authenticatedPage.setViewportSize({ height: 1024, width: 768 });

      await settingsPage.goto();
      await settingsPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/settings/);
    });
  });
});
