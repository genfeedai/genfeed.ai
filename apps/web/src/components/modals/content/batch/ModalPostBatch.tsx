import { ModalEnum } from '@genfeedai/contracts';
import type { ModalPostBatchProps } from '@genfeedai/props/modals/modal.props';
import Modal from '@ui/modals/modal/Modal';
import { Form } from '@ui/primitives/form';
import type { FormEvent } from 'react';
import ModalPostContent from '@/components/modals/content/post/ModalPostContent';
import ModalPostFooter from '@/components/modals/content/post/ModalPostFooter';
import ModalPostStepHeader from '@/components/modals/content/post/ModalPostStepHeader';
import { PUBLISH_SUBMIT_ATTRIBUTE } from '@/components/modals/content/post/publish-submit';
import ModalPostBatchEmptyState from './ModalPostBatchEmptyState';
import ModalPostBatchFormAlerts from './ModalPostBatchFormAlerts';
import ModalPostBatchIngredientPreview from './ModalPostBatchIngredientPreview';
import ModalPostBatchResultsView from './ModalPostBatchResultsView';
import { useModalPostBatch } from './useModalPostBatch';

export default function ModalPostBatch(props: ModalPostBatchProps) {
  const { ingredient, credentials } = props;

  const {
    form,
    formRef,
    onSubmit,
    isSubmitting,
    activeTab,
    handleNextStep,
    handlePreviousStep,
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
    hasYoutube,
    hasAvailableCredentials,
    hasInvalidCredentials,
    invalidCredentialConfigs,
    invalidCredentialSummary,
    isFormValid,
    aspectRatioInfo,
    globalDescription,
    globalLabel,
    error,
    setError,
    closeModalPost,
    openCredentials,
    platformStatuses,
  } = useModalPostBatch(props);

  // Only the Publish button on the platforms step may submit. Any other
  // submission (stray Enter on the setup step, a navigation button, a
  // programmatic submit) is swallowed so it can never schedule posts.
  const handleFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    const submitter = (event.nativeEvent as SubmitEvent).submitter;

    if (
      activeTab !== 'platforms' ||
      submitter?.getAttribute(PUBLISH_SUBMIT_ATTRIBUTE) !== 'true'
    ) {
      event.preventDefault();
      return;
    }

    onSubmit(event);
  };

  return (
    <Modal
      id={ModalEnum.POST_BATCH}
      error={error}
      onClose={() => setError(null)}
      accessibleTitle="Schedule post"
      size="md"
      isBodyScrollable={false}
    >
      {/* One scroll region: alerts, step header and footer stay put and only
          the step body scrolls. */}
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
          <div className="flex min-h-0 flex-1 flex-col">
            {activeTab === 'results' ? (
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
                onSubmit={handleFormSubmit}
              >
                <ModalPostBatchFormAlerts
                  formErrors={form.formState.errors}
                  invalidCredentialConfigs={invalidCredentialConfigs}
                  invalidCredentialSummary={invalidCredentialSummary}
                  onManageConnections={() => {
                    closeModalPost();
                    openCredentials();
                  }}
                />

                <ModalPostStepHeader
                  activeTab={activeTab}
                  onBack={handlePreviousStep}
                />

                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  <div className="flex flex-col gap-4">
                    {activeTab === 'setup' ? (
                      <ModalPostBatchIngredientPreview
                        ingredient={ingredient}
                        aspectRatioInfo={aspectRatioInfo}
                      />
                    ) : null}
                    <ModalPostContent
                      activeTab={activeTab}
                      form={form}
                      applyEnabledCredentialIds={applyEnabledCredentialIds}
                      platformConfigs={platformConfigs}
                      globalScheduledDate={globalScheduledDate}
                      setGlobalScheduledDate={setGlobalScheduledDate}
                      settings={settings}
                      ingredient={ingredient}
                      ingredients={activeIngredients}
                      isLoading={isSubmitting}
                      togglePlatform={togglePlatform}
                      updatePlatformConfig={updatePlatformConfig}
                      getMinDateTime={getMinDateTime}
                      scheduleTimezone={scheduleTimezone}
                      onAddChannels={() => {
                        closeModalPost();
                        openCredentials();
                      }}
                    />
                  </div>
                </div>

                <ModalPostFooter
                  activeTab={activeTab}
                  isLoading={isSubmitting}
                  globalScheduledDate={globalScheduledDate}
                  globalDescription={globalDescription}
                  hasYoutube={hasYoutube}
                  globalLabel={globalLabel}
                  onNextStep={handleNextStep}
                  onPreviousStep={handlePreviousStep}
                  onClose={closeModalPost}
                  isFormValid={isFormValid}
                />
              </Form>
            )}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
