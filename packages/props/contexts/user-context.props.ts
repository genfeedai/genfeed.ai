import type { IUser } from '@genfeedai/contracts/interfaces';
import type { LayoutProps } from '@props/layout/layout.props';

export interface UserContextValue {
  currentUser: IUser | null;
  memberRole: string | null | undefined;
  isFirstLogin: boolean;
  setIsFirstLogin: (value: boolean) => void;
  isLoading: boolean;
  refetchUser: () => Promise<void>;
  mutateUser: (user: IUser) => void;
}

export interface UserProviderProps extends LayoutProps {
  hasInitialBootstrap?: boolean;
  initialCurrentUser?: IUser | null;
  initialMemberRole?: string | null;
  initialOrganizationId?: string;
}

export interface UserBootstrapData {
  currentUser: IUser | null;
  memberRole: string | null;
}
