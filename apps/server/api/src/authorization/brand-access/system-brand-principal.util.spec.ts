import { isSystemBrandPrincipal } from '@api/authorization/brand-access/system-brand-principal.util';
import { SYSTEM_WORKFLOW_PRINCIPAL_ID } from '@api/collections/workflows/system-workflow.contract';
import { describe, expect, it } from 'vitest';

const system = {
  organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
  userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
};

describe('isSystemBrandPrincipal', () => {
  it('accepts the system principal inside the system organization', () => {
    expect(isSystemBrandPrincipal(system)).toBe(true);
  });

  it('refuses the system principal in any customer organization', () => {
    expect(
      isSystemBrandPrincipal({ ...system, organizationId: 'org-customer' }),
    ).toBe(false);
  });

  it('refuses a customer user inside the system organization', () => {
    expect(isSystemBrandPrincipal({ ...system, userId: 'user-1' })).toBe(false);
  });

  it('refuses an API key presenting the system identity', () => {
    expect(isSystemBrandPrincipal({ ...system, isApiKey: true })).toBe(false);
    expect(isSystemBrandPrincipal({ ...system, apiKeyId: 'key-1' })).toBe(
      false,
    );
  });
});
