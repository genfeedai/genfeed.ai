import { describe, expect, it } from 'vitest';
import { createTestClient, hasCredentials, testConfig } from './setup.js';

describe.skipIf(!hasCredentials)('integration/auth', () => {
  const client = hasCredentials ? createTestClient() : undefined!;

  it('GET /auth/whoami returns user, org, and scopes', async () => {
    const response = await client<{
      data: { user: unknown; organization: unknown; scopes: unknown };
    }>('/auth/whoami', { method: 'GET' });

    expect(response.data).toBeDefined();
    expect(response.data.user).toBeDefined();
    expect(response.data.organization).toBeDefined();
    expect(response.data.scopes).toBeDefined();
  }, 15_000);

  it('whoami org has id and name fields', async () => {
    const response = await client<{
      data: { organization: { id: string; name: string } };
    }>('/auth/whoami', { method: 'GET' });

    const org = response.data.organization;
    expect(org.id).toBeTruthy();
    expect(typeof org.id).toBe('string');
    // name may be empty string for some orgs, but the field must exist
    expect(typeof org.name).toBe('string');
  }, 15_000);

  it('whoami org matches config organizationId', async () => {
    const response = await client<{
      data: { organization: { id: string } };
    }>('/auth/whoami', { method: 'GET' });

    if (testConfig?.organizationId) {
      expect(response.data.organization.id).toBe(testConfig.organizationId);
    }
  }, 15_000);
});
