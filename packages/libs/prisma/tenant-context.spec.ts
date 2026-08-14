import { describe, expect, it } from 'vitest';
import {
  crossOrgUnsafe,
  getTenantContext,
  isCrossOrgUnsafe,
  runWithTenantContext,
} from './tenant-context';

describe('tenant context', () => {
  it('is empty outside a store', () => {
    expect(getTenantContext()).toBeUndefined();
    expect(isCrossOrgUnsafe()).toBe(false);
  });

  it('exposes the request organizationId inside runWithTenantContext', () => {
    const seen = runWithTenantContext({ organizationId: 'org-1' }, () =>
      getTenantContext(),
    );
    expect(seen).toEqual({ organizationId: 'org-1' });
    expect(getTenantContext()).toBeUndefined();
  });

  it('keeps tenant context while the crossOrgUnsafe hatch is open', () => {
    const seen = runWithTenantContext({ organizationId: 'org-1' }, () =>
      crossOrgUnsafe(() => ({
        isUnsafe: isCrossOrgUnsafe(),
        tenant: getTenantContext(),
      })),
    );

    expect(seen).toEqual({
      isUnsafe: true,
      tenant: { organizationId: 'org-1' },
    });
    expect(isCrossOrgUnsafe()).toBe(false);
  });

  it('rejects an empty organizationId', () => {
    expect(() =>
      runWithTenantContext({ organizationId: '   ' }, () => undefined),
    ).toThrow('runWithTenantContext: organizationId is required');
  });
});
