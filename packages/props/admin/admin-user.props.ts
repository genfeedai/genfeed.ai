import type { IUser } from '@genfeedai/contracts/interfaces';
import type { ReactNode } from 'react';

export interface AdminUserAvatarProps {
  user: IUser;
  className?: string;
}

export interface AdminUserEmailProps {
  email?: string | null;
}

export interface AdminUserDetailsProps {
  user: IUser;
  className?: string;
  onUpdated?: (user: IUser) => void;
}

export interface AdminUserDetailPanelProps {
  user: IUser;
  onImpersonate: (user: IUser) => void;
  onUpdated?: (user: IUser) => void;
}

export interface AdminUserDetailRowProps {
  label: string;
  children: ReactNode;
}

export interface AdminUserDetailSectionProps {
  title: string;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}
