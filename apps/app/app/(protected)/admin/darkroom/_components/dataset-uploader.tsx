'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AdminDarkroomService } from '@services/admin/darkroom.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { useCallback, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  HiOutlineCheckCircle,
  HiOutlineCloudArrowUp,
  HiOutlineDocumentText,
  HiOutlineExclamationCircle,
  HiOutlinePhoto,
  HiOutlineTrash,
} from 'react-icons/hi2';

interface PairedFile {
  image: File;
  caption?: string;
  filenameStem: string;
}

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

  const getDarkroomService = useAuthedService((token: string) =>
    AdminDarkroomService.getInstance(token),
  );

  const [pairedFiles, setPairedFiles] = useState<PairedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<{
    uploadedCount: number;
    failedCount: number;
    failed: { filename: string; error: string }[];
  } | null>(null);

  const imageFiles = useMemo(
    () => pairedFiles.map((p) => p.image),
    [pairedFiles],
  );

  const captions = useMemo(
    () =>
      pairedFiles
        .filter(hasCaption)
        .map((p) => ({ caption: p.caption, filenameStem: p.filenameStem })),
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

    // Read caption text files and pair with images
    const readPromises = images.map(async (imageFile) => {
      const stem = imageFile.name.replace(/\.[^.]+$/, '').toLowerCase();
      const captionFile = captionTexts.get(stem);
      let caption: string | undefined;

      if (captionFile) {
        caption = await captionFile.text();
      }

      return { caption, filenameStem: stem, image: imageFile };
    });

    Promise.all(readPromises)
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
      const service = await getDarkroomService();
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
    getDarkroomService,
    notificationsService,
    onUploadComplete,
  ]);

  const pairedCount = pairedFiles.filter((p) => p.caption).length;
  const unpairedCount = pairedFiles.length - pairedCount;

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        {...getRootProps({
          className: `border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive
              ? 'border-primary bg-primary/5'
              : 'border-foreground/15 hover:border-foreground/30 bg-foreground/[0.02]'
          }`,
        })}
      >
        <Input {...getInputProps()} />
        <HiOutlineCloudArrowUp className="w-10 h-10 mx-auto mb-3 text-foreground/40" />
        <p className="text-sm font-medium text-foreground/70">
          {isDragActive
            ? 'Drop files here...'
            : 'Drop training images + caption .txt files here'}
        </p>
        <p className="text-xs text-foreground/40 mt-1">
          Pair images with captions by matching filenames (e.g. photo1.png +
          photo1.txt)
        </p>
        <div className="flex items-center justify-center gap-2 mt-3">
          <Badge variant="ghost">JPG, PNG, WEBP</Badge>
          <Badge variant="ghost">+ .txt captions</Badge>
          <Badge variant="ghost">50MB max per file</Badge>
        </div>
      </div>

      {/* File List */}
      {pairedFiles.length > 0 && (
        <Card>
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">
                  {pairedFiles.length} image
                  {pairedFiles.length !== 1 ? 's' : ''}
                </span>
                {pairedCount > 0 && (
                  <Badge variant="success">{pairedCount} with captions</Badge>
                )}
                {unpairedCount > 0 && (
                  <Badge variant="ghost">
                    {unpairedCount} without captions
                  </Badge>
                )}
              </div>

              <Button
                variant={ButtonVariant.GHOST}
                className="text-xs text-foreground/50 hover:text-error"
                onClick={handleClearAll}
              >
                Clear all
              </Button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {pairedFiles.map((pair, index) => (
                <div
                  key={`${pair.filenameStem}-${pair.image.name}-${pair.image.lastModified}`}
                  className="flex items-center gap-3 p-2 rounded bg-foreground/[0.03] group"
                >
                  {/* Thumbnail */}
                  <div className="w-10 h-10 rounded overflow-hidden bg-foreground/5 flex-shrink-0">
                    {/* biome-ignore lint/performance/noImgElement: object URLs are local preview blobs */}
                    <img
                      alt={pair.image.name}
                      className="w-full h-full object-cover"
                      src={URL.createObjectURL(pair.image)}
                    />
                  </div>

                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <HiOutlinePhoto className="w-3.5 h-3.5 text-foreground/40 flex-shrink-0" />
                      <span
                        className="text-sm truncate"
                        title={pair.image.name}
                      >
                        {pair.image.name}
                      </span>
                    </div>
                    {pair.caption && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <HiOutlineDocumentText className="w-3.5 h-3.5 text-success/60 flex-shrink-0" />
                        <span
                          className="text-xs text-foreground/50 truncate"
                          title={pair.caption}
                        >
                          {pair.caption}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Status badge */}
                  <Badge variant={pair.caption ? 'success' : 'ghost'}>
                    {pair.caption ? 'Paired' : 'No caption'}
                  </Badge>

                  {/* Remove button */}
                  <Button
                    variant={ButtonVariant.GHOST}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1"
                    onClick={() => handleRemoveFile(index)}
                  >
                    <HiOutlineTrash className="w-4 h-4 text-foreground/40 hover:text-error" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Upload Progress */}
      {isUploading && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground/60">Uploading...</span>
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
      {uploadResult && (
        <Card>
          <div className="p-4 space-y-2">
            {uploadResult.uploadedCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-success">
                <HiOutlineCheckCircle className="w-4 h-4" />
                {uploadResult.uploadedCount} image(s) uploaded successfully
              </div>
            )}
            {uploadResult.failedCount > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-error">
                  <HiOutlineExclamationCircle className="w-4 h-4" />
                  {uploadResult.failedCount} image(s) failed
                </div>
                {uploadResult.failed.map((f) => (
                  <div
                    key={`${f.filename}-${f.error}`}
                    className="text-xs text-error/70 ml-6"
                  >
                    {f.filename}: {f.error}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

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
