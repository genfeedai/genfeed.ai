'use client';

import type { ModalPostHeaderProps } from '@props/modals/modal.props';
import Tabs from '@ui/navigation/tabs/Tabs';

export default function ModalPostHeader({
  activeTab,
  onTabChange,
  isStep1Complete,
}: ModalPostHeaderProps) {
  const tabs = [
    {
      id: 'setup',
      isDisabled: false,
      label: 'Set Up',
    },
    {
      id: 'platforms',
      isDisabled: !isStep1Complete,
      label: 'Platforms',
    },
  ];

  return (
    <div className="mb-4">
      <Tabs
        activeTab={activeTab}
        onTabChange={(tab) => onTabChange(tab as 'setup' | 'platforms')}
        tabs={tabs}
      />
    </div>
  );
}
