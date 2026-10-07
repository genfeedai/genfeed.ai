import {
  getTenantReadScope,
  resolveTenantReadScope,
  runWithTenantReadScope,
} from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { testId } from '@helpers/testing/test-id.helper';

const identity = { organizationId: testId('org'), brandId: testId('brand') };
describe('immutable tenant read scope', () => {
  it('returns only the frozen original data identity without inventing authority', () => {
    const scope = resolveTenantReadScope(identity);
    expect(scope).toEqual({ ...identity, isOrganizationOverride: false });
    expect(Object.isFrozen(scope)).toBe(true);
    expect(getTenantReadScope()).toBeUndefined();
    expect(
      resolveTenantReadScope({ organizationId: '', brandId: '' })
        .organizationId,
    ).toBe('');
  });
  it('snapshots input and restores nested scopes without modifying the identity', () => {
    const scope = {
      organizationId: testId('org', 2),
      isOrganizationOverride: true,
    };
    runWithTenantReadScope(scope, () => {
      scope.organizationId = 'changed';
      expect(resolveTenantReadScope(identity).organizationId).toBe(
        testId('org', 2),
      );
      expect(Object.isFrozen(getTenantReadScope())).toBe(true);
      runWithTenantReadScope(
        { ...identity, isOrganizationOverride: false },
        () =>
          expect(resolveTenantReadScope(identity).organizationId).toBe(
            identity.organizationId,
          ),
      );
      expect(resolveTenantReadScope(identity).organizationId).toBe(
        testId('org', 2),
      );
    });
    expect(getTenantReadScope()).toBeUndefined();
  });
  it('isolates two concurrent async selections and restores on rejection', async () => {
    const values = await Promise.all(
      [2, 3].map((n) =>
        runWithTenantReadScope(
          { organizationId: testId('org', n), isOrganizationOverride: true },
          async () => {
            await new Promise((resolve) => setImmediate(resolve));
            return getTenantReadScope()?.organizationId;
          },
        ),
      ),
    );
    expect(values).toEqual([testId('org', 2), testId('org', 3)]);
    await expect(
      runWithTenantReadScope(
        { ...identity, isOrganizationOverride: false },
        async () => {
          throw new Error('expected');
        },
      ),
    ).rejects.toThrow('expected');
    expect(getTenantReadScope()).toBeUndefined();
  });
});
