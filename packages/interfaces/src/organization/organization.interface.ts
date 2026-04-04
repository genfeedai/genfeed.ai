import type { OrganizationCategory } from '@genfeedai/enums';
import type { IBaseEntity, IUser } from '../index';
import { IAsset, ICredit, IOrganizationSetting } from '../index';

export interface IOrganization extends IBaseEntity {
  user: IUser;
  settings: IOrganizationSetting;
  credits?: ICredit;
  logo?: IAsset;
  banner?: IAsset;
  label: string;
  isSelected: boolean;
  balance?: number;
  category?: OrganizationCategory;
  accountType?: OrganizationCategory;
}

export interface UpdateMemberData {
  brands?: string[];
}

export interface IOrganizationSettings {
  id: string;
  organization: string;

  isWhitelabelEnabled: boolean;
  isVoiceControlEnabled: boolean;
  isWatermarkEnabled: boolean;
  isVerifyScriptEnabled: boolean;
  isVerifyIngredientEnabled: boolean;
  isVerifyVideoEnabled: boolean;
  isNotificationsDiscordEnabled: boolean;
  isNotificationsTelegramEnabled: boolean;
  isNotificationsEmailEnabled: boolean;

  seatsLimit: number;
  brandsLimit: number;
  timezone: string;

  quotaYoutube: number;
  quotaTiktok: number;
  quotaTwitter: number;
  quotaInstagram: number;
}
