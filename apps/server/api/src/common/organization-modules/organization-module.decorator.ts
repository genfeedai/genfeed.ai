import type {
  OrganizationModuleAccessInput,
  OrganizationModuleId,
} from '@genfeedai/contracts/constants';
import { SetMetadata } from '@nestjs/common';

export const ORGANIZATION_MODULE_KEY = 'organizationModule';

export interface OrganizationModuleEndpointPolicy {
  moduleId: OrganizationModuleId;
  operation?: OrganizationModuleAccessInput['operation'];
}

/** Ownership is server metadata, never a caller-controlled module selector. */
export function OrganizationModule(
  moduleId: OrganizationModuleId,
  operation?: OrganizationModuleAccessInput['operation'],
) {
  return SetMetadata(ORGANIZATION_MODULE_KEY, {
    moduleId,
    operation,
  } satisfies OrganizationModuleEndpointPolicy);
}
