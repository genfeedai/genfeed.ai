import type { CreditBasedOrganizationModuleId } from '@genfeedai/contracts/constants';
import type { ReactNode } from 'react';

export interface OrganizationModulePreferenceGateProps {
  moduleId: CreditBasedOrganizationModuleId;
  children: ReactNode;
}
