import { randomUUID } from 'node:crypto';
import type {
  IBrand,
  OrganizationOption,
} from '@genfeedai/contracts/interfaces';
import { test as base, expect } from '@playwright/test';

export const releaseApiURL =
  process.env.API_BASE_URL || 'http://localhost:3010';

const SIGNUP_RATE_LIMIT_RETRIES = 3;
const SIGNUP_RATE_LIMIT_FALLBACK_SECONDS = 10;

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
    const signupData = {
      email,
      name: 'Release Readiness',
      password: `Release-${randomUUID()}!`,
    };
    const signupHeaders = {
      origin: new URL(baseURL || 'http://localhost:3000').origin,
    };
    // Better Auth caps /sign-up/email at 3 requests per 10 seconds per IP, and
    // this suite signs up one account per test. Wait out the window the API
    // reports instead of failing on the 429.
    const postSignup = () =>
      request.post(`${releaseApiURL}/v1/auth/sign-up/email`, {
        data: signupData,
        headers: signupHeaders,
      });
    let signup = await postSignup();
    for (
      let attempt = 0;
      attempt < SIGNUP_RATE_LIMIT_RETRIES && signup.status() === 429;
      attempt += 1
    ) {
      const retryAfterSeconds = Number(signup.headers()['x-retry-after']);
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
            ? retryAfterSeconds
            : SIGNUP_RATE_LIMIT_FALLBACK_SECONDS) * 1000,
        ),
      );
      signup = await postSignup();
    }
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
