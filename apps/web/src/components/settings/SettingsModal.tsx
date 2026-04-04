'use client';

import { Modal, ModalTabs } from '@/components/ui/modal';
import { useUIStore } from '@genfeedai/workflow-ui/stores';
import { Settings } from 'lucide-react';
import { memo, useState } from 'react';
import { ApiKeysTab } from './tabs/ApiKeysTab';
import { AppearanceTab } from './tabs/AppearanceTab';
import { DefaultsTab } from './tabs/DefaultsTab';
import { DeveloperTab } from './tabs/DeveloperTab';
import { HelpTab } from './tabs/HelpTab';

type TabId = 'defaults' | 'api-keys' | 'appearance' | 'developer' | 'help';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'defaults', label: 'Defaults' },
  { id: 'api-keys', label: 'API Keys' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'developer', label: 'Developer' },
  { id: 'help', label: 'Help' },
];

function SettingsModalComponent() {
  const { activeModal, closeModal } = useUIStore();
  const [activeTab, setActiveTab] = useState<TabId>('defaults');

  return (
    <Modal
      isOpen={activeModal === 'settings'}
      onClose={closeModal}
      title="Settings"
      icon={Settings}
    >
      <ModalTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'defaults' && <DefaultsTab />}
        {activeTab === 'api-keys' && <ApiKeysTab />}
        {activeTab === 'appearance' && <AppearanceTab />}
        {activeTab === 'developer' && <DeveloperTab />}
        {activeTab === 'help' && <HelpTab />}
      </div>
    </Modal>
  );
}

export const SettingsModal = memo(SettingsModalComponent);
