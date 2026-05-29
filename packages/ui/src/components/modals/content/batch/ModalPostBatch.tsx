import { ModalEnum } from '@genfeedai/enums';
import type { ModalPostProps } from '@genfeedai/props/modals/modal.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import ModalPostContent from '@ui/modals/content/post/ModalPostContent';
import ModalPostFooter from '@ui/modals/content/post/ModalPostFooter';
import ModalPostHeader from '@ui/modals/content/post/ModalPostHeader';
import Modal from '@ui/modals/modal/Modal';
import { useRouter } from 'next/navigation';
import ModalPostBatchEmptyState from './ModalPostBatchEmptyState';
import ModalPostBatchFormAlerts from './ModalPostBatchFormAlerts';
import ModalPostBatchIngredientPreview from './ModalPostBatchIngredientPreview';
import ModalPostBatchResultsView from './ModalPostBatchResultsView';
import { useModalPostBatch } from './useModalPostBatch';

export default function ModalPostBatch(props: ModalPostProps) {
  const { ingredient, credentials } = props;
  const { push } = useRouter();

  const {
    form,
    formRef,
    onSubmit,
    isSubmitting,
    activeTab,
    handleTabChange,
    handleNextStep,
    handlePreviousStep,
    platformConfigs,
    togglePlatform,
    updatePlatformConfig,
    globalScheduledDate,
    setGlobalScheduledDate,
    getMinDateTime,
    settings,
    enabledCount,
    hasYoutube,
    hasAvailableCredentials,
    hasInvalidCredentials,
    invalidCredentialConfigs,
    invalidCredentialSummary,
    isStep1Complete,
    isFormValid,
    aspectRatioInfo,
    shouldBeFullScreen,
    globalDescription,
    globalLabel,
    error,
    setError,
    closeModalPost,
    platformStatuses,
  } = useModalPostBatch(props);

  return (
    <Modal
      id={ModalEnum.POST_BATCH}
      error={error}
      onClose={() => setError(null)}
      isFullScreen={shouldBeFullScreen}
    >
      <div className="h-full flex flex-col overflow-hidden">
        <ModalPostBatchEmptyState
          ingredient={ingredient}
          credentials={credentials}
          hasAvailableCredentials={hasAvailableCredentials}
          hasInvalidCredentials={hasInvalidCredentials}
          onClose={closeModalPost}
          onOpenCredentials={() =>
            push(`${EnvironmentService.apps.app}/credentials`)
          }
        />

        {ingredient &&
        credentials &&
        credentials?.length > 0 &&
        hasAvailableCredentials ? (
          <div className="flex gap-6 h-full overflow-hidden">
            {ingredient && activeTab !== 'results' && (
              <ModalPostBatchIngredientPreview
                ingredient={ingredient}
                aspectRatioInfo={aspectRatioInfo}
              />
            )}

            <div className="flex-1 h-full overflow-y-auto flex flex-col">
              {activeTab === 'results' ? (
                <ModalPostBatchResultsView
                  platformStatuses={platformStatuses}
                  onClose={closeModalPost}
                />
              ) : (
                <form
                  ref={formRef}
                  onSubmit={onSubmit}
                  className="h-full flex flex-col"
                >
                  <ModalPostBatchFormAlerts
                    formErrors={form.formState.errors}
                    invalidCredentialConfigs={invalidCredentialConfigs}
                    invalidCredentialSummary={invalidCredentialSummary}
                    onManageConnections={() => {
                      closeModalPost();
                      push(`${EnvironmentService.apps.app}/credentials`);
                    }}
                  />

                  <ModalPostHeader
                    activeTab={activeTab}
                    onTabChange={handleTabChange}
                    isStep1Complete={isStep1Complete}
                  />

                  <div className="flex-1 overflow-y-auto p-2">
                    <ModalPostContent
                      activeTab={activeTab}
                      form={form}
                      platformConfigs={platformConfigs}
                      globalScheduledDate={globalScheduledDate}
                      setGlobalScheduledDate={setGlobalScheduledDate}
                      settings={settings}
                      ingredient={ingredient}
                      isLoading={isSubmitting}
                      togglePlatform={togglePlatform}
                      updatePlatformConfig={updatePlatformConfig}
                      getMinDateTime={getMinDateTime}
                    />
                  </div>

                  <ModalPostFooter
                    activeTab={activeTab}
                    isLoading={isSubmitting}
                    enabledCount={enabledCount}
                    globalScheduledDate={globalScheduledDate}
                    globalDescription={globalDescription}
                    hasYoutube={hasYoutube}
                    globalLabel={globalLabel}
                    onNextStep={handleNextStep}
                    onPreviousStep={handlePreviousStep}
                    onClose={closeModalPost}
                    isFormValid={isFormValid}
                  />
                </form>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
