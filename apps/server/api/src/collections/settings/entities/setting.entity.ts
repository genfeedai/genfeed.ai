import { Setting } from '@api/collections/settings/schemas/setting.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import { Types } from 'mongoose';

// @ts-expect-error - implements via BaseEntity + explicit fields
export class SettingEntity extends BaseEntity implements Setting {
  declare readonly user: Types.ObjectId;

  declare readonly theme: string;

  declare readonly isVerified: boolean;
  declare readonly isFirstLogin: boolean;
  declare readonly isMenuCollapsed: boolean;
  declare readonly isSidebarProgressVisible?: boolean;
  declare readonly isSidebarProgressCollapsed?: boolean;
  declare readonly isAdvancedMode: boolean;
  declare readonly isTrendNotificationsInApp: boolean;
  declare readonly isTrendNotificationsTelegram: boolean;
  declare readonly isTrendNotificationsEmail: boolean;
  declare readonly isWorkflowNotificationsEmail: boolean;
  declare readonly isVideoNotificationsEmail: boolean;
  declare readonly contentPreferences: string[];
  declare readonly favoriteModelKeys: string[];
  declare readonly defaultAgentModel: string;
  declare readonly isAgentAssetsPanelOpen: boolean;
  declare readonly generationPriority: string;
  declare readonly dashboardPreferences?: Record<string, unknown>;
}
