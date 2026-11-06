import type { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { MediaUploadService } from '@api/endpoints/webhooks/services/media-upload.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it } from 'vitest';

type Probe = Record<string, unknown>;

/**
 * The files service uploads from a URL and answers with what it probed; the
 * metadata table keeps each patch; warnings are recorded.
 */
function buildService(probe: Probe) {
  const uploads: { folder: string; key: string; source: unknown }[] = [];
  const metadata = new Map<string, Record<string, unknown>>([['meta-1', {}]]);
  const warnings: string[] = [];
  const files = {
    uploadToS3: async (key: string, folder: string, source: unknown) => {
      uploads.push({ folder, key, source });
      return probe;
    },
  };
  const metadataService = {
    patch: async (id: string, data: Record<string, unknown>) => {
      metadata.set(id, { ...metadata.get(id), ...data });
    },
  };
  const silent = () => undefined;
  const service = new MediaUploadService(
    files as unknown as FilesClientService,
    metadataService as unknown as MetadataService,
    {
      debug: silent,
      error: silent,
      log: silent,
      warn: (message: string) => warnings.push(message),
    } as unknown as LoggerService,
  );
  return { metadata, service, uploads, warnings };
}

const fullProbe = {
  duration: 10,
  hasAudio: true,
  height: 720,
  size: 1024,
  width: 1280,
};

describe('MediaUploadService', () => {
  describe('uploadAndUpdateMetadata', () => {
    it('uploads to the plural media folder and returns the probe', async () => {
      const { service, uploads } = buildService(fullProbe);

      const result = await service.uploadAndUpdateMetadata(
        'ing-123',
        'video',
        'http://example.com/video.mp4',
        'meta-1',
      );

      expect(result).toEqual(fullProbe);
      expect(uploads).toEqual([
        {
          folder: 'videos',
          key: 'ing-123',
          source: { type: 'url', url: 'http://example.com/video.mp4' },
        },
      ]);
    });

    it('stores valid dimensions on the metadata row', async () => {
      const { metadata, service } = buildService(fullProbe);

      await service.uploadAndUpdateMetadata(
        'ing-123',
        'video',
        'url',
        'meta-1',
      );

      expect(metadata.get('meta-1')).toEqual(fullProbe);
    });

    it('leaves zero dimensions off the metadata row', async () => {
      const { metadata, service } = buildService({
        duration: 5,
        hasAudio: false,
        height: 0,
        size: 512,
        width: 0,
      });

      await service.uploadAndUpdateMetadata(
        'ing-123',
        'image',
        'url',
        'meta-1',
      );

      expect(metadata.get('meta-1')).toEqual({
        duration: 5,
        hasAudio: false,
        size: 512,
      });
    });

    it('warns when dimensions are missing', async () => {
      const { service, warnings } = buildService({
        height: 0,
        size: 512,
        width: 0,
      });

      await service.uploadAndUpdateMetadata(
        'ing-123',
        'video',
        'url',
        'meta-1',
        'ext-id',
      );

      expect(warnings).toHaveLength(1);
    });
  });
});
