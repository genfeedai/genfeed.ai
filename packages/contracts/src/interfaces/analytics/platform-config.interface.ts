import type { IconType } from '../ui/icon.interface';

export interface IPlatformConfig {
  id: string;
  label: string;
  icon: IconType;
  color: string;
}

export interface ITrendPlatformConfig extends IPlatformConfig {
  description: string;
}
