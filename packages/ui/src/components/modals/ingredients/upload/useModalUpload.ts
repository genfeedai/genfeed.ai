'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  AssetCategory,
  AssetScope,
  IngredientCategory,
  ModalEnum,
  UploadStatus,
  VoiceProvider,
} from '@genfeedai/enums';
import { closeModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { useAudioRecording } from '@genfeedai/hooks/media/use-audio-recording/use-audio-recording';
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
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDropzone } from 'react-dropzone';
import {
  getAcceptedTypes,
  getDimensionText,
  getMaxFileSize,
  updateFileStatus,
} from './upload.utils';

type UseModalUploadParams = Pick<
  ModalUploadProps,
  | 'category'
  | 'parentId'
  | 'parentModel'
  | 'onConfirm'
  | 'onComplete'
  | 'width'
  | 'height'
  | 'isMultiple'
  | 'maxFiles'
  | 'initialFiles'
  | 'autoSubmit'
  | 'isOpen'
  | 'openKey'
> & {
  formRef: RefObject<HTMLFormElement | null>;
};

export function useModalUpload({
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
  formRef,
}: UseModalUploadParams) {
  const { selectedBrand, darkroomCapabilities } = useBrand();
  const [error, setError] = useState<string | null>(null);
  const [dimensionWarning, setDimensionWarning] = useState<string | null>(null);
  const [fileStatuses, setFileStatuses] = useState<
    Map<string, FileUploadStatus>
  >(new Map());
  const [scope, setScope] = useState<AssetScope>(AssetScope.USER);
  const [files, setFiles] = useState<File[]>([]);
  const [urlValue, setUrlValue] = useState('');
  const [voiceCloneName, setVoiceCloneName] = useState('');
  const [voiceCloneProvider, setVoiceCloneProvider] = useState<VoiceProvider>(
    VoiceProvider.ELEVENLABS,
  );

  const hasAutoQueuedInitialFilesRef = useRef(false);
  const hasAutoSubmittedRef = useRef(false);

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

  const normalizeFileName = (fileName: string): string => {
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex === -1) {
      return fileName;
    }
    const nameWithoutExt = fileName.substring(0, lastDotIndex);
    const ext = fileName.substring(lastDotIndex).toLowerCase();
    return nameWithoutExt + ext;
  };

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

  const handleStartRecording = useCallback(() => {
    startRecording().catch((err) => {
      logger.error('Failed to start recording', err);
    });
  }, [startRecording]);

  const handleSubmit = async () => {
    let selectedFiles = recordedFile ? [recordedFile] : files;

    if (selectedFiles.length === 0 && urlValue) {
      try {
        const response = await fetch(urlValue);
        const blob = await response.blob();
        let name = urlValue.split('/').pop()?.split('?')[0] || 'upload';
        name = normalizeFileName(name);
        selectedFiles = [new File([blob], name, { type: blob.type })];
      } catch (err) {
        return logger.error(`GET ${urlValue} failed`, err);
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
      } catch (err: unknown) {
        logger.error('POST /voices/clone failed', err);
        setError(err instanceof Error ? err.message : 'Voice cloning failed.');
      }
      return;
    }

    const url = 'POST /(media|asset)/upload';
    const socketService = SocketService.getInstance();
    const fileIds = Array.from(fileStatuses.keys());
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

          let uploaded: IIngredient | Asset | undefined;

          if (
            usePresignedUrls &&
            category !== AssetCategory.LOGO &&
            category !== AssetCategory.BANNER &&
            category !== AssetCategory.REFERENCE
          ) {
            const mediaService = await getIngredientsService();
            const presignedData = await mediaService.getPresignedUploadUrl(
              selectedFile.name,
              selectedFile.type,
              category,
            );
            await mediaService.uploadDirectToS3(
              selectedFile,
              presignedData.uploadUrl,
              handleProgress,
              { key: presignedData.s3Key, type: category },
            );
            uploaded = await mediaService.confirmUpload(presignedData.id);
            logger.info(`${url} success (presigned)`, uploaded);
          } else {
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

          if (socketEmit) {
            const completeData: IUploadProgressData = {
              fileId,
              fileName: selectedFile.name,
              progress: 100,
              status: UploadStatus.COMPLETED,
            };
            socketEmit('upload:progress', completeData);
          }
        } catch (err: unknown) {
          logger.error(`Upload failed for ${selectedFile.name}`, err);
          hasFailures = true;
          const errorMessage =
            err instanceof Error ? err.message : 'Upload failed';
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
    } catch (err: unknown) {
      logger.error(`${url} failed`, err);
      const castErr = err as IHttpInterceptorError;
      if (castErr?.isTimeout) {
        setError(
          'Upload timed out. Please try with smaller files or check your connection.',
        );
      } else if (castErr?.isNetworkError) {
        setError('Network error during upload. Please check your connection.');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Upload failed. Please try again.');
      }
    }
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
      const tooLarge = rejections.some((rej) =>
        rej.errors.some((e) => e.code === 'file-too-large'),
      );
      if (tooLarge) {
        return setError(
          `File is too large. Maximum size is ${maxSize}MB${isImageLike ? ' for images' : ''}.`,
        );
      }
      setError(
        'One or more files were rejected. Please check file type and size.',
      );
    },
  });

  const acceptedTypes = getAcceptedTypes(isImageLike, isVideoLike, isAudioLike);
  const dimensionText = getDimensionText(width, height);
  const selectedFileList = recordedFile ? [recordedFile] : files;

  return {
    // state
    error,
    setError,
    dimensionWarning,
    fileStatuses,
    scope,
    setScope,
    files,
    urlValue,
    setUrlValue,
    voiceCloneName,
    setVoiceCloneName,
    voiceCloneProvider,
    setVoiceCloneProvider,
    // derived booleans & computed
    isVoiceLike,
    isSelfHostedVoiceAvailable,
    isImageLike,
    isVideoLike,
    isAudioLike,
    maxSize,
    maxFiles,
    acceptedTypes,
    dimensionText,
    selectedFileList,
    // recording
    recordingError,
    isRecording,
    isRecordingSupported,
    recordedFile,
    stopRecording,
    // handlers
    handleStartRecording,
    handleSubmit,
    closeModalUpload,
    // dropzone
    getRootProps,
    getInputProps,
    // format helper
    formatSize,
  };
}
