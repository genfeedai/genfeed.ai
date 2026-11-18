import type { OrganizationModuleId } from '@genfeedai/contracts/constants';
import type { ReactNode } from 'react';

/** An app the gate can hide: an organization module, or the release-only Agent app. */
type GatedAppId = OrganizationModuleId | 'agent';

export interface OrganizationModulePreferenceGateProps {
  moduleId: GatedAppId;
  children: ReactNode;
}
