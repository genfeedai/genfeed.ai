import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';

type MockedDelegateMethod = {
  mock: { calls: unknown[][] };
};

/**
 * Replays every recorded call of a mocked Prisma delegate method through the
 * real CLOUD tenant guard (`assertTenantScopedQuery`). Run the service under
 * `runWithTenantContext`, then assert here: any call that names no
 * organization, or one other than the request tenant, fails the spec the same
 * way it throws in production.
 */
export function expectCloudGuardPasses(
  model: string,
  operation: string,
  method: MockedDelegateMethod,
): void {
  expect(
    method.mock.calls.length,
    `${model}.${operation} was never called`,
  ).toBeGreaterThan(0);

  for (const [args] of method.mock.calls) {
    expect(() =>
      assertTenantScopedQuery({
        args,
        isCloud: true,
        model,
        operation,
        tenantModelNames: new Set([model]),
      }),
    ).not.toThrow();
  }
}
