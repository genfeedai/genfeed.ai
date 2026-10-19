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
}

export interface AdminUserDetailPanelProps {
  user: IUser;
  onImpersonate: (user: IUser) => void;
}

export interface AdminUserDetailRowProps {
  label: string;
  children: ReactNode;
}

export interface AdminUserDetailSectionProps {
  title: string;
  children: ReactNode;
}
