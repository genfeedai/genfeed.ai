import {
  expect,
  releaseApiURL,
  test,
} from '@e2e/fixtures/release-auth.fixture';

test.describe('Released image — default authentication and provisioning', () => {
  test('tokenless bootstrap cannot impersonate the seeded admin', async ({
    request,
  }) => {
    const response = await request.get(`${releaseApiURL}/v1/auth/bootstrap`);
    expect(response.status()).toBe(401);
  });

  test('a first account receives its own DB-backed workspace', async ({
    page,
    releaseAccount,
  }) => {
    const response = await page
      .context()
      .request.get(`${releaseApiURL}/v1/auth/bootstrap`, {
        headers: releaseAccount.headers,
      });
    expect(response.status()).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      currentUser: { email: releaseAccount.email },
      brands: expect.arrayContaining([
        expect.objectContaining({ id: releaseAccount.brand.id }),
      ]),
    });
    expect(releaseAccount.email).not.toBe('admin@localhost');
  });

  test('the authenticated overview reaches the real API', async ({
    page,
    releaseAccount,
  }) => {
    const response = await page
      .context()
      .request.get(`${releaseApiURL}/v1/auth/bootstrap/overview`, {
        headers: releaseAccount.headers,
      });
    expect(response.status()).toBe(200);
  });
});
