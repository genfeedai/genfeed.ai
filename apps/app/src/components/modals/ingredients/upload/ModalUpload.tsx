'use client';

import { AssetCategory, ButtonVariant, ModalEnum } from '@genfeedai/contracts';
import type { ModalUploadProps } from '@genfeedai/props/modals/modal.props';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import { Form } from '@ui/primitives/form';
import { Input } from '@ui/primitives/input';
import { UploadCloud } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ScopeSelector } from '@/components/assets/ScopeSelector';
import { useFocusFirstInput } from '@/hooks/ui/use-focus-first-input/use-focus-first-input';
import { useModalAutoOpen } from '@/hooks/ui/use-modal-auto-open/use-modal-auto-open';
import { useFormSubmitWithState } from '@/hooks/utils/use-form-submit/use-form-submit';
import UploadFileList from './UploadFileList';
import UploadRequirements from './UploadRequirements';
import UploadVoiceCloneSection from './UploadVoiceCloneSection';
import { useModalUpload } from './useModalUpload';

export default function ModalUpload({
  category,
  parentId,
  parentModel,
  onComplete,
  width,
  height,
  isMultiple = true,
  maxFiles: maxFilesProp,
  initialFiles,
  autoSubmit = false,
  isOpen,
  openKey,
}: ModalUploadProps) {
  const translate = useTranslations('ui.uploadModal');

  useModalAutoOpen(ModalEnum.UPLOAD, { isOpen, openKey });

  const formRef = useFocusFirstInput<HTMLFormElement>();

  const {
    error,
    setError,
    dimensionWarning,
    fileStatuses,
    scope,
    setScope,
    urlValue,
    voiceCloneName,
    setVoiceCloneName,
    voiceCloneProvider,
    setVoiceCloneProvider,
    isVoiceLike,
    isSelfHostedVoiceAvailable,
    maxSize,
    maxFiles,
    acceptedTypes,
    dimensionText,
    selectedFileList,
    recordingError,
    isRecording,
    isRecordingSupported,
    recordedFile,
    stopRecording,
    handleStartRecording,
    handleSubmit,
    closeModalUpload,
    getRootProps,
    getInputProps,
    formatSize,
  } = useModalUpload({
    category,
    parentId,
    parentModel,
    onComplete,
    width,
    height,
    isMultiple,
    maxFiles: maxFilesProp,
    initialFiles,
    autoSubmit,
    isOpen,
    openKey,
    formRef,
  });

  const { isSubmitting, onSubmit } = useFormSubmitWithState(() =>
    handleSubmit(),
  );

  const hasFiles = selectedFileList.length > 0;

  return (
    <Modal
      id={ModalEnum.UPLOAD}
      size="md"
      title={
        isVoiceLike
          ? translate('cloneVoiceTitle')
          : translate('title', { category: category.toLowerCase() })
      }
      error={error}
      onClose={() => setError(null)}
    >
      <Form ref={formRef} onSubmit={onSubmit}>
        {isVoiceLike ? (
          <UploadVoiceCloneSection
            voiceCloneName={voiceCloneName}
            onVoiceCloneNameChange={setVoiceCloneName}
            voiceCloneProvider={voiceCloneProvider}
            onVoiceCloneProviderChange={setVoiceCloneProvider}
            isSelfHostedVoiceAvailable={isSelfHostedVoiceAvailable}
            isRecording={isRecording}
            isRecordingSupported={isRecordingSupported}
            recordedFile={recordedFile}
            recordingError={recordingError}
            onStartRecording={handleStartRecording}
            onStopRecording={stopRecording}
          />
        ) : null}

        <div
          {...getRootProps({
            className:
              'flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-background-secondary px-4 py-6 text-center transition-colors hover:bg-background-tertiary',
          })}
        >
          <Input type="file" {...getInputProps({ name: 'file' })} />
          <div className="flex size-9 items-center justify-center rounded-lg bg-background-tertiary text-muted-foreground">
            <UploadCloud aria-hidden="true" className="size-4" />
          </div>
          <div className="text-sm font-medium">
            {translate('dropPrompt')}{' '}
            <span className="text-primary">{translate('browse')}</span>
          </div>
          <UploadRequirements
            acceptedTypes={acceptedTypes}
            maxFiles={maxFiles}
            maxSize={maxSize}
            dimensionText={dimensionText}
            dimensionWarning={dimensionWarning}
          />
        </div>

        {hasFiles ? (
          <UploadFileList
            selectedFileList={selectedFileList}
            fileStatuses={fileStatuses}
            formatSize={formatSize}
          />
        ) : null}

        {/* Privacy/Scope selector - only for media uploads, not assets like logos/banners */}
        {category !== AssetCategory.LOGO &&
          category !== AssetCategory.BANNER &&
          category !== AssetCategory.REFERENCE &&
          !isVoiceLike && (
            <ScopeSelector
              value={scope}
              onChange={setScope}
              isDisabled={isSubmitting}
              showLabel={false}
              variant="segmented"
            />
          )}

        <ModalActions className="justify-between">
          <span className="text-xs text-muted-foreground">
            {maxFiles > 1
              ? translate('fileCount', {
                  count: selectedFileList.length,
                  max: maxFiles,
                })
              : null}
          </span>

          <div className="flex gap-2">
            <Button
              onClick={() => closeModalUpload()}
              isLoading={isSubmitting}
              textTransform="none"
              variant={ButtonVariant.GHOST}
            >
              {translate('cancel')}
            </Button>

            <Button
              type="submit"
              variant={ButtonVariant.DEFAULT}
              isDisabled={
                isSubmitting ||
                (selectedFileList.length === 0 && !urlValue) ||
                (isVoiceLike && !voiceCloneName.trim())
              }
              isLoading={isSubmitting}
              textTransform="none"
            >
              {isVoiceLike
                ? translate('cloneVoice')
                : translate('upload', { count: selectedFileList.length })}
            </Button>
          </div>
        </ModalActions>
      </Form>
    </Modal>
  );
}
