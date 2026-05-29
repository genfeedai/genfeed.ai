'use client';

import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  ModalEnum,
} from '@genfeedai/enums';
import {
  hasFormErrors,
  parseFormErrors,
} from '@genfeedai/helpers/ui/form-error/form-error.helper';
import type { ModalTrainingNewProps } from '@genfeedai/interfaces/training/modal-training-new.interface';
import Alert from '@ui/feedback/alert/Alert';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import { HiArrowUp } from 'react-icons/hi2';
import TrainingFileList from './TrainingFileList';
import TrainingFormInputs from './TrainingFormInputs';
import { useModalTrainingNew } from './useModalTrainingNew';

export default function ModalTrainingNew({ onSuccess }: ModalTrainingNewProps) {
  const {
    clearError,
    closeModalTrainingNew,
    completedCount,
    error,
    failedCount,
    fileStatuses,
    files,
    form,
    formRef,
    getInputProps,
    getRootProps,
    isDragActive,
    isSubmitting,
    maxFiles,
    maxSize,
    onSubmit,
    uploadingCount,
    generateRandomTrigger,
  } = useModalTrainingNew({ onSuccess });

  return (
    <Modal
      id={ModalEnum.TRAINING_UPLOAD}
      title="Create New Training"
      error={error}
      onClose={clearError}
      modalBoxClassName="w-[80vw] max-w-[80vw]"
    >
      <form ref={formRef} onSubmit={onSubmit} className="flex flex-col">
        {hasFormErrors(form.formState.errors) && (
          <Alert type={AlertCategory.ERROR} className="mb-4">
            <div className="space-y-1">
              {parseFormErrors(form.formState.errors).map((err) => (
                <div key={err}>{err}</div>
              ))}
            </div>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
          <TrainingFormInputs
            control={form.control}
            errors={form.formState.errors}
            watch={form.watch}
            isSubmitting={isSubmitting}
            filesCount={files.length}
            maxFiles={maxFiles}
            maxSize={maxSize}
            isDragActive={isDragActive}
            getRootProps={getRootProps}
            getInputProps={getInputProps}
            onGenerateRandomTrigger={generateRandomTrigger}
            onCategoryChange={(value) =>
              form.setValue('category', value, { shouldValidate: true })
            }
            onStepsChange={(value) =>
              form.setValue('steps', value, { shouldValidate: true })
            }
          />

          <TrainingFileList
            files={files}
            fileStatuses={fileStatuses}
            maxSize={maxSize}
            completedCount={completedCount}
            uploadingCount={uploadingCount}
            failedCount={failedCount}
          />
        </div>

        <ModalActions>
          <Button
            label="Cancel"
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.LG}
            className="md:h-9 md:px-4 md:py-2"
            onClick={closeModalTrainingNew}
            isDisabled={isSubmitting}
          />

          <Button
            variant={ButtonVariant.GENERATE}
            icon={<HiArrowUp />}
            label={isSubmitting ? 'Training…' : 'Start Training'}
            tooltipPosition="left"
            type="submit"
            size={ButtonSize.LG}
            className="md:h-9 md:px-4 md:py-2"
            isLoading={isSubmitting}
            isDisabled={
              isSubmitting || !form.formState.isValid || files.length < 10
            }
          />
        </ModalActions>
      </form>
    </Modal>
  );
}
