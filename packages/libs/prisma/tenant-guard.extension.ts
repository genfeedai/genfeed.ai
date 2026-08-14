import { assertTenantScopedQuery } from './tenant-guard';

export type TenantGuardOptions = {
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
          assertTenantScopedQuery({
            args,
            isCloud: options.isCloud,
            model,
            operation,
            tenantModelNames: options.tenantModelNames,
          });
          return query(args);
        },
      },
    },
  };
}
