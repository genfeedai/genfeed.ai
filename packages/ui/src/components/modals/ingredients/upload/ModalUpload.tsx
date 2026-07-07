'use client';

import {
  AssetCategory,
  ButtonSize,
  ButtonVariant,
  ModalEnum,
} from '@genfeedai/enums';
import { useFocusFirstInput } from '@genfeedai/hooks/ui/use-focus-first-input/use-focus-first-input';
import { useModalAutoOpen } from '@genfeedai/hooks/ui/use-modal-auto-open/use-modal-auto-open';
import { useFormSubmitWithState } from '@genfeedai/hooks/utils/use-form-submit/use-form-submit';
import type { ModalUploadProps } from '@genfeedai/props/modals/modal.props';
import { ScopeSelector } from '@ui/assets/ScopeSelector';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import UploadFileList from './UploadFileList';
import UploadRequirements from './UploadRequirements';
import UploadVoiceCloneSection from './UploadVoiceCloneSection';
import { useModalUpload } from './useModalUpload';

export default function ModalUpload({
  category,
  parentId,
  parentModel,
  onConfirm,
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
    onConfirm,
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

  return (
    <Modal
      id={ModalEnum.UPLOAD}
      title={isVoiceLike ? 'Clone Voice' : `Upload ${category}`}
      error={error}
      onClose={() => setError(null)}
    >
      <form ref={formRef} onSubmit={onSubmit}>
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
              'file-uploader !max-w-full bg-primary/10 border-primary/10 border-1 border-dashed p-4 text-center cursor-pointer',
          })}
        >
          <Input type="file" {...getInputProps({ name: 'file' })} />
          {selectedFileList.length > 0 ? (
            <UploadFileList
              selectedFileList={selectedFileList}
              maxFiles={maxFiles}
              maxSize={maxSize}
              fileStatuses={fileStatuses}
              formatSize={formatSize}
            />
          ) : (
            <p>Drop files here or click to upload</p>
          )}
        </div>

        <UploadRequirements
          acceptedTypes={acceptedTypes}
          maxFiles={maxFiles}
          maxSize={maxSize}
          dimensionText={dimensionText}
          dimensionWarning={dimensionWarning}
        />

        {/* Privacy/Scope selector - only for media uploads, not assets like logos/banners */}
        {category !== AssetCategory.LOGO &&
          category !== AssetCategory.BANNER &&
          category !== AssetCategory.REFERENCE &&
          !isVoiceLike && (
            <div className="mt-4">
              <ScopeSelector
                value={scope}
                onChange={setScope}
                isDisabled={isSubmitting}
              />
            </div>
          )}

        <ModalActions>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.LG}
            className="md:h-9 md:px-4 md:py-2 mb-4 md:mb-0"
            onClick={() => closeModalUpload()}
            isLoading={isSubmitting}
          />

          <Button
            label={isVoiceLike ? 'Clone Voice' : 'Upload'}
            type="submit"
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.LG}
            className="md:h-9 md:px-4 md:py-2 mb-4 md:mb-0"
            isDisabled={
              isSubmitting ||
              (selectedFileList.length === 0 && !urlValue) ||
              (isVoiceLike && !voiceCloneName.trim())
            }
            isLoading={isSubmitting}
          />
        </ModalActions>
      </form>
    </Modal>
  );
}
