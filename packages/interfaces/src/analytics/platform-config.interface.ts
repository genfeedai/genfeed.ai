import type { IconType } from 'react-icons';

export interface IPlatformConfig {
  id: string;
  label: string;
  icon: IconType;
  color: string;
}

export interface ITrendPlatformConfig extends IPlatformConfig {
  description: string;
}
