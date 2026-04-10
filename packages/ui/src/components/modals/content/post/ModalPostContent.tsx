'use client';

import type { ModalPostContentProps } from '@genfeedai/props/modals/modal.props';
import ModalPostPlatformsTab from '@ui/modals/content/post/ModalPostPlatformsTab';
import ModalPostSetupTab from '@ui/modals/content/post/ModalPostSetupTab';

export default function ModalPostContent({
  activeTab,
  form,
  platformConfigs,
  globalScheduledDate,
  setGlobalScheduledDate,
  settings,
  ingredient,
  isLoading,
  togglePlatform,
  updatePlatformConfig,
  getMinDateTime,
}: ModalPostContentProps) {
  if (activeTab === 'setup') {
    return (
      <ModalPostSetupTab
        form={form}
        globalScheduledDate={globalScheduledDate}
        setGlobalScheduledDate={setGlobalScheduledDate}
        settings={settings}
        ingredient={ingredient}
        isLoading={isLoading}
        getMinDateTime={getMinDateTime}
      />
    );
  }

  return (
    <ModalPostPlatformsTab
      form={form}
      platformConfigs={platformConfigs}
      isLoading={isLoading}
      togglePlatform={togglePlatform}
      updatePlatformConfig={updatePlatformConfig}
      getMinDateTime={getMinDateTime}
    />
  );
}
