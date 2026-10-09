import type { OrganizationModuleId } from '@genfeedai/contracts/constants';
import type { ReactNode } from 'react';

export interface OrganizationModulePreferenceGateProps {
  moduleId: OrganizationModuleId;
  children: ReactNode;
}
