import {
  CardGap,
  CardPadding,
  CardVariant,
  ModalEnum,
} from '@genfeedai/contracts';
import type {
  ModalPostBatchPanel,
  ModalPostBatchProps,
} from '@genfeedai/props/modals/modal.props';
import Card from '@ui/card/Card';
import Modal from '@ui/modals/modal/Modal';
import { Form } from '@ui/primitives/form';
import { Tabs } from '@ui/primitives/tabs';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import ModalPostFooter from '@/components/modals/content/post/ModalPostFooter';
import ModalPostPlatformsTab from '@/components/modals/content/post/ModalPostPlatformsTab';
import ModalPostSetupTab from '@/components/modals/content/post/ModalPostSetupTab';
import ModalPostBatchEmptyState from './ModalPostBatchEmptyState';
import ModalPostBatchFormAlerts from './ModalPostBatchFormAlerts';
import ModalPostBatchIngredientPreview from './ModalPostBatchIngredientPreview';
import ModalPostBatchResultsView from './ModalPostBatchResultsView';
import { useModalPostBatch } from './useModalPostBatch';

/**
 * Library > Schedule. One screen: the asset, its shared title, caption and
 * time on the left; the channels it goes to (or a preview of each) on the
 * right; one line of what will happen and Schedule in the footer. The body is
 * the dialog's only scroll region.
 */
export default function ModalPostBatch(props: ModalPostBatchProps) {
  const { ingredient, credentials } = props;
  const translate = useTranslations('ui.postBatch');
  const [panel, setPanel] = useState<ModalPostBatchPanel>('channels');

  const {
    form,
    formRef,
    onSubmit,
    isSubmitting,
    view,
    platformConfigs,
    applyEnabledCredentialIds,
    togglePlatform,
    updatePlatformConfig,
    globalScheduledDate,
    setGlobalScheduledDate,
    getMinDateTime,
    scheduleTimezone,
    settings,
    activeIngredients,
    hasAvailableCredentials,
    hasInvalidCredentials,
    isFormValid,
    error,
    setError,
    closeModalPost,
    openCredentials,
    platformStatuses,
  } = useModalPostBatch(props);

  const enabledChannelCount = platformConfigs.filter(
    (config) =>
      config.enabled &&
      config.credentialId.trim().length > 0 &&
      config.isCredentialValid !== false,
  ).length;

  const handleAddChannels = () => {
    closeModalPost();
    openCredentials();
  };

  return (
    <Modal
      id={ModalEnum.POST_BATCH}
      error={error}
      onClose={() => setError(null)}
      title={translate('title')}
      size="xl"
      isBodyScrollable={false}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <ModalPostBatchEmptyState
          ingredient={ingredient}
          credentials={credentials}
          hasAvailableCredentials={hasAvailableCredentials}
          hasInvalidCredentials={hasInvalidCredentials}
          onClose={closeModalPost}
          onOpenCredentials={openCredentials}
        />

        {ingredient &&
        credentials &&
        credentials?.length > 0 &&
        hasAvailableCredentials ? (
          view === 'results' ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ModalPostBatchResultsView
                platformStatuses={platformStatuses}
                onClose={closeModalPost}
              />
            </div>
          ) : (
            <Form
              className="flex min-h-0 flex-1 flex-col"
              ref={formRef}
              onSubmit={(event) => event.preventDefault()}
            >
              <ModalPostBatchFormAlerts formErrors={form.formState.errors} />

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div className="grid gap-4 p-1 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
                  <div className="flex min-w-0 flex-col gap-4">
                    <ModalPostBatchIngredientPreview ingredient={ingredient} />
                    <ModalPostSetupTab
                      form={form}
                      platformConfigs={platformConfigs}
                      globalScheduledDate={globalScheduledDate}
                      setGlobalScheduledDate={setGlobalScheduledDate}
                      settings={settings}
                      ingredient={ingredient}
                      isLoading={isSubmitting}
                      getMinDateTime={getMinDateTime}
                    />
                  </div>

                  <section
                    aria-label={translate('panel.label')}
                    className="min-w-0 self-start"
                  >
                    <Card
                      gap={CardGap.MD}
                      padding={CardPadding.SM}
                      variant={CardVariant.BORDERED}
                    >
                      <Tabs
                        activeTab={panel}
                        listClassName="mr-auto"
                        onTabChange={(tab) =>
                          setPanel(tab === 'preview' ? 'preview' : 'channels')
                        }
                        tabs={[
                          {
                            badge: enabledChannelCount,
                            id: 'channels',
                            label: translate('panel.channels'),
                          },
                          { id: 'preview', label: translate('panel.preview') },
                        ]}
                      />
                      <ModalPostPlatformsTab
                        panel={panel}
                        applyEnabledCredentialIds={applyEnabledCredentialIds}
                        form={form}
                        ingredients={activeIngredients}
                        platformConfigs={platformConfigs}
                        isLoading={isSubmitting}
                        ingredient={ingredient}
                        togglePlatform={togglePlatform}
                        updatePlatformConfig={updatePlatformConfig}
                        getMinDateTime={getMinDateTime}
                        scheduleTimezone={scheduleTimezone}
                        onAddChannels={handleAddChannels}
                      />
                    </Card>
                  </section>
                </div>
              </div>

              <ModalPostFooter
                isLoading={isSubmitting}
                channelCount={enabledChannelCount}
                scheduledDate={globalScheduledDate}
                scheduleTimezone={scheduleTimezone}
                onSchedule={() => onSubmit({ preventDefault: () => undefined })}
                onClose={closeModalPost}
                isFormValid={isFormValid}
              />
            </Form>
          )
        ) : null}
      </div>
    </Modal>
  );
}
