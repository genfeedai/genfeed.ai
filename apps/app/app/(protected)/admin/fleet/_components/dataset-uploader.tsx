'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AdminFleetService } from '@services/admin/fleet.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { Button } from '@ui/primitives/button';
import { useCallback, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import DatasetDropZone from './dataset-drop-zone';
import DatasetFileList from './dataset-file-list';
import DatasetUploadResult from './dataset-upload-result';
import type { PairedFile, UploadResult } from './dataset-uploader.types';

interface DatasetUploaderProps {
  slug: string;
  onUploadComplete?: () => void;
}

function hasCaption(
  pair: PairedFile,
): pair is PairedFile & { caption: string } {
  return typeof pair.caption === 'string' && pair.caption.length > 0;
}

export default function DatasetUploader({
  slug,
  onUploadComplete,
}: DatasetUploaderProps) {
  const notificationsService = NotificationsService.getInstance();

  const getFleetService = useAuthedService((token: string) =>
    AdminFleetService.getInstance(token),
  );

  const [pairedFiles, setPairedFiles] = useState<PairedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  const imageFiles = useMemo(
    () => pairedFiles.map((p) => p.image),
    [pairedFiles],
  );

  const captions = useMemo(
    () =>
      pairedFiles.reduce<Array<{ caption: string; filenameStem: string }>>(
        (items, file) => {
          if (hasCaption(file)) {
            items.push({
              caption: file.caption,
              filenameStem: file.filenameStem,
            });
          }
          return items;
        },
        [],
      ),
    [pairedFiles],
  );

  const processDroppedFiles = useCallback((acceptedFiles: File[]) => {
    const images: File[] = [];
    const captionTexts = new Map<string, File>();

    // Separate images from text files
    for (const file of acceptedFiles) {
      if (file.type.startsWith('image/')) {
        images.push(file);
      } else if (file.name.endsWith('.txt') || file.type === 'text/plain') {
        const stem = file.name.replace(/\.txt$/i, '').toLowerCase();
        captionTexts.set(stem, file);
      }
    }

    // Read caption text files and pair with images in parallel
    Promise.all(
      images.map((imageFile) => {
        const stem = imageFile.name.replace(/\.[^.]+$/, '').toLowerCase();
        const captionFile = captionTexts.get(stem);
        const captionPromise = captionFile
          ? captionFile.text()
          : Promise.resolve(undefined);
        return captionPromise.then((caption) => ({
          caption,
          filenameStem: stem,
          image: imageFile,
        }));
      }),
    )
      .then((newPairs) => {
        setPairedFiles((prev) => [...prev, ...newPairs]);
      })
      .catch((error) => {
        logger.error('Failed to process dropped files', error);
      });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'image/*': ['.jpg', '.jpeg', '.png', '.webp'],
      'text/plain': ['.txt'],
    },
    maxSize: 50 * 1024 * 1024,
    onDrop: processDroppedFiles,
  });

  const handleRemoveFile = useCallback((index: number) => {
    setPairedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleClearAll = useCallback(() => {
    setPairedFiles([]);
    setUploadResult(null);
    setUploadProgress(0);
  }, []);

  const handleUpload = useCallback(async () => {
    if (imageFiles.length === 0) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadResult(null);

    try {
      const service = await getFleetService();
      const result = await service.uploadDataset(
        slug,
        imageFiles,
        captions.length > 0 ? captions : undefined,
        (progress) => setUploadProgress(progress),
      );

      setUploadResult({
        failed: result.failed,
        failedCount: result.failedCount,
        uploadedCount: result.uploadedCount,
      });

      if (result.uploadedCount > 0) {
        notificationsService.success(
          `${result.uploadedCount} image(s) uploaded to dataset`,
        );
      }

      if (result.failedCount > 0) {
        notificationsService.error(
          `${result.failedCount} image(s) failed to upload`,
        );
      }

      // Clear files on full success
      if (result.failedCount === 0) {
        setPairedFiles([]);
        onUploadComplete?.();
      }
    } catch (error) {
      logger.error('Dataset upload failed', error);
      notificationsService.error('Failed to upload dataset');
    } finally {
      setIsUploading(false);
    }
  }, [
    imageFiles,
    captions,
    slug,
    getFleetService,
    notificationsService,
    onUploadComplete,
  ]);

  const pairedCount = pairedFiles.filter((p) => p.caption).length;
  const unpairedCount = pairedFiles.length - pairedCount;

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <DatasetDropZone
        getRootProps={getRootProps}
        getInputProps={getInputProps}
        isDragActive={isDragActive}
      />

      {/* File List */}
      {pairedFiles.length > 0 && (
        <DatasetFileList
          pairedFiles={pairedFiles}
          pairedCount={pairedCount}
          unpairedCount={unpairedCount}
          onClearAll={handleClearAll}
          onRemoveFile={handleRemoveFile}
        />
      )}

      {/* Upload Progress */}
      {isUploading && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground/60">Uploading…</span>
            <span className="font-medium">{uploadProgress}%</span>
          </div>
          <div className="w-full bg-foreground/10 rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Upload Results */}
      {uploadResult && <DatasetUploadResult uploadResult={uploadResult} />}

      {/* Upload Button */}
      {pairedFiles.length > 0 && (
        <Button
          variant={ButtonVariant.DEFAULT}
          className="w-full"
          onClick={handleUpload}
          isDisabled={isUploading || pairedFiles.length === 0}
          isLoading={isUploading}
          label={`Upload ${pairedFiles.length} image${pairedFiles.length !== 1 ? 's' : ''} to Dataset`}
        />
      )}
    </div>
  );
}
