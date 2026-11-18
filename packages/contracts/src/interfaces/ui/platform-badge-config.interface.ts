import type { IconComponent } from '../../types/icon';

export interface IPlatformBadgeConfig {
  icon: IconComponent;
  label: string;
  bgColor: string;
  solidBgColor: string;
  solidTextColor?: string;
  textColor: string;
  iconColor: string;
}
