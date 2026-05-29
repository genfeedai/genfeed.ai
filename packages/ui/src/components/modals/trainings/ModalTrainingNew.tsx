'use client';

import { type TrainingSchema, trainingSchema } from '@genfeedai/client/schemas';
import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
  IngredientStatus,
  ModalEnum,
  TrainingCategory,
  UploadStatus,
} from '@genfeedai/enums';
import {
  hasFormErrors,
  parseFormErrors,
} from '@genfeedai/helpers/ui/form-error/form-error.helper';
import { closeModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useFocusFirstInput } from '@genfeedai/hooks/ui/use-focus-first-input/use-focus-first-input';
import { useFormSubmitWithState } from '@genfeedai/hooks/utils/use-form-submit/use-form-submit';
import { useSocketManager } from '@genfeedai/hooks/utils/use-socket-manager/use-socket-manager';
import type {
  IHttpInterceptorError,
  IUploadProgressData,
} from '@genfeedai/interfaces';
import type { FileUploadStatus } from '@genfeedai/interfaces/modals/file-upload-status.interface';
import type {
  ModalTrainingNewProps,
  TrainingStatusUpdate,
} from '@genfeedai/interfaces/training/modal-training-new.interface';
import { TrainingsService } from '@genfeedai/services/ai/trainings.service';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { SocketService } from '@genfeedai/services/core/socket.service';
import { ImagesService } from '@genfeedai/services/ingredients/images.service';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import Alert from '@ui/feedback/alert/Alert';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useForm } from 'react-hook-form';
import { HiArrowUp } from 'react-icons/hi2';
import TrainingFileList from './TrainingFileList';
import TrainingFormInputs from './TrainingFormInputs';

type FileStatusUpdater = Dispatch<
  SetStateAction<Map<string, FileUploadStatus>>
>;

/**
 * Helper to update file status in the status map.
 */
function updateFileStatus(
  setFileStatuses: FileStatusUpdater,
  fileId: string,
  updates: Partial<FileUploadStatus>,
): void {
  setFileStatuses((prev) => {
    const newMap = new Map(prev);
    const existing = newMap.get(fileId);
    if (existing) {
      newMap.set(fileId, { ...existing, ...updates });
    }
    return newMap;
  });
}

export default function ModalTrainingNew({ onSuccess }: ModalTrainingNewProps) {
  const notificationsService = NotificationsService.getInstance();
  const [error, setError] = useState<string | null>(null);

  // Form setup with react-hook-form
  const form = useForm<TrainingSchema>({
    defaultValues: {
      category: TrainingCategory.SUBJECT,
      description: '',
      label: '',
      steps: 1000,
      trigger: '',
    },
    mode: 'onChange',
    resolver: standardSchemaResolver(trainingSchema),
  });

  // Upload state
  const [files, setFiles] = useState<File[]>([]);
  const [fileStatuses, setFileStatuses] = useState<
    Map<string, FileUploadStatus>
  >(new Map());

  // WebSocket setup for training status updates
  const currentTrainingIdRef = useRef<string | null>(null);
  const { subscribe, isReady } = useSocketManager();

  const closeModalTrainingNew = useCallback(() => {
    closeModal(ModalEnum.TRAINING_UPLOAD);
    form.reset();
    setFiles([]);
    setFileStatuses(new Map());
    setError(null);
  }, [form]);

  // Listen for training status updates via WebSocket
  useEffect(() => {
    if (!isReady || !currentTrainingIdRef.current) {
      return;
    }

    const trainingId = currentTrainingIdRef.current;

    const handleTrainingStatus = (data: unknown) => {
      logger.info('Training status update received', data);

      const update = data as TrainingStatusUpdate;

      // Only handle events for our current training
      if (update.trainingId !== trainingId) {
        return;
      }

      if (update.status === IngredientStatus.GENERATED) {
        notificationsService.success('Training completed successfully!');
        closeModalTrainingNew();
        onSuccess?.();
      } else if (update.status === IngredientStatus.FAILED) {
        const errorMessage =
          update.metadata?.error || 'Training failed. Please try again.';
        notificationsService.error(errorMessage);
        setError(errorMessage);
        currentTrainingIdRef.current = null;
      }
    };

    const dispose = subscribe('training-status', handleTrainingStatus);

    return () => {
      dispose();
    };
  }, [
    isReady,
    subscribe,
    notificationsService,
    onSuccess,
    closeModalTrainingNew,
  ]);

  const getImagesService = useAuthedService((token: string) =>
    ImagesService.getInstance(token),
  );

  const getTrainingsService = useAuthedService((token: string) =>
    TrainingsService.getInstance(token),
  );

  const { isSubmitting, onSubmit } = useFormSubmitWithState(() =>
    handleSubmit(),
  );

  const formRef = useFocusFirstInput<HTMLFormElement>();

  const generateRandomTrigger = () => {
    const chars = 'BCDFGHJKLMNPQRSTVWXYZ23456789';
    const len = Math.floor(Math.random() * 2) + 4; // 4-5 characters
    let token = '';
    let hasDigit = false;
    for (let i = 0; i < len; i++) {
      const ch = chars[Math.floor(Math.random() * chars.length)];
      token += ch;
      if (ch >= '0' && ch <= '9') {
        hasDigit = true;
      }
    }
    if (!hasDigit) {
      const digits = '23456789';
      token =
        token.slice(0, -1) + digits[Math.floor(Math.random() * digits.length)];
    }
    form.setValue('trigger', token, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const steps = form.watch('steps');
  const _computedCost = Math.round(
    ((steps || 1000) / 1000) * EnvironmentService.CREDITS_TRAINING_COST,
  );

  const maxSize = 10; // 10MB for images
  const maxFiles = 25;

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles && acceptedFiles.length > 0) {
        const remaining = maxFiles - files.length;

        if (remaining <= 0) {
          return setError(`Maximum ${maxFiles} files allowed`);
        }

        const allowedFiles = acceptedFiles.slice(0, remaining);

        allowedFiles.forEach((newFile) => {
          const fileId = `${newFile.name}-${Date.now()}-${Math.random()}`;

          setFiles((prev) => [...prev, newFile]);

          setFileStatuses((prev) => {
            const newMap = new Map(prev);
            newMap.set(fileId, {
              file: newFile,
              id: fileId,
              progress: 0,
              status: UploadStatus.PENDING,
            });
            return newMap;
          });
        });

        setError(null);
      }
    },
    [files.length],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
    },
    maxFiles,
    maxSize: maxSize * 1024 * 1024,
    multiple: true,
    onDrop,
    onDropRejected: (rejections) => {
      const tooLarge = rejections.some((rej) =>
        rej.errors.some((e) => e.code === 'file-too-large'),
      );

      if (tooLarge) {
        return setError(
          `File is too large. Maximum size is ${maxSize}MB for images.`,
        );
      }

      setError(
        'One or more files were rejected. Please check file type and size.',
      );
    },
  });

  const handleSubmit = async () => {
    // Validate files
    if (files.length < 10) {
      return setError('Please upload at least 10 images for training');
    }

    // Validate form
    const isValid = await form.trigger();
    if (!isValid) {
      return;
    }

    setError(null);

    try {
      const socketService = SocketService.getInstance();
      const fileIds = Array.from(fileStatuses.keys());
      const uploadedImageIds: string[] = [];
      let hasFailures = false;

      // Step 1: Upload all images
      for (let i = 0; i < files.length; i++) {
        const selectedFile = files[i];
        const fileId = fileIds[i] || `${selectedFile.name}-${Date.now()}`;

        updateFileStatus(setFileStatuses, fileId, {
          progress: 0,
          status: UploadStatus.UPLOADING,
        });

        const socketEmit = socketService.socket?.emit
          ? socketService.socket.emit.bind(socketService.socket)
          : null;

        try {
          const handleProgress = (
            progress: number,
            loaded: number,
            total: number,
          ) => {
            updateFileStatus(setFileStatuses, fileId, {
              progress,
              status: UploadStatus.UPLOADING,
            });

            if (socketEmit) {
              const progressData: IUploadProgressData = {
                fileId,
                fileName: selectedFile.name,
                loaded,
                progress,
                status: UploadStatus.UPLOADING,
                total,
              };
              socketEmit('upload:progress', progressData);
            }
          };

          const mediaService = await getImagesService();

          // Get presigned URL
          const presignedData = await mediaService.getPresignedUploadUrl(
            selectedFile.name,
            selectedFile.type,
            IngredientCategory.IMAGE,
          );

          // Upload directly to S3
          await mediaService.uploadDirectToS3(
            selectedFile,
            presignedData.uploadUrl,
            handleProgress,
          );

          // Confirm upload completion
          const uploaded = await mediaService.confirmUpload(presignedData.id);

          if (!uploaded?.id) {
            throw new Error('Upload confirmation failed - no ID returned');
          }

          uploadedImageIds.push(uploaded.id);

          updateFileStatus(setFileStatuses, fileId, {
            progress: 100,
            result: uploaded,
            status: UploadStatus.COMPLETED,
          });

          if (socketEmit) {
            const completeData: IUploadProgressData = {
              fileId,
              fileName: selectedFile.name,
              progress: 100,
              status: UploadStatus.COMPLETED,
            };
            socketEmit('upload:progress', completeData);
          }
        } catch (fileError: unknown) {
          logger.error(`Upload failed for ${selectedFile.name}`, fileError);
          hasFailures = true;

          const errorMessage =
            fileError instanceof Error ? fileError.message : 'Upload failed';

          updateFileStatus(setFileStatuses, fileId, {
            error: errorMessage,
            status: UploadStatus.FAILED,
          });

          if (socketEmit) {
            const failData: IUploadProgressData = {
              error: errorMessage,
              fileId,
              fileName: selectedFile.name,
              progress: 0,
              status: UploadStatus.FAILED,
            };

            socketEmit('upload:progress', failData);
          }
        }
      }

      if (hasFailures) {
        return setError(
          'Some files failed to upload. Please check the failed files and try again.',
        );
      }

      // Step 2: Create training with uploaded images
      const service = await getTrainingsService();

      const formData = form.getValues();
      const body = {
        category: TrainingCategory.SUBJECT,
        description: formData.description,
        label: formData.label,
        sources: uploadedImageIds,
        steps: formData.steps,
        trigger: formData.trigger,
      };

      const training = await service.post(body);

      if (training) {
        logger.info('Training created successfully', training);

        // Store training ID for WebSocket listener
        currentTrainingIdRef.current = training.id;

        // Show notification that training is being processed
        notificationsService.info(
          'Training is being processed. You will be notified when it completes.',
        );

        // Close modal immediately - WebSocket will handle completion notification
        closeModalTrainingNew();
        onSuccess?.();
      }
    } catch (error: unknown) {
      logger.error('Failed to create training', error);

      const err = error as IHttpInterceptorError;

      if (err?.isTimeout) {
        return setError(
          'Request timed out. Please try again or check your connection.',
        );
      } else if (err?.isNetworkError) {
        return setError('Network error. Please check your connection.');
      } else if (err?.message) {
        setError(err.message);
      } else {
        return setError('Failed to create training. Please try again.');
      }
    }
  };

  const completedCount = Array.from(fileStatuses.values()).filter(
    (s) => s.status === UploadStatus.COMPLETED,
  ).length;

  const uploadingCount = Array.from(fileStatuses.values()).filter(
    (s) => s.status === UploadStatus.UPLOADING,
  ).length;

  const failedCount = Array.from(fileStatuses.values()).filter(
    (s) => s.status === UploadStatus.FAILED,
  ).length;

  return (
    <Modal
      id={ModalEnum.TRAINING_UPLOAD}
      title="Create New Training"
      error={error}
      onClose={() => setError(null)}
      modalBoxClassName="w-[80vw] max-w-[80vw]"
    >
      <form ref={formRef} onSubmit={onSubmit} className="flex flex-col">
        {hasFormErrors(form.formState.errors) && (
          <Alert type={AlertCategory.ERROR} className="mb-4">
            <div className="space-y-1">
              {parseFormErrors(form.formState.errors).map((error) => (
                <div key={error}>{error}</div>
              ))}
            </div>
          </Alert>
        )}

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
          {/* Left Column - Form Inputs & Dropzone */}
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

          {/* Right Column - Uploaded Files List */}
          <TrainingFileList
            files={files}
            fileStatuses={fileStatuses}
            maxSize={maxSize}
            completedCount={completedCount}
            uploadingCount={uploadingCount}
            failedCount={failedCount}
          />
        </div>

        {/* Footer - Actions */}
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
