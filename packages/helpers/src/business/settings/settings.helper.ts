import type { ISettingOption } from '@genfeedai/interfaces';

export const settingsOptions: ISettingOption[] = [
  {
    description:
      'Choose specific models for generation instead of using state-of-the-art automatic selection.',
    isDisabled: false,
    key: 'isAdvancedMode',
    label: 'Advanced Mode',
  },
];
