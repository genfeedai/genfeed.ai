import { EditorRenderJobsController } from '@files/controllers/editor-render-jobs.controller';
import { FilesController } from '@files/controllers/files.controller';
import { FilesMetadataController } from '@files/controllers/files-metadata.controller';
import { FilesProcessingController } from '@files/controllers/files-processing.controller';
import { FilesStorageController } from '@files/controllers/files-storage.controller';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

const controllers = [
  [EditorRenderJobsController, 'files/job'],
  [FilesController, 'files'],
  [FilesMetadataController, 'files'],
  [FilesProcessingController, 'files'],
  [FilesStorageController, 'files'],
] as const;

const routes = [
  [
    EditorRenderJobsController.prototype.cancel,
    RequestMethod.POST,
    ':jobId/cancel',
  ],
  [FilesController.prototype.processVideo, RequestMethod.POST, 'process/video'],
  [FilesController.prototype.processImage, RequestMethod.POST, 'process/image'],
  [FilesController.prototype.processFile, RequestMethod.POST, 'process/file'],
  [
    FilesController.prototype.processYoutube,
    RequestMethod.POST,
    'process/youtube',
  ],
  [
    FilesController.prototype.processHookRemix,
    RequestMethod.POST,
    'process/hook-remix',
  ],
  [FilesController.prototype.getJobStatus, RequestMethod.GET, 'job/:jobId'],
  [FilesController.prototype.getQueueStats, RequestMethod.GET, 'stats'],
  [
    FilesProcessingController.prototype.audioOverlay,
    RequestMethod.POST,
    'processing/audio-overlay',
  ],
  [
    FilesProcessingController.prototype.generateThumbnail,
    RequestMethod.POST,
    'processing/generate-thumbnail',
  ],
  [
    FilesProcessingController.prototype.resizeImage,
    RequestMethod.POST,
    'processing/resize-image',
  ],
  [
    FilesProcessingController.prototype.splitImage,
    RequestMethod.POST,
    'processing/split-image',
  ],
  [
    FilesMetadataController.prototype.getFileMetadata,
    RequestMethod.POST,
    'metadata',
  ],
  [
    FilesMetadataController.prototype.getTempFile,
    RequestMethod.GET,
    'temp/:filename',
  ],
  [
    FilesMetadataController.prototype.cleanupTempFiles,
    RequestMethod.POST,
    'cleanup-temp-files',
  ],
  [FilesStorageController.prototype.uploadFile, RequestMethod.POST, 'upload'],
  [
    FilesStorageController.prototype.downloadFile,
    RequestMethod.GET,
    'download/:type/*key',
  ],
  [FilesStorageController.prototype.copyFile, RequestMethod.POST, 'copy'],
  [
    FilesStorageController.prototype.getPresignedUploadUrl,
    RequestMethod.POST,
    'presigned-upload',
  ],
  [
    FilesStorageController.prototype.getPresignedDownloadUrl,
    RequestMethod.GET,
    'presigned-download/:type/*key',
  ],
] as const;

describe('files controller boundaries', () => {
  it.each(
    controllers,
  )('%s keeps its files route prefix', (controller, expectedPath) => {
    expect(Reflect.getMetadata(PATH_METADATA, controller)).toBe(expectedPath);
  });

  it.each(
    routes,
  )('preserves route metadata for %s', (handler, method, path) => {
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
  });
});
