import type {
  IBrand,
  IDarkroomCapabilities,
  IOrganizationSetting,
  IUser,
} from '@cloud/interfaces';
import type { IStreakSummary } from '@cloud/types';
import type { LayoutProps } from '@props/layout/layout.props';
import type { AccessBootstrapState } from '@services/auth/auth.service';

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
