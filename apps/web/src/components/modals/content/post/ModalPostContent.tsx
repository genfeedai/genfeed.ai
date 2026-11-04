'use client';

import type { ModalPostContentProps } from '@genfeedai/props/modals/modal.props';
import FormDateTimePicker from '@ui/primitives/date-time-picker';
import { useTranslations } from 'next-intl';
import ModalPostPlatformsTab from '@/components/modals/content/post/ModalPostPlatformsTab';
import ModalPostSetupTab from '@/components/modals/content/post/ModalPostSetupTab';

export default function ModalPostContent({
  activeTab,
  applyEnabledCredentialIds,
  form,
  platformConfigs,
  globalScheduledDate,
  setGlobalScheduledDate,
  settings,
  ingredient,
  ingredients,
  isLoading,
  togglePlatform,
  updatePlatformConfig,
  getMinDateTime,
  scheduleTimezone,
  onAddChannels,
}: ModalPostContentProps) {
  const translate = useTranslations('ui.postBatch.setup');

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
    <>
      <ModalPostPlatformsTab
        applyEnabledCredentialIds={applyEnabledCredentialIds}
        form={form}
        ingredients={ingredients}
        platformConfigs={platformConfigs}
        isLoading={isLoading}
        ingredient={ingredient}
        togglePlatform={togglePlatform}
        updatePlatformConfig={updatePlatformConfig}
        getMinDateTime={getMinDateTime}
        scheduleTimezone={scheduleTimezone}
        onAddChannels={onAddChannels}
      />
      <FormDateTimePicker
        label={translate('scheduleLabel')}
        value={globalScheduledDate || getMinDateTime()}
        onChange={setGlobalScheduledDate}
        minDate={getMinDateTime()}
        isRequired={true}
        timezone={scheduleTimezone}
        isDisabled={isLoading}
        helpText={translate('scheduleChannelsHelp')}
      />
    </>
  );
}
