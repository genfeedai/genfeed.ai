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
import type {
  IHttpInterceptorError,
  IUploadProgressData,
} from '@genfeedai/interfaces';
import type { FileUploadStatus } from '@genfeedai/interfaces/modals/file-upload-status.interface';
import type {
  ModalTrainingNewProps,
  TrainingStatusUpdate,
} from '@genfeedai/interfaces/training/modal-training-new.interface';
import {
  hasFormErrors,
  parseFormErrors,
} from '@helpers/ui/form-error/form-error.helper';
import { closeModal } from '@helpers/ui/modal/modal.helper';
import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useFocusFirstInput } from '@hooks/ui/use-focus-first-input/use-focus-first-input';
import { useFormSubmitWithState } from '@hooks/utils/use-form-submit/use-form-submit';
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { TrainingsService } from '@services/ai/trainings.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { SocketService } from '@services/core/socket.service';
import { ImagesService } from '@services/ingredients/images.service';
import Badge from '@ui/display/badge/Badge';
import Alert from '@ui/feedback/alert/Alert';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import FormDropdown from '@ui/primitives/dropdown-field';
import FormControl from '@ui/primitives/field';
import { Input } from '@ui/primitives/input';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useForm } from 'react-hook-form';
import {
  HiAdjustmentsHorizontal,
  HiArrowPath,
  HiArrowUp,
  HiPhoto,
  HiTag,
} from 'react-icons/hi2';

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

/**
 * Gets badge variant based on file upload status.
 */
function getStatusBadgeVariant(
  status: FileUploadStatus['status'],
): 'success' | 'error' | 'info' | 'ghost' {
  switch (status) {
    case UploadStatus.COMPLETED:
      return 'success';
    case UploadStatus.FAILED:
      return 'error';
    case UploadStatus.UPLOADING:
      return 'info';
    default:
      return 'ghost';
  }
}

/**
 * Gets badge label based on file upload status.
 */
function getStatusBadgeLabel(fileStatus: FileUploadStatus): string {
  switch (fileStatus.status) {
    case UploadStatus.UPLOADING:
      return `${fileStatus.progress}%`;
    case UploadStatus.COMPLETED:
      return '\u2713';
    case UploadStatus.FAILED:
      return '\u2717';
    default:
      return 'pending';
  }
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

  const formatSize = (bytes: number) => {
    const kb = bytes / 1024;
    const mb = kb / 1024;
    if (mb >= 1) {
      return `${mb.toFixed(1)} MB`;
    }
    if (kb >= 1) {
      return `${Math.ceil(kb)} KB`;
    }
    return `${bytes} B`;
  };

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

            if (socketService.socket?.emit) {
              const progressData: IUploadProgressData = {
                fileId,
                fileName: selectedFile.name,
                loaded,
                progress,
                status: UploadStatus.UPLOADING,
                total,
              };
              socketService.socket.emit('upload:progress', progressData);
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

          if (socketService.socket?.emit) {
            const completeData: IUploadProgressData = {
              fileId,
              fileName: selectedFile.name,
              progress: 100,
              status: UploadStatus.COMPLETED,
            };
            socketService.socket.emit('upload:progress', completeData);
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

          if (socketService.socket?.emit) {
            const failData: IUploadProgressData = {
              error: errorMessage,
              fileId,
              fileName: selectedFile.name,
              progress: 0,
              status: UploadStatus.FAILED,
            };

            socketService.socket.emit('upload:progress', failData);
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
              {parseFormErrors(form.formState.errors).map((error, index) => (
                <div key={index}>{error}</div>
              ))}
            </div>
          </Alert>
        )}

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
          {/* Left Column - Form Inputs & Dropzone */}
          <div className="space-y-4 mt-4">
            {/* First Row: Label + Description */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormControl
                label="Label"
                error={form.formState.errors.label?.message}
                isRequired
              >
                <Input
                  name="label"
                  type="text"
                  placeholder="e.g., My Character"
                  control={form.control}
                  className="h-10 border border-input px-3 w-full"
                  isDisabled={isSubmitting}
                />
              </FormControl>

              <FormControl
                label="Description (optional)"
                error={form.formState.errors.description?.message}
              >
                <Input
                  name="description"
                  type="text"
                  placeholder="Brief description of the training"
                  control={form.control}
                  className="h-10 border border-input px-3 w-full"
                  isDisabled={isSubmitting}
                />
              </FormControl>
            </div>

            {/* Second Row: Trigger Word */}
            <FormControl
              label="Trigger Word"
              error={form.formState.errors.trigger?.message}
              isRequired
            >
              <div className="flex w-full">
                <Input
                  name="trigger"
                  type="text"
                  placeholder="e.g., XQ7Z"
                  control={form.control}
                  className="h-10 border border-input px-3 flex-1"
                  isDisabled={isSubmitting}
                />

                <Button
                  icon={<HiArrowPath />}
                  onClick={generateRandomTrigger}
                  isDisabled={isSubmitting}
                  tooltip="Generate Random Trigger"
                  tooltipPosition="left"
                  variant={ButtonVariant.SECONDARY}
                  className=" border-l-0"
                />
              </div>
            </FormControl>

            {/* Third Row: Category + Steps */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormControl
                label="Category"
                isRequired
                error={form.formState.errors.category?.message}
              >
                <FormDropdown
                  name="category"
                  icon={<HiTag className="w-4 h-4" />}
                  label="Category"
                  value={form.watch('category')}
                  className="h-10 px-3 gap-2 text-sm flex-shrink-0 bg-secondary text-secondary-foreground"
                  isDisabled={isSubmitting}
                  options={[
                    { key: TrainingCategory.SUBJECT, label: 'Subject' },
                    { key: TrainingCategory.STYLE, label: 'Style' },
                  ]}
                  onChange={(e) => {
                    form.setValue(
                      'category',
                      e.target.value as TrainingCategory,
                      {
                        shouldValidate: true,
                      },
                    );
                  }}
                />
              </FormControl>

              <FormControl
                label="Training Steps"
                error={form.formState.errors.steps?.message}
                helpText="More steps = better quality, higher cost"
              >
                <FormDropdown
                  name="steps"
                  icon={<HiAdjustmentsHorizontal className="w-4 h-4" />}
                  label="Steps"
                  value={form.watch('steps')}
                  className="h-10 px-3 gap-2 text-sm flex-shrink-0 bg-secondary text-secondary-foreground"
                  isDisabled={isSubmitting}
                  options={[
                    { key: 1000, label: '1,000 (Low)' },
                    { key: 2000, label: '2,000 (Medium)' },
                    { key: 3000, label: '3,000 (Default)' },
                    { key: 4000, label: '4,000 (High)' },
                    { key: 5000, label: '5,000 (Best)' },
                  ]}
                  onChange={(e) => {
                    form.setValue('steps', Number(e.target.value), {
                      shouldValidate: true,
                    });
                  }}
                />
              </FormControl>
            </div>

            {/* Dropzone */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">
                Training Images ({files.length} / {maxFiles})
              </h4>

              <div
                {...getRootProps({
                  className: `file-uploader !max-w-full bg-primary/10 border-primary/10 border-2 border-dashed p-4 text-center cursor-pointer transition-all ${
                    isDragActive ? 'border-primary bg-primary/20' : ''
                  }`,
                })}
              >
                <input {...getInputProps({ name: 'file' })} />
                <div className="flex flex-col items-center gap-2">
                  <HiPhoto className="text-4xl opacity-50" />
                  {isDragActive ? (
                    <p className="text-sm">Drop the images here...</p>
                  ) : (
                    <>
                      <p className="text-sm font-medium">
                        Drop images here or click to upload
                      </p>
                      <p className="text-xs opacity-70">
                        Minimum 10 images required • Up to {maxFiles} files •
                        Max {maxSize}MB each
                      </p>
                      <p className="text-xs opacity-70">
                        Supported: JPG, JPEG, PNG, WEBP, GIF
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Uploaded Files List */}
          <div className="flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Uploaded Files</h4>
              {files.length > 0 && (
                <div className="flex gap-2">
                  {completedCount > 0 && (
                    <Badge variant="success" className="text-xs">
                      {completedCount} completed
                    </Badge>
                  )}

                  {uploadingCount > 0 && (
                    <Badge variant="info" className="text-xs">
                      {uploadingCount} uploading
                    </Badge>
                  )}

                  {failedCount > 0 && (
                    <Badge variant="error" className="text-xs">
                      {failedCount} failed
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {files.length === 0 ? (
              <div className="flex items-center justify-center h-full min-h-52 border-2 border-dashed border-white/[0.08]">
                <p className="text-sm opacity-50">
                  No files uploaded yet. Upload at least 10 images to start.
                </p>
              </div>
            ) : (
              <ul className="space-y-2 overflow-y-auto max-h-96">
                {files.map((f, idx) => {
                  const fileStatus = Array.from(fileStatuses.values()).find(
                    (status) => status.file.name === f.name,
                  );

                  return (
                    <li key={idx} className="space-y-1 p-2 bg-background/50">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="truncate max-w-56 text-sm"
                          title={f.name}
                        >
                          {f.name}
                        </span>

                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              f.size > maxSize * 1024 * 1024 ? 'error' : 'ghost'
                            }
                            className="whitespace-nowrap text-xs"
                          >
                            {formatSize(f.size)}
                          </Badge>
                          {fileStatus && (
                            <Badge
                              variant={getStatusBadgeVariant(fileStatus.status)}
                              className="text-xs whitespace-nowrap"
                            >
                              {getStatusBadgeLabel(fileStatus)}
                            </Badge>
                          )}
                        </div>
                      </div>

                      {fileStatus &&
                        fileStatus.status === UploadStatus.UPLOADING && (
                          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-primary h-full rounded-full transition-all duration-300 ease-out"
                              style={{ width: `${fileStatus.progress}%` }}
                            />
                          </div>
                        )}

                      {fileStatus &&
                        fileStatus.status === UploadStatus.FAILED &&
                        fileStatus.error && (
                          <div className="text-xs text-error opacity-80">
                            {fileStatus.error}
                          </div>
                        )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
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
            label={isSubmitting ? 'Training...' : 'Start Training'}
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
