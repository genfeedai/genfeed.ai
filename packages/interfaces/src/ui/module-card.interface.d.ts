import type { useRouter } from 'next/navigation';
import type { ComponentType, ReactNode } from 'react';
import type { IOrganizationSetting } from '../index';
export interface ModuleCard {
    key: string;
    category: string;
    icon: ComponentType<{
        className?: string;
    }>;
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
//# sourceMappingURL=module-card.interface.d.ts.map