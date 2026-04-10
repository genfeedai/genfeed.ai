import type {
  IBrand,
  IDarkroomCapabilities,
  IOrganizationSetting,
  IUser,
} from '@genfeedai/interfaces';
import type { AccessBootstrapState } from '@genfeedai/services/auth/auth.service';
import type { IStreakSummary } from '@genfeedai/types';
import type { LayoutProps } from '@props/layout/layout.props';

export interface ProtectedBootstrapData {
  accessState: AccessBootstrapState | null;
  brandId: string;
  brands: IBrand[];
  currentUser: IUser | null;
  darkroomCapabilities: IDarkroomCapabilities | null;
  organizationId: string;
  settings: IOrganizationSetting | null;
  streak: IStreakSummary | null;
}

export interface ProtectedBootstrapProps extends LayoutProps {
  initialBootstrap?: ProtectedBootstrapData | null;
}
