import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ImageResizeService } from '@api/collections/images/services/image-resize.service';
import type { ImagesService } from '@api/collections/images/services/images.service';
import type { MetadataService } from '@api/collections/metadata/services/metadata.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import type { SharedService } from '@api/shared/services/shared/shared.service';
import {
  IngredientOrigin,
  IngredientStatus,
  MetadataExtension,
  TransformationCategory,
} from '@genfeedai/contracts';
import type { IResizeBodyParams } from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';

type Row = Record<string, unknown> & { id: string };

interface UploadMeta {
  height?: number;
  s3Key?: string;
  size?: number;
  width?: number;
}

const user = {
  brandId: 'brand-1',
  id: 'session-user',
  organizationId: 'org-1',
  userId: 'user-1',
} as User;

const SOURCE_URL = 'https://api.example.com/ingredients/images/image-1';

describe('ImageResizeService', () => {
  let errors: string[];
  let fetched: string[];
  let images: Row[];
  let isAuthorizedDelivery: boolean;
  let isGrantDenied: boolean;
  let isResizerDown: boolean;
  let metadata: Map<string, Row>;
  let uploadMeta: UploadMeta;
  let uploads: Map<string, Buffer>;
  let service: ImageResizeService;

  const source = (fields: Partial<Row> = {}): Row => ({
    id: 'image-1',
    isDeleted: false,
    organizationId: 'org-1',
    userId: 'user-1',
    ...fields,
  });
  const child = () => images.find((row) => row.parentId === 'image-1');

  beforeEach(() => {
    errors = [];
    fetched = [];
    images = [source()];
    isAuthorizedDelivery = false;
    isGrantDenied = false;
    isResizerDown = false;
    metadata = new Map();
    uploadMeta = {
      height: 720,
      s3Key: 'ingredients/images/image-2',
      size: 2048,
      width: 1280,
    };
    uploads = new Map();

    const config = {
      get ingredientsEndpoint() {
        return 'https://api.example.com/ingredients';
      },
      get isAuthorizedMediaDeliveryEnabled() {
        return isAuthorizedDelivery;
      },
    } as unknown as ConfigService;
    // The files service resizes what it can fetch and stores the result.
    const files = {
      resizeImageFromUrl: async (
        url: string,
        target: { height: number; width: number },
      ) => {
        if (isResizerDown) {
          throw new Error('resize failed');
        }
        fetched.push(url);
        return Buffer.from(`${target.width}x${target.height}`);
      },
      uploadToS3: async (
        key: string,
        _folder: string,
        file: { data: Buffer },
      ) => {
        uploads.set(key, file.data);
        return uploadMeta;
      },
    } as unknown as FilesClientService;
    const imagesService = {
      findOne: async (where: Row) =>
        images.find((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        ) ?? null,
      patch: async (id: string, data: Row) => {
        const row = images.find((candidate) => candidate.id === id);
        return row ? Object.assign(row, data) : null;
      },
    } as unknown as ImagesService;
    const metadataService = {
      patch: async (id: string, data: Row) => {
        Object.assign(metadata.get(id) ?? {}, data);
      },
    } as unknown as MetadataService;
    const shared = {
      createMediaDocuments: async (_user: User, data: Row) => {
        const ingredientData = { ...data, id: `image-${images.length + 1}` };
        const metadataData = { id: `metadata-${metadata.size + 1}` };
        images.push(ingredientData);
        metadata.set(metadataData.id, metadataData);
        return { ingredientData, metadataData };
      },
    } as unknown as SharedService;
    const authorizedUrls = {
      issueServerPublish: async (organizationId: string, ids: string[]) => {
        if (isGrantDenied) {
          throw new Error('Source denied');
        }
        return new Map(
          ids.map((id) => [
            id,
            `https://cdn.example/${organizationId}/${id}.png?Signature=fresh`,
          ]),
        );
      },
    } as unknown as AuthorizedMediaUrlService;
    const logger = {
      error: (message: string) => {
        errors.push(message);
      },
    } as unknown as LoggerService;

    service = new ImageResizeService(
      config,
      files,
      imagesService,
      logger,
      metadataService,
      shared,
      authorizedUrls,
    );
  });

  it('stores a resized child image under the source and records its size', async () => {
    const resized = await service.resizeImage('image-1', user, {
      height: 720,
      width: 1280,
    });

    expect(resized).toEqual({
      brandId: 'brand-1',
      category: expect.anything(),
      extension: MetadataExtension.JPG,
      id: 'image-2',
      organizationId: 'org-1',
      origin: IngredientOrigin.GENERATED,
      parentId: 'image-1',
      s3Key: 'ingredients/images/image-2',
      status: IngredientStatus.GENERATED,
      transformations: [TransformationCategory.RESIZED],
    });
    expect(child()).toBe(resized);
    expect(fetched).toEqual([SOURCE_URL]);
    expect(uploads.get('image-2')?.toString()).toBe('1280x720');
    expect(metadata.get('metadata-1')).toMatchObject({
      height: 720,
      size: 2048,
      width: 1280,
    });
  });

  it('falls back to 1080x1920 and to the resized bytes when upload reports nothing', async () => {
    uploadMeta = {};

    await service.resizeImage('image-1', user, {} as IResizeBodyParams);

    expect(uploads.get('image-2')?.toString()).toBe('1080x1920');
    expect(metadata.get('metadata-1')).toMatchObject({
      height: 1920,
      size: '1080x1920'.length,
      width: 1080,
    });
    expect(child()).toMatchObject({
      s3Key: undefined,
      status: IngredientStatus.GENERATED,
    });
  });

  it('finds the source by the session user id when the user id is absent', async () => {
    images = [source({ userId: 'session-user' })];

    await service.resizeImage(
      'image-1',
      { ...user, userId: undefined } as unknown as User,
      {
        height: 720,
        width: 1280,
      },
    );

    expect(child()).toMatchObject({ status: IngredientStatus.GENERATED });
  });

  it.each([
    ['another organization', { organizationId: 'org-2' }],
    ['another user', { userId: 'user-2' }],
    ['a deleted image', { isDeleted: true }],
  ])(
    'answers 404 for an image of %s and creates nothing',
    async (_case, fields) => {
      images = [source(fields)];

      await expect(
        service.resizeImage('image-1', user, { height: 720, width: 1280 }),
      ).rejects.toMatchObject({
        response: {
          detail: "ImagesTransformationsController image-1 doesn't exist",
          title: 'ImagesTransformationsController not found',
        },
        status: HttpStatus.NOT_FOUND,
      });
      expect(images).toHaveLength(1);
      expect(metadata.size).toBe(0);
    },
  );

  it('logs a failed resize, rethrows and leaves the child processing', async () => {
    isResizerDown = true;

    await expect(
      service.resizeImage('image-1', user, { height: 720, width: 1280 }),
    ).rejects.toThrow('resize failed');
    expect(child()?.status).toBe(IngredientStatus.PROCESSING);
    expect(uploads.size).toBe(0);
    expect(errors).toEqual([
      'ImagesTransformationsController resizeImage failed',
    ]);
  });

  it('resizes from a fresh authorized URL when authorized delivery is on', async () => {
    isAuthorizedDelivery = true;

    await service.resizeImage('image-1', user, { height: 1920, width: 1080 });

    expect(fetched).toEqual([
      'https://cdn.example/org-1/image-1.png?Signature=fresh',
    ]);
    expect(child()?.status).toBe(IngredientStatus.GENERATED);
  });

  it('never falls back to the id URL when authorization is denied', async () => {
    isAuthorizedDelivery = true;
    isGrantDenied = true;

    await expect(
      service.resizeImage('image-1', user, { height: 1920, width: 1080 }),
    ).rejects.toThrow('Source denied');
    expect(fetched).toEqual([]);
    expect(uploads.size).toBe(0);
  });
});
