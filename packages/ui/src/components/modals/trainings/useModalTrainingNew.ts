import { type TrainingSchema, trainingSchema } from '@genfeedai/client/schemas';
import {
  IngredientCategory,
  IngredientStatus,
  ModalEnum,
  TrainingCategory,
  UploadStatus,
} from '@genfeedai/enums';
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
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useForm } from 'react-hook-form';

type FileStatusUpdater = Dispatch<
  SetStateAction<Map<string, FileUploadStatus>>
>;

const RANDOM_TRIGGER_CHARS = 'BCDFGHJKLMNPQRSTVWXYZ23456789';
const RANDOM_TRIGGER_DIGITS = '23456789';

function getSecureRandomIndex(maxExclusive: number): number {
  const randomValues = new Uint32Array(1);
  const maxUint32 = 0xffffffff;
  const rejectionLimit = maxUint32 - (maxUint32 % maxExclusive);

  do {
    globalThis.crypto.getRandomValues(randomValues);
  } while (randomValues[0] >= rejectionLimit);

  return randomValues[0] % maxExclusive;
}

function buildRandomToken(
  length: number,
  chars = RANDOM_TRIGGER_CHARS,
): string {
  let token = '';

  for (let index = 0; index < length; index++) {
    token += chars[getSecureRandomIndex(chars.length)];
  }

  return token;
}

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

export function useModalTrainingNew({ onSuccess }: ModalTrainingNewProps) {
  const notificationsService = NotificationsService.getInstance();
  const [error, setError] = useState<string | null>(null);

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

  const [files, setFiles] = useState<File[]>([]);
  const [fileStatuses, setFileStatuses] = useState<
    Map<string, FileUploadStatus>
  >(new Map());

  const currentTrainingIdRef = useRef<string | null>(null);
  const { subscribe, isReady } = useSocketManager();

  const closeModalTrainingNew = useCallback(() => {
    closeModal(ModalEnum.TRAINING_UPLOAD);
    form.reset();
    setFiles([]);
    setFileStatuses(new Map());
    setError(null);
  }, [form]);

  useEffect(() => {
    if (!isReady || !currentTrainingIdRef.current) {
      return;
    }

    const trainingId = currentTrainingIdRef.current;

    const handleTrainingStatus = (data: unknown) => {
      logger.info('Training status update received', data);

      const update = data as TrainingStatusUpdate;

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

  const maxSize = 10;
  const maxFiles = 25;

  const generateRandomTrigger = () => {
    const len = getSecureRandomIndex(2) + 4;
    let token = buildRandomToken(len);
    const hasDigit = Array.from(token).some((ch) => ch >= '0' && ch <= '9');

    if (!hasDigit) {
      token =
        token.slice(0, -1) +
        RANDOM_TRIGGER_DIGITS[
          getSecureRandomIndex(RANDOM_TRIGGER_DIGITS.length)
        ];
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

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles && acceptedFiles.length > 0) {
        const remaining = maxFiles - files.length;

        if (remaining <= 0) {
          return setError(`Maximum ${maxFiles} files allowed`);
        }

        const allowedFiles = acceptedFiles.slice(0, remaining);

        allowedFiles.forEach((newFile) => {
          const fileId = `${newFile.name}-${Date.now()}-${buildRandomToken(8)}`;

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
    if (files.length < 10) {
      return setError('Please upload at least 10 images for training');
    }

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

          const presignedData = await mediaService.getPresignedUploadUrl(
            selectedFile.name,
            selectedFile.type,
            IngredientCategory.IMAGE,
          );

          await mediaService.uploadDirectToS3(
            selectedFile,
            presignedData.uploadUrl,
            handleProgress,
          );

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

        currentTrainingIdRef.current = training.id;

        notificationsService.info(
          'Training is being processed. You will be notified when it completes.',
        );

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

  const { isSubmitting, onSubmit } = useFormSubmitWithState(() =>
    handleSubmit(),
  );

  const formRef = useFocusFirstInput<HTMLFormElement>();

  const completedCount = Array.from(fileStatuses.values()).filter(
    (s) => s.status === UploadStatus.COMPLETED,
  ).length;

  const uploadingCount = Array.from(fileStatuses.values()).filter(
    (s) => s.status === UploadStatus.UPLOADING,
  ).length;

  const failedCount = Array.from(fileStatuses.values()).filter(
    (s) => s.status === UploadStatus.FAILED,
  ).length;

  return {
    _computedCost,
    clearError: () => setError(null),
    closeModalTrainingNew,
    completedCount,
    error,
    failedCount,
    fileStatuses,
    files,
    form,
    formRef: formRef as RefObject<HTMLFormElement | null>,
    getInputProps,
    getRootProps,
    isDragActive,
    isSubmitting,
    maxFiles,
    maxSize,
    onSubmit,
    uploadingCount,
    generateRandomTrigger,
  };
}
