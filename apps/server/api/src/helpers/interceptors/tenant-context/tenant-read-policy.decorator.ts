import { SetMetadata } from '@nestjs/common';

export const TENANT_READ_POLICY = 'genfeed.tenantReadPolicy';
export type TenantReadPolicyValue = 'selected' | 'owner' | 'mutating';
export const TenantReadPolicy = (
  policy: TenantReadPolicyValue,
): MethodDecorator => SetMetadata(TENANT_READ_POLICY, policy);
