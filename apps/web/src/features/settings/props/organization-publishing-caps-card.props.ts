import type { IOrganizationSetting } from '@genfeedai/contracts/interfaces';

export type PublishingCapKey = keyof Pick<
  IOrganizationSetting,
  'quotaTwitter' | 'quotaInstagram' | 'quotaYoutube' | 'quotaTiktok'
>;

export type PublishingCapsFormState = Record<PublishingCapKey, string>;

export type PublishingCapField = {
  id: string;
  key: PublishingCapKey;
  labelKey: 'twitter' | 'instagram' | 'youtube' | 'tiktok';
};
