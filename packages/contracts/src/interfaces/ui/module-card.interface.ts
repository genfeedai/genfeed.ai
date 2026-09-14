import type { IconComponent } from '@genfeedai/contracts/types/icon';
import type { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import type { IOrganizationSetting } from '../index';

export interface ModuleCard {
  key: string;
  category: string;
  icon: IconComponent;
  title: string;
  description: string;
  renderDetails?: (settings: IOrganizationSetting | undefined) => ReactNode;
  action?: (props: {
    settings: IOrganizationSetting | undefined;
    isUpdatingVoice: boolean;
    handleVoiceControlToggle: () => void;
    router: ReturnType<typeof useRouter>;
  }) => ReactNode;
}
