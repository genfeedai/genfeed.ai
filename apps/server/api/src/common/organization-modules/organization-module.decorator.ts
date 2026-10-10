import type {
  OrganizationModuleAccessInput,
  OrganizationModuleId,
} from '@genfeedai/contracts/constants';
import { SetMetadata } from '@nestjs/common';

export const ORGANIZATION_MODULE_KEY = 'organizationModule';

export interface OrganizationModuleRecoveryPolicy {
  field: 'status' | 'transition';
  values: readonly string[];
}

export interface OrganizationModuleEndpointPolicy {
  moduleId: OrganizationModuleId;
  operation?: OrganizationModuleAccessInput['operation'];
  recovery?: OrganizationModuleRecoveryPolicy;
}

/** Ownership is server metadata, never a caller-controlled module selector. */
export function OrganizationModule(
  moduleId: OrganizationModuleId,
  operation?: OrganizationModuleAccessInput['operation'],
  recovery?: OrganizationModuleRecoveryPolicy,
) {
  return SetMetadata(ORGANIZATION_MODULE_KEY, {
    moduleId,
    operation,
    ...(recovery ? { recovery } : {}),
  } satisfies OrganizationModuleEndpointPolicy);
}
