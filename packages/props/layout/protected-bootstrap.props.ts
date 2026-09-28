import type {
  IBrand,
  IFleetCapabilities,
  IOrganizationSetting,
  IPlatformFlags,
  IUser,
} from '@genfeedai/contracts/interfaces';
import type { IStreakSummary } from '@genfeedai/contracts/types';
import type { AccessBootstrapState } from '@genfeedai/services/auth/auth.service';
import type { LayoutProps } from '@props/layout/layout.props';

export interface ProtectedBootstrapData {
  accessState: AccessBootstrapState | null;
  brandId: string;
  brands: IBrand[];
  currentUser: IUser | null;
  fleetCapabilities: IFleetCapabilities | null;
  organizationId: string;
  /** Admin module and feature flags (#5468), server-rendered for the shell; absent or `null` means read them client-side. */
  platformFlags?: IPlatformFlags | null;
  settings: IOrganizationSetting | null;
  streak: IStreakSummary | null;
}

export interface ProtectedBootstrapProps extends LayoutProps {
  initialBootstrap?: ProtectedBootstrapData | null;
}
