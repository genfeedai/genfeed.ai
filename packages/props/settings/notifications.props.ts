import type { ISetting } from '@genfeedai/interfaces';

export interface TrendNotificationSettingsProps {
  settings: Partial<ISetting>;
  onUpdate: (updates: Partial<ISetting>) => Promise<void>;
  isLoading?: boolean;
}
