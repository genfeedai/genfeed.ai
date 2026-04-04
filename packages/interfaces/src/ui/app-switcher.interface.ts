import type { ComponentType, ReactNode } from 'react';

export interface IAppSwitcherItem {
  id: string;
  label: string;
  href: string;
  icon?: ReactNode | ComponentType<{ className?: string }>;
  description?: string;
  isActive?: boolean;
  isDisabled?: boolean;
}

export interface IAppSwitcherProps {
  apps: IAppSwitcherItem[];
  currentAppId?: string;
  onAppSelect?: (appId: string) => void;
  className?: string;
}
