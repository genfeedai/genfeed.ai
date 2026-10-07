import { assertTenantScopedQuery, TenantIsolationError } from './tenant-guard';

function reportTenantIsolationFailure(error: TenantIsolationError): void {
  const env = process.env;
  if (
    Reflect.get(env, 'CLOUD_SWEEP_DIAGNOSTICS') !== '1' ||
    env.CI !== 'true' ||
    env.GITHUB_ACTIONS !== 'true' ||
    env.GENFEED_CLOUD !== 'true' ||
    env.NODE_ENV !== 'test' ||
    Reflect.get(env, 'CLOUD_SWEEP_LOCAL') !== undefined
  )
    return;

  let observer: object | undefined;
  try {
    const value: unknown = Reflect.get(
      globalThis,
      Symbol.for('genfeed.cloudTenantGuard.observer.v1'),
    );
    if (!value || typeof value !== 'object') return;
    observer = value;
    const protocol: unknown = Reflect.get(observer, 'protocol');
    const tenantFailure: unknown = Reflect.get(observer, 'tenantFailure');
    const unavailable: unknown = Reflect.get(observer, 'unavailable');
    if (
      protocol !== 1 ||
      typeof tenantFailure !== 'function' ||
      typeof unavailable !== 'function'
    ) {
      if (typeof unavailable === 'function')
        Reflect.apply(unavailable, observer, []);
      return;
    }
    Reflect.apply(tenantFailure, observer, [
      error.model,
      error.operation,
      error.reason,
    ]);
  } catch {
    try {
      if (!observer) return;
      const unavailable: unknown = Reflect.get(observer, 'unavailable');
      if (typeof unavailable === 'function')
        Reflect.apply(unavailable, observer, []);
    } catch {
      // Diagnostic observation must preserve the original guard failure.
    }
  }
}

export type TenantGuardOptions = {
  /** Billing-account-capable tenant model names (#5217); see `TenantGuardArgs`. */
  billingAccountModelNames?: ReadonlySet<string>;
  isCloud: boolean;
  tenantModelNames: ReadonlySet<string>;
};

export type TenantQueryInterceptorParams = {
  args: unknown;
  model?: string;
  operation: string;
  query: (args: unknown) => Promise<unknown>;
};

export type TenantGuardExtension = {
  query: {
    $allModels: {
      $allOperations: (
        params: TenantQueryInterceptorParams,
      ) => Promise<unknown>;
    };
  };
};

export function createTenantGuardExtension(
  options: TenantGuardOptions,
): TenantGuardExtension {
  return {
    query: {
      $allModels: {
        async $allOperations({ args, model, operation, query }) {
          try {
            assertTenantScopedQuery({
              args,
              billingAccountModelNames: options.billingAccountModelNames,
              isCloud: options.isCloud,
              model,
              operation,
              tenantModelNames: options.tenantModelNames,
            });
          } catch (error) {
            if (error instanceof TenantIsolationError)
              reportTenantIsolationFailure(error);
            throw error;
          }
          return query(args);
        },
      },
    },
  };
}
