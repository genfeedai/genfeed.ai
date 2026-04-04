import type { ISetting } from '@cloud/interfaces';

export interface TrendNotificationSettingsProps {
  settings: Partial<ISetting>;
  onUpdate: (updates: Partial<ISetting>) => Promise<void>;
  isLoading?: boolean;
}
