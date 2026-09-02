import type { ISetting } from '../index';

export interface ISettingOption {
  key: keyof Omit<ISetting, 'id' | 'user' | 'createdAt' | 'updatedAt'>;
  label: string;
  description: string;
  isDisabled: boolean;
}
