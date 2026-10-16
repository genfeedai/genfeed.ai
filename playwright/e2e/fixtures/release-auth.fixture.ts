import { randomUUID } from 'node:crypto';
import type {
  IBrand,
  OrganizationOption,
} from '@genfeedai/contracts/interfaces';
import { test as base, expect } from '@playwright/test';

export const releaseApiURL =
  process.env.API_BASE_URL || 'http://localhost:3010';

type ReleaseAccount = {
  email: string;
  headers: { Authorization: string };
  brand: IBrand;
  workspacePath: string;
};

export const test = base.extend<{ releaseAccount: ReleaseAccount }>({
  releaseAccount: async ({ page, baseURL }, use) => {
    const email = `release-${randomUUID()}@example.com`;
    const request = page.context().request;
    const signup = await request.post(
      `${releaseApiURL}/v1/auth/sign-up/email`,
      {
        data: {
          email,
          name: 'Release Readiness',
          password: `Release-${randomUUID()}!`,
        },
        headers: { origin: new URL(baseURL || 'http://localhost:3000').origin },
      },
    );
    expect(signup.ok(), 'first account signup must succeed').toBe(true);

    const exchange = await request.get(`${releaseApiURL}/v1/auth/token`);
    expect(exchange.ok(), 'session cookie must exchange for a real JWT').toBe(
      true,
    );
    const { token } = (await exchange.json()) as { token?: string };
    expect(token, 'token exchange must return a JWT').toBeTruthy();
    const headers = { Authorization: `Bearer ${token}` };
    const onboarding = await request.patch(`${releaseApiURL}/v1/users/me`, {
      data: { isOnboardingCompleted: true },
      headers,
    });
    expect(onboarding.ok(), 'new user onboarding must persist').toBe(true);

    const response = await request.get(`${releaseApiURL}/v1/auth/bootstrap`, {
      headers,
    });
    expect(
      response.status(),
      'authenticated bootstrap must reach the real DB',
    ).toBe(200);
    const body = (await response.json()) as {
      access?: { organizationId?: string };
      brands?: IBrand[];
      currentUser?: { email?: string };
    };
    expect(body.currentUser?.email).toBe(email);
    const brand = body.brands?.[0];
    expect(brand?.id, 'signup must provision a brand').toBeTruthy();
    expect(brand?.slug).toBeTruthy();

    const organizations = await request.get(
      `${releaseApiURL}/v1/organizations?mine=true`,
      { headers },
    );
    expect(organizations.ok()).toBe(true);
    const mine = (await organizations.json()) as OrganizationOption[];
    const organization = mine.find(
      (item) => item.id === body.access?.organizationId,
    );
    expect(
      organization?.slug,
      'signup must provision an accessible organization',
    ).toBeTruthy();
    if (!brand?.slug || !organization?.slug)
      throw new Error('Signup workspace was not provisioned.');

    await use({
      brand,
      email,
      headers,
      workspacePath: `/${organization.slug}/${brand.slug}/workspace`,
    });
  },
});

export { expect };
