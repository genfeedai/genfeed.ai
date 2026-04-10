import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  AssetCategory,
  AssetScope,
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
  ModalEnum,
  UploadStatus,
  VoiceProvider,
} from '@genfeedai/enums';
import { closeModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useAudioRecording } from '@genfeedai/hooks/media/use-audio-recording/use-audio-recording';
import { useFocusFirstInput } from '@genfeedai/hooks/ui/use-focus-first-input/use-focus-first-input';
import { useModalAutoOpen } from '@genfeedai/hooks/ui/use-modal-auto-open/use-modal-auto-open';
import { useFormSubmitWithState } from '@genfeedai/hooks/utils/use-form-submit/use-form-submit';
import type {
  IAsset,
  IHttpInterceptorError,
  IIngredient,
  IUploadProgressData,
} from '@genfeedai/interfaces';
import type { FileUploadStatus } from '@genfeedai/interfaces/modals/file-upload-status.interface';
import type { Asset } from '@genfeedai/models/ingredients/asset.model';
import type { ModalUploadProps } from '@genfeedai/props/modals/modal.props';
import { AssetsService } from '@genfeedai/services/content/assets.service';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { SocketService } from '@genfeedai/services/core/socket.service';
import { VoiceCloneService } from '@genfeedai/services/ingredients/voice-clone.service';
import { IngredientEndpoints } from '@genfeedai/utils/media/ingredients.util';
import { ScopeSelector } from '@ui/assets/ScopeSelector';
import Badge from '@ui/display/badge/Badge';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { RadioGroup, RadioGroupItem } from '@ui/primitives/radio-group';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { HiMicrophone, HiStop } from 'react-icons/hi2';

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

/**
 * Gets max file size in MB based on category.
 */
function getMaxFileSize(
  isImageLike: boolean,
  isAudioLike: boolean,
  isVideoLike: boolean,
): number {
  if (isImageLike) {
    return 10;
  }
  if (isAudioLike) {
    return 25;
  }
  if (isVideoLike) {
    return 50;
  }
  return 10;
}

/**
 * Gets accepted file extensions based on category.
 */
function getAcceptedTypes(
  isImageLike: boolean,
  isVideoLike: boolean,
  isAudioLike: boolean,
): string[] {
  if (isImageLike) {
    return ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  }
  if (isVideoLike) {
    return ['.mp4', '.avi', '.mov', '.mkv', '.webm'];
  }
  if (isAudioLike) {
    return ['.mp3', '.wav', '.aac', '.flac', '.ogg'];
  }
  return [];
}

/**
 * Gets dimension recommendation text based on width/height constraints.
 */
function getDimensionText(width?: number, height?: number): string {
  if (width && height) {
    return `Recommended size: ${width}x${height}px`;
  }
  if (width) {
    return `Recommended width: ${width}px`;
  }
  if (height) {
    return `Recommended height: ${height}px`;
  }
  return '';
}

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
  const { selectedBrand, darkroomCapabilities } = useBrand();
  const [error, setError] = useState<string | null>(null);
  const [dimensionWarning, setDimensionWarning] = useState<string | null>(null);
  const [fileStatuses, setFileStatuses] = useState<
    Map<string, FileUploadStatus>
  >(new Map());
  const [scope, setScope] = useState<AssetScope>(AssetScope.USER);

  const getAssetsService = useAuthedService((token: string) =>
    AssetsService.getInstance(token),
  );

  const getIngredientsService = useAuthedService((token: string) => {
    const endpoint = IngredientEndpoints.getEndpointFromTypeOrPath(category);
    return IngredientsService.getInstance(endpoint, token);
  });
  const getVoiceCloneService = useAuthedService((token: string) =>
    VoiceCloneService.getInstance(token),
  );

  useModalAutoOpen(ModalEnum.UPLOAD, { isOpen, openKey });

  const { isSubmitting, onSubmit } = useFormSubmitWithState(() =>
    handleSubmit(),
  );

  const formRef = useFocusFirstInput<HTMLFormElement>();

  const [files, setFiles] = useState<File[]>([]);
  const [urlValue, setUrlValue] = useState('');
  const [voiceCloneName, setVoiceCloneName] = useState('');
  const [voiceCloneProvider, setVoiceCloneProvider] = useState<VoiceProvider>(
    VoiceProvider.ELEVENLABS,
  );
  const hasAutoQueuedInitialFilesRef = useRef(false);
  const hasAutoSubmittedRef = useRef(false);

  const isVoiceLike =
    category === IngredientCategory.VOICE || category === 'voice';
  const isSelfHostedVoiceAvailable =
    Boolean(selectedBrand?.isDarkroomEnabled) &&
    Boolean(darkroomCapabilities?.fleet.voices);

  const {
    clearRecordedFile,
    error: recordingError,
    isRecording,
    isSupported: isRecordingSupported,
    recordedFile,
    startRecording,
    stopRecording,
  } = useAudioRecording({
    onError: (message) => {
      setError(message);
    },
  });

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

  // Ensure file extension is lowercase
  const normalizeFileName = (fileName: string): string => {
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex === -1) {
      return fileName;
    }

    const nameWithoutExt = fileName.substring(0, lastDotIndex);
    const ext = fileName.substring(lastDotIndex).toLowerCase();
    return nameWithoutExt + ext;
  };

  // Max file size (in MB) per media type
  const isImageLike =
    category === IngredientCategory.IMAGE ||
    category === AssetCategory.BANNER ||
    category === AssetCategory.LOGO ||
    category === AssetCategory.REFERENCE;

  const isVideoLike = category === IngredientCategory.VIDEO;

  const isAudioLike =
    category === IngredientCategory.AUDIO ||
    category === IngredientCategory.MUSIC ||
    isVoiceLike;

  const maxSize = getMaxFileSize(isImageLike, isAudioLike, isVideoLike);

  // Determine max files: use prop if provided, otherwise defaults
  let maxFiles =
    maxFilesProp ||
    (category === AssetCategory.LOGO || category === AssetCategory.BANNER
      ? 1
      : 5);
  if (!isMultiple) {
    maxFiles = 1;
  }

  const enqueueFiles = useCallback(
    (acceptedFiles: File[]) => {
      if (!acceptedFiles || acceptedFiles.length === 0) {
        return;
      }

      clearRecordedFile();

      const existingNames = new Set(files.map((file) => file.name));
      const remaining = maxFiles - files.length;

      if (remaining <= 0) {
        return;
      }

      acceptedFiles.slice(0, remaining).forEach((originalFile) => {
        const normalizedName = normalizeFileName(originalFile.name);
        const newFile =
          normalizedName !== originalFile.name
            ? new File([originalFile], normalizedName, {
                type: originalFile.type,
              })
            : originalFile;

        if (existingNames.has(newFile.name)) {
          return;
        }

        const appendFile = () => {
          setError(null);
          setFiles((prev) => [...prev, newFile]);
          const fileId = `${newFile.name}-${Date.now()}-${Math.random()}`;
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
        };

        if (
          newFile.type.startsWith('image') &&
          ((width && width > 0) || (height && height > 0))
        ) {
          const img = new Image();
          img.onload = () => {
            if (
              (width && img.width !== width) ||
              (height && img.height !== height)
            ) {
              setDimensionWarning(
                `Uploaded image is ${img.width}x${img.height}px; recommended ${width || 'any'}x${height || 'any'}px.`,
              );
            } else {
              setDimensionWarning(null);
            }

            appendFile();
          };

          img.src = URL.createObjectURL(newFile);
          return;
        }

        setDimensionWarning(null);
        appendFile();
      });
    },
    [clearRecordedFile, files, height, maxFiles, width],
  );

  const normalizedInitialFiles = useMemo(
    () => (initialFiles ?? []).slice(0, maxFiles),
    [initialFiles, maxFiles],
  );

  useEffect(() => {
    hasAutoQueuedInitialFilesRef.current = false;
    hasAutoSubmittedRef.current = false;
  }, [openKey]);

  useEffect(() => {
    if (
      voiceCloneProvider === VoiceProvider.GENFEED_AI &&
      !isSelfHostedVoiceAvailable
    ) {
      setVoiceCloneProvider(VoiceProvider.ELEVENLABS);
    }
  }, [isSelfHostedVoiceAvailable, voiceCloneProvider]);

  useEffect(() => {
    if (
      !isOpen ||
      hasAutoQueuedInitialFilesRef.current ||
      normalizedInitialFiles.length === 0
    ) {
      return;
    }

    hasAutoQueuedInitialFilesRef.current = true;
    enqueueFiles(normalizedInitialFiles);
  }, [enqueueFiles, isOpen, normalizedInitialFiles]);

  useEffect(() => {
    if (
      !autoSubmit ||
      !isOpen ||
      hasAutoSubmittedRef.current ||
      files.length === 0 ||
      files.length < normalizedInitialFiles.length
    ) {
      return;
    }

    hasAutoSubmittedRef.current = true;
    const frame = requestAnimationFrame(() => {
      formRef.current?.requestSubmit();
    });

    return () => cancelAnimationFrame(frame);
  }, [
    autoSubmit,
    files.length,
    formRef,
    isOpen,
    normalizedInitialFiles.length,
  ]);

  const closeModalUpload = (
    newIngredient?: IIngredient | IAsset,
    uploadedIngredients: (IIngredient | IAsset)[] = [],
  ) => {
    closeModal(ModalEnum.UPLOAD);

    setFiles([]);
    setUrlValue('');
    setFileStatuses(new Map());
    setScope(AssetScope.USER);
    setVoiceCloneName('');
    setVoiceCloneProvider(VoiceProvider.ELEVENLABS);
    clearRecordedFile();

    onConfirm(newIngredient);
    onComplete?.(uploadedIngredients);
  };

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      enqueueFiles(acceptedFiles);
    },
    [enqueueFiles],
  );

  const { getRootProps, getInputProps } = useDropzone({
    accept: {
      ...(isImageLike && {
        'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
      }),
      ...(isVideoLike && {
        'video/*': ['.mp4', '.avi', '.mov', '.mkv', '.webm'],
      }),
      ...(isAudioLike && {
        'audio/*': ['.mp3', '.wav', '.aac', '.flac', '.ogg'],
      }),
    },
    maxFiles,
    maxSize: maxSize * 1024 * 1024,
    multiple: maxFiles > 1,
    onDrop,
    onDropRejected: (rejections) => {
      // Show specific error when file is too large
      const tooLarge = rejections.some((rej) =>
        rej.errors.some((e) => e.code === 'file-too-large'),
      );

      if (tooLarge) {
        return setError(
          `File is too large. Maximum size is ${maxSize}MB${isImageLike ? ' for images' : ''}.`,
        );
      }

      // Fallback for other rejections
      setError(
        'One or more files were rejected. Please check file type and size.',
      );
    },
  });

  const acceptedTypes = getAcceptedTypes(isImageLike, isVideoLike, isAudioLike);

  const dimensionText = getDimensionText(width, height);
  const selectedFileList = recordedFile ? [recordedFile] : files;

  const handleSubmit = async () => {
    let selectedFiles = selectedFileList;

    if (selectedFiles.length === 0 && urlValue) {
      try {
        const response = await fetch(urlValue);
        const blob = await response.blob();
        let name = urlValue.split('/').pop()?.split('?')[0] || 'upload';

        // Normalize filename with lowercase extension
        name = normalizeFileName(name);

        selectedFiles = [new File([blob], name, { type: blob.type })];
      } catch (error) {
        return logger.error(`GET ${urlValue} failed`, error);
      }
    }

    if (selectedFiles.length === 0) {
      return;
    }

    if (isVoiceLike) {
      if (!voiceCloneName.trim()) {
        setError('Voice name is required.');
        return;
      }

      try {
        const service = await getVoiceCloneService();
        const formData = new FormData();
        formData.append('name', voiceCloneName.trim());
        formData.append('provider', voiceCloneProvider);
        formData.append('file', selectedFiles[0]);

        const voice = await service.cloneVoice(formData);
        closeModalUpload(voice, [voice]);
      } catch (error: unknown) {
        logger.error('POST /voices/clone failed', error);
        setError(
          error instanceof Error ? error.message : 'Voice cloning failed.',
        );
      }
      return;
    }

    const url = 'POST /(media|asset)/upload';
    const socketService = SocketService.getInstance();

    // Get file IDs from the status map
    const fileIds = Array.from(fileStatuses.keys());

    // Check if we should use presigned URLs (configurable via env or feature flag)
    const usePresignedUrls = EnvironmentService.USE_PRESIGNED_URLS;

    try {
      let lastUploaded: IIngredient | Asset | undefined;
      let hasFailures = false;
      const completedUploads: (IIngredient | IAsset)[] = [];

      for (let i = 0; i < selectedFiles.length; i++) {
        const selectedFile = selectedFiles[i];
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

            // Emit WebSocket event for progress tracking
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

          let uploaded: IIngredient | Asset | undefined;

          if (
            usePresignedUrls &&
            category !== AssetCategory.LOGO &&
            category !== AssetCategory.BANNER &&
            category !== AssetCategory.REFERENCE
          ) {
            // Use presigned URL for media uploads
            const mediaService = await getIngredientsService();

            // Step 1: Get presigned URL
            const presignedData = await mediaService.getPresignedUploadUrl(
              selectedFile.name,
              selectedFile.type,
              category,
            );

            // Step 2: Upload directly to S3
            await mediaService.uploadDirectToS3(
              selectedFile,
              presignedData.uploadUrl,
              handleProgress,
            );

            // Step 3: Confirm upload completion
            uploaded = await mediaService.confirmUpload(presignedData.id);
            logger.info(`${url} success (presigned)`, uploaded);
          } else {
            // Fallback to traditional upload through server
            const formData = new FormData();
            formData.append('category', category);
            formData.append('file', selectedFile);
            formData.append('scope', scope);

            if (parentId) {
              formData.append('parent', parentId);
            }

            if (parentModel) {
              formData.append('parentModel', parentModel);
            }

            if (
              category === AssetCategory.LOGO ||
              category === AssetCategory.BANNER ||
              category === AssetCategory.REFERENCE
            ) {
              const assetsService = await getAssetsService();
              uploaded = await assetsService.postUpload(
                formData,
                handleProgress,
              );
              logger.info(`${url} success`, uploaded);
            } else {
              const mediaService = await getIngredientsService();
              uploaded = await mediaService.postUpload(
                formData,
                handleProgress,
              );
              logger.info(`${url} success`, uploaded);
            }
          }

          lastUploaded = uploaded;
          if (uploaded) {
            completedUploads.push(uploaded);
          }

          updateFileStatus(setFileStatuses, fileId, {
            progress: 100,
            result: uploaded,
            status: UploadStatus.COMPLETED,
          });

          // Emit completion event
          if (socketService.socket?.emit) {
            const completeData: IUploadProgressData = {
              fileId,
              fileName: selectedFile.name,
              progress: 100,
              status: UploadStatus.COMPLETED,
            };
            socketService.socket.emit('upload:progress', completeData);
          }
        } catch (error: unknown) {
          logger.error(`Upload failed for ${selectedFile.name}`, error);
          hasFailures = true;

          const errorMessage =
            error instanceof Error ? error.message : 'Upload failed';

          updateFileStatus(setFileStatuses, fileId, {
            error: errorMessage,
            status: UploadStatus.FAILED,
          });

          // Emit failure event
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

      // Only close if all uploads succeeded
      if (!hasFailures) {
        closeModalUpload(
          lastUploaded as IIngredient | IAsset,
          completedUploads,
        );
      } else {
        setError(
          'Some files failed to upload. Please check the failed files and try again.',
        );
      }
    } catch (error: unknown) {
      logger.error(`${url} failed`, error);

      // Set user-friendly error message based on error type
      const err = error as IHttpInterceptorError;

      if (err?.isTimeout) {
        setError(
          'Upload timed out. Please try with smaller files or check your connection.',
        );
      } else if (err?.isNetworkError) {
        setError('Network error during upload. Please check your connection.');
      } else if (error instanceof Error) {
        setError(error.message);
      } else {
        setError('Upload failed. Please try again.');
      }
    }
  };

  return (
    <Modal
      id={ModalEnum.UPLOAD}
      title={isVoiceLike ? 'Clone Voice' : `Upload ${category}`}
      error={error}
      onClose={() => setError(null)}
    >
      <form ref={formRef} onSubmit={onSubmit}>
        {isVoiceLike ? (
          <div className="mb-4 space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Voice name</p>
              <Input
                onChange={(event) => setVoiceCloneName(event.target.value)}
                placeholder="My Voice"
                value={voiceCloneName}
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Provider</p>
              <RadioGroup
                className="flex flex-wrap gap-4"
                onValueChange={(value) =>
                  setVoiceCloneProvider(value as VoiceProvider)
                }
                value={voiceCloneProvider}
              >
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <RadioGroupItem value={VoiceProvider.ELEVENLABS} />
                  <span>ElevenLabs</span>
                </label>
                {isSelfHostedVoiceAvailable && (
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <RadioGroupItem value={VoiceProvider.GENFEED_AI} />
                    <span>Genfeed AI</span>
                  </label>
                )}
              </RadioGroup>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                icon={isRecording ? <HiStop /> : <HiMicrophone />}
                onClick={() => {
                  if (isRecording) {
                    stopRecording();
                    return;
                  }

                  startRecording().catch((err) => {
                    logger.error('Failed to start recording', err);
                  });
                }}
                type="button"
                variant={ButtonVariant.SECONDARY}
                withWrapper={false}
              >
                {isRecording ? 'Stop recording' : 'Record sample'}
              </Button>
              {isRecordingSupported ? (
                <span className="text-xs text-muted-foreground">
                  Record a short clean voice sample directly from your
                  microphone.
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Microphone recording is not supported in this browser.
                </span>
              )}
            </div>

            {recordedFile ? (
              <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 text-sm text-muted-foreground">
                Recorded sample ready: {recordedFile.name}
              </div>
            ) : null}
            {recordingError ? (
              <div className="text-xs text-destructive">{recordingError}</div>
            ) : null}
          </div>
        ) : null}

        <div
          {...getRootProps({
            className:
              'file-uploader !max-w-full bg-primary/10 border-primary/10 border-1 border-dashed p-4 text-center cursor-pointer',
          })}
        >
          <Input type="file" {...getInputProps({ name: 'file' })} />
          {selectedFileList.length > 0 ? (
            <div className="text-left space-y-1">
              <div className="text-xs opacity-70">
                {selectedFileList.length} / {maxFiles} selected
              </div>
              <ul className="space-y-2">
                {selectedFileList.map((f, idx) => {
                  // Find the status for this file
                  const fileStatus = Array.from(fileStatuses.values()).find(
                    (status) => status.file.name === f.name,
                  );

                  return (
                    <li key={idx} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate max-w-52" title={f.name}>
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
            </div>
          ) : (
            <p>Drop files here or click to upload</p>
          )}
        </div>

        {/* TO DO: Upload image via an URL */}
        {/* <FormControl label="Image URL (optional)">
          <Input
            type="url"
            placeholder="https://example.com/image.jpg"
            value={urlValue}
            onChange={(e:any) => setUrlValue(e.target.value)}
            className="h-10 border border-border px-3 w-full bg-card"
          />
        </FormControl> */}

        {(acceptedTypes.length > 0 ||
          dimensionText ||
          maxFiles >= 1 ||
          dimensionWarning) && (
          <div className="text-xs text-muted-foreground mt-3 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="opacity-70">Requirements</span>
              <Badge variant="ghost">
                {maxFiles === 1 ? 'Single file' : `Up to ${maxFiles} files`}
              </Badge>

              <Badge variant="ghost">≤ {maxSize}MB each</Badge>

              {acceptedTypes.length > 0 && (
                <Badge variant="ghost">
                  {acceptedTypes
                    .map((e) => e.replace('.', '').toUpperCase())
                    .join(', ')}
                </Badge>
              )}
            </div>
            {dimensionWarning ? (
              <p className="text-warning">{dimensionWarning}</p>
            ) : (
              dimensionText && <div className="opacity-80">{dimensionText}</div>
            )}
          </div>
        )}

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
