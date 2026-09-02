vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

vi.mock('@api/helpers/utils/response/response.util', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@api/helpers/utils/response/response.util')
    >();
  return {
    ...actual,
    serializeCollection: vi.fn(actual.serializeCollection),
    serializeSingle: vi.fn(actual.serializeSingle),
  };
});

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AvatarsController } from '@api/collections/avatars/controllers/avatars.controller';
import { AvatarsService } from '@api/collections/avatars/services/avatars.service';
import { CaptionsController } from '@api/collections/captions/controllers/captions.controller';
import { CaptionsService } from '@api/collections/captions/services/captions.service';
import { FoldersController } from '@api/collections/folders/controllers/folders.controller';
import { FoldersService } from '@api/collections/folders/services/folders.service';
import { GifsController } from '@api/collections/gifs/controllers/gifs.controller';
import { GifsService } from '@api/collections/gifs/services/gifs.service';
import { ImagesController } from '@api/collections/images/controllers/images.controller';
import { ImagesUploadsController } from '@api/collections/images/controllers/upload/images-uploads.controller';
import type { ImagesQueryDto } from '@api/collections/images/dto/images-query.dto';
import { ImagesService } from '@api/collections/images/services/images.service';
import { IngredientsController } from '@api/collections/ingredients/controllers/ingredients.controller';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MusicsController } from '@api/collections/musics/controllers/musics.controller';
import { MusicsUploadController } from '@api/collections/musics/controllers/musics-upload.controller';
import type { MusicQueryDto } from '@api/collections/musics/dto/music-query.dto';
import { MusicsService } from '@api/collections/musics/services/musics.service';
import { VideosUploadController } from '@api/collections/videos/controllers/upload/videos-upload.controller';
import { VideosController } from '@api/collections/videos/controllers/videos.controller';
import type { VideosQueryDto } from '@api/collections/videos/dto/videos-query.dto';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { VoicesController } from '@api/collections/voices/controllers/voices.controller';
import type { VoicesQueryDto } from '@api/collections/voices/dto/voices-query.dto';
import { ExternalVoiceCatalogService } from '@api/collections/voices/services/external-voice-catalog.service';
import { VoiceCloneService } from '@api/collections/voices/services/voice-clone.service';
import { VoiceLibraryService } from '@api/collections/voices/services/voice-library.service';
import { VoicesService } from '@api/collections/voices/services/voices.service';
import type { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { ElevenLabsService } from '@api/services/integrations/elevenlabs/services/elevenlabs.service';
import { HedraService } from '@api/services/integrations/hedra/services/hedra.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PresignedUploadService } from '@api/services/uploads/presigned-upload.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  IngredientCategory,
  IngredientStatus,
  VoiceProvider,
} from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import {
  AvatarSerializer,
  CaptionSerializer,
  FolderSerializer,
  IngredientSerializer,
  IngredientUploadSerializer,
  MusicSerializer,
  VideoSerializer,
  VoiceCloneSerializer,
  VoiceSerializer,
} from '@genfeedai/serializers';
import { ValidationConfigService } from '@libs/config/services/validation.config';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import type { Request } from 'express';

type PrismaWhere = Record<string, unknown>;

type LibraryAssetRow = {
  brandId: string | null;
  category: string;
  externalVoiceCatalogId: string | null;
  folderId: string | null;
  id: string;
  isCloned: boolean;
  isDefault: boolean;
  isDeleted: boolean;
  label: string;
  organizationId: string;
  status: string;
  trainingId: string | null;
  userId: string;
  voiceProvider: string | null;
};

type FolderRow = {
  brandId: string | null;
  description: string | null;
  id: string;
  isActive: boolean;
  isDeleted: boolean;
  label: string;
  organizationId: string;
  userId: string;
};

type CaptionRow = {
  format: string | null;
  id: string;
  isDeleted: boolean;
  language: string | null;
  organizationId: string;
  userId: string;
};

type JsonApiResource = {
  attributes?: Record<string, unknown>;
  id?: string;
  type?: string;
};

const ORGANIZATION_ID = 'cmorganization000000000001';
const BRAND_ID = 'cmbrand000000000000000001';
const USER_ID = 'cmuser00000000000000000001';
const FOREIGN_ORGANIZATION_ID = 'cmorganization000000000002';
const FOREIGN_BRAND_ID = 'cmbrand000000000000000002';
const FOREIGN_USER_ID = 'cmuser00000000000000000002';

function isRecord(value: unknown): value is PrismaWhere {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPath(row: PrismaWhere, key: string): unknown {
  if (!key.includes('.')) {
    return row[key];
  }
  return key.split('.').reduce<unknown>((cursor, part) => {
    if (!isRecord(cursor)) {
      return undefined;
    }
    return cursor[part];
  }, row);
}

function matchesField(
  row: PrismaWhere,
  key: string,
  expected: unknown,
): boolean {
  if (expected === undefined) {
    return true;
  }

  const actual = readPath(row, key);

  if (expected === null) {
    return actual == null;
  }

  if (!isRecord(expected)) {
    return actual === expected;
  }

  if ('AND' in expected || 'OR' in expected || 'NOT' in expected) {
    return matchesWhere(row, expected);
  }

  if ('in' in expected && Array.isArray(expected.in)) {
    return expected.in.includes(actual);
  }

  if ('notIn' in expected && Array.isArray(expected.notIn)) {
    return !expected.notIn.includes(actual);
  }

  if ('equals' in expected) {
    return actual === expected.equals;
  }

  if ('contains' in expected) {
    return String(actual ?? '')
      .toLowerCase()
      .includes(String(expected.contains).toLowerCase());
  }

  if ('not' in expected) {
    if (expected.not === null) {
      return actual != null;
    }
    if (!isRecord(expected.not)) {
      return actual !== expected.not;
    }
    return !matchesWhere(
      isRecord(actual) ? actual : { [key]: actual },
      expected.not,
    );
  }

  if ('is' in expected && isRecord(expected.is)) {
    return isRecord(actual) ? matchesWhere(actual, expected.is) : false;
  }

  return isRecord(actual) ? matchesWhere(actual, expected) : false;
}

function matchesWhere(row: PrismaWhere, where: unknown): boolean {
  if (where == null) {
    return true;
  }
  if (!isRecord(where)) {
    return false;
  }
  if (Object.keys(where).length === 0) {
    return true;
  }

  if (
    Array.isArray(where.AND) &&
    !where.AND.every((part) => matchesWhere(row, part))
  ) {
    return false;
  }
  if (
    Array.isArray(where.OR) &&
    !where.OR.some((part) => matchesWhere(row, part))
  ) {
    return false;
  }
  if (where.NOT !== undefined && matchesWhere(row, where.NOT)) {
    return false;
  }

  return Object.entries(where).every(([key, expected]) => {
    if (key === 'AND' || key === 'OR' || key === 'NOT') {
      return true;
    }
    return matchesField(row, key, expected);
  });
}

function createMemoryDelegate<TRow extends { id: string }>(rows: TRow[]) {
  return {
    count: vi.fn(({ where }: { where?: unknown }) =>
      Promise.resolve(rows.filter((row) => matchesWhere(row, where)).length),
    ),
    create: vi.fn(({ data }: { data: TRow }) => {
      const row = {
        isActive: true,
        isDeleted: false,
        ...data,
      } as TRow;
      if (!row.id) {
        (row as { id: string }).id =
          `cmlibfolder${String(rows.length + 1).padStart(13, '0')}`;
      }
      rows.push(row);
      return Promise.resolve(row);
    }),
    findFirst: vi.fn(({ where }: { where?: unknown }) =>
      Promise.resolve(rows.find((row) => matchesWhere(row, where)) ?? null),
    ),
    findMany: vi.fn(
      ({
        skip,
        take,
        where,
      }: {
        skip?: number;
        take?: number;
        where?: unknown;
      }) => {
        const matched = rows.filter((row) => matchesWhere(row, where));
        const start = skip ?? 0;
        const end = take === undefined ? matched.length : start + take;
        return Promise.resolve(matched.slice(start, end));
      },
    ),
    update: vi.fn(
      ({ data, where }: { data: Partial<TRow>; where: { id: string } }) => {
        const row = rows.find((entry) => entry.id === where.id);
        if (!row) {
          return Promise.resolve(null);
        }
        Object.assign(row, data);
        return Promise.resolve(row);
      },
    ),
    updateMany: vi.fn(
      ({ data, where }: { data: Partial<TRow>; where?: unknown }) => {
        let count = 0;
        for (const row of rows) {
          if (matchesWhere(row, where)) {
            Object.assign(row, data);
            count += 1;
          }
        }
        return Promise.resolve({ count });
      },
    ),
  };
}

function collectionIds(result: JsonApiCollectionResponse): string[] {
  if (!Array.isArray(result.data)) {
    return [];
  }
  return result.data.map((item) => String((item as JsonApiResource).id));
}

function singleResource(result: JsonApiSingleResponse): JsonApiResource {
  return result.data as JsonApiResource;
}

function expectSerializedCollection(
  result: JsonApiCollectionResponse,
  serializer: unknown,
) {
  expect(serializeCollection).toHaveBeenCalledWith(
    expect.anything(),
    serializer,
    expect.objectContaining({ docs: expect.any(Array) }),
  );
  expect(result).toHaveProperty('data');
  expect(result).not.toHaveProperty('docs');
}

function expectSerializedSingle(
  result: JsonApiSingleResponse,
  serializer: unknown,
  id: string,
) {
  expect(serializeSingle).toHaveBeenCalledWith(
    expect.anything(),
    serializer,
    expect.objectContaining({ id }),
  );
  expect(singleResource(result).id).toBe(id);
  expect(result).not.toHaveProperty('organizationId');
}

describe('Library asset lifecycle', () => {
  const assetRows: LibraryAssetRow[] = [];
  const folderRows: FolderRow[] = [];
  const captionRows: CaptionRow[] = [];
  let assetSeq = 0;
  let captionSeq = 0;

  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  const owner = {
    id: USER_ID,
    brandId: BRAND_ID,
    organizationId: ORGANIZATION_ID,
    userId: USER_ID,
  } as unknown as User;

  const foreignUser = {
    id: FOREIGN_USER_ID,
    brandId: FOREIGN_BRAND_ID,
    organizationId: FOREIGN_ORGANIZATION_ID,
    userId: FOREIGN_USER_ID,
  } as unknown as User;

  const request = {
    originalUrl: '/v1/library',
    params: {},
    query: {},
  } as unknown as Request;

  let imagesController: ImagesController;
  let imagesUploadsController: ImagesUploadsController;
  let videosController: VideosController;
  let videosUploadController: VideosUploadController;
  let gifsController: GifsController;
  let musicsController: MusicsController;
  let musicsUploadController: MusicsUploadController;
  let voicesController: VoicesController;
  let avatarsController: AvatarsController;
  let captionsController: CaptionsController;
  let foldersController: FoldersController;
  let ingredientsController: IngredientsController;
  let imagesService: ImagesService;
  let filesClientService: {
    getPresignedUploadUrl: ReturnType<typeof vi.fn>;
    putStreamToUrl: ReturnType<typeof vi.fn>;
    uploadStreamToS3: ReturnType<typeof vi.fn>;
    uploadToS3: ReturnType<typeof vi.fn>;
  };

  function nextAssetId(): string {
    assetSeq += 1;
    return `cmlibasset${String(assetSeq).padStart(14, '0')}`;
  }

  function nextCaptionId(): string {
    captionSeq += 1;
    return `cmlibcaption${String(captionSeq).padStart(12, '0')}`;
  }

  function seedAsset(
    overrides: Partial<LibraryAssetRow> &
      Pick<LibraryAssetRow, 'category' | 'organizationId'>,
  ): LibraryAssetRow {
    const row: LibraryAssetRow = {
      brandId: BRAND_ID,
      externalVoiceCatalogId: null,
      folderId: null,
      id: nextAssetId(),
      isCloned: false,
      isDefault: false,
      isDeleted: false,
      label: 'library-asset',
      status: IngredientStatus.UPLOADED,
      trainingId: null,
      userId: USER_ID,
      voiceProvider: null,
      ...overrides,
    };
    assetRows.push(row);
    return row;
  }

  function emptyListQuery(): ImagesQueryDto &
    VideosQueryDto &
    MusicQueryDto &
    VoicesQueryDto &
    BaseQueryDto {
    return { limit: 10, page: 1 } as ImagesQueryDto &
      VideosQueryDto &
      MusicQueryDto &
      VoicesQueryDto &
      BaseQueryDto;
  }

  beforeEach(() => {
    assetRows.length = 0;
    folderRows.length = 0;
    captionRows.length = 0;
    assetSeq = 0;
    captionSeq = 0;
    vi.clearAllMocks();

    const moduleRef = {
      get: vi.fn().mockReturnValue({
        markFirstAssetGenerated: vi.fn().mockResolvedValue(undefined),
      }),
    } as unknown as ModuleRef;

    const prisma = {
      caption: createMemoryDelegate(captionRows),
      folder: createMemoryDelegate(folderRows),
      ingredient: {
        ...createMemoryDelegate(assetRows),
        create: vi.fn(({ data }: { data: Partial<LibraryAssetRow> }) => {
          const row: LibraryAssetRow = {
            brandId: BRAND_ID,
            category: IngredientCategory.IMAGE,
            externalVoiceCatalogId: null,
            folderId: null,
            id: nextAssetId(),
            isCloned: false,
            isDefault: false,
            isDeleted: false,
            label: 'uploaded-asset',
            organizationId: ORGANIZATION_ID,
            status: IngredientStatus.UPLOADED,
            trainingId: null,
            userId: USER_ID,
            voiceProvider: null,
            ...data,
          };
          assetRows.push(row);
          return Promise.resolve(row);
        }),
      },
    } as unknown as PrismaService;

    imagesService = new ImagesService(prisma, logger, moduleRef);
    const videosService = new VideosService(prisma, logger, moduleRef);
    const gifsService = new GifsService(prisma, logger, moduleRef);
    const voicesService = new VoicesService(prisma, logger, moduleRef);
    const avatarsService = new AvatarsService(prisma, logger, moduleRef);
    const ingredientsService = new IngredientsService(
      prisma,
      logger,
      moduleRef,
    );
    const musicsService = new MusicsService(prisma, logger, ingredientsService);
    const captionsService = new CaptionsService(prisma, logger);
    const foldersService = new FoldersService(prisma, logger);
    const votesService = { findOne: vi.fn().mockResolvedValue(null) };

    filesClientService = {
      getPresignedUploadUrl: vi.fn(),
      putStreamToUrl: vi.fn(),
      uploadStreamToS3: vi
        .fn()
        .mockResolvedValue({ url: 'https://files.test/object' }),
      uploadToS3: vi.fn().mockResolvedValue({
        duration: 12,
        height: 1080,
        size: 1024,
        url: 'https://files.test/object',
        width: 1920,
      }),
    };

    const sharedService = {
      createMediaDocuments: vi.fn(async (user: User, input: PrismaWhere) => {
        const identity = user;
        const row = seedAsset({
          brandId: String(input.brandId ?? identity.brandId),
          category: String(input.category),
          isCloned: String(input.category) === IngredientCategory.VOICE,
          label: String(input.label ?? 'upload'),
          organizationId: String(
            input.organizationId ?? identity.organizationId,
          ),
          status: String(input.status ?? IngredientStatus.UPLOADED),
          userId: String(input.userId ?? identity.userId),
        });
        return {
          ingredientData: row,
          metadataData: { id: `cmlibmeta${row.id.slice(10)}` },
        };
      }),
    };

    const validationConfigService = {
      getAllowedAudioExtensions: vi.fn().mockReturnValue(['mp3']),
      getAllowedAudioMimeTypes: vi.fn().mockReturnValue(['audio/mpeg']),
      getAllowedImageExtensions: vi
        .fn()
        .mockReturnValue(['jpg', 'jpeg', 'png']),
      getAllowedImageMimeTypes: vi
        .fn()
        .mockReturnValue(['image/jpeg', 'image/png']),
      getAllowedVideoExtensions: vi.fn().mockReturnValue(['mp4']),
      getAllowedVideoMimeTypes: vi.fn().mockReturnValue(['video/mp4']),
      getMaxFileSize: vi.fn().mockReturnValue(50 * 1024 * 1024),
    } as unknown as ValidationConfigService;

    imagesController = new ImagesController(
      imagesService,
      logger,
      votesService as never,
    );
    videosController = new VideosController(
      { ingredientsEndpoint: 'https://files.test' } as never,
      videosService,
      votesService as never,
      filesClientService as unknown as FilesClientService,
      {
        patch: vi.fn(),
        removeByIngredient: vi.fn().mockResolvedValue(undefined),
      } as never,
      { generateVideo: vi.fn() } as never,
    );
    gifsController = new GifsController(
      gifsService,
      logger,
      votesService as never,
    );
    musicsController = new MusicsController(logger, musicsService);
    voicesController = new VoicesController(
      new VoiceCloneService(
        { resolveApiKey: vi.fn() } as never,
        { deleteVoice: vi.fn() } as unknown as ElevenLabsService,
        { cloneVoice: vi.fn(), isAvailable: vi.fn() } as never,
        logger,
        {
          publishAssetStatus: vi.fn(),
        } as unknown as NotificationsPublisherService,
        sharedService as unknown as SharedService,
        { settleElevenLabsCloneCredits: vi.fn() } as never,
        voicesService,
      ),
      new VoiceLibraryService(voicesService, {
        findAll: vi.fn().mockResolvedValue([]),
      } as unknown as ExternalVoiceCatalogService),
    );
    avatarsController = new AvatarsController(
      logger,
      { getAvatars: vi.fn(), getVoices: vi.fn() } as unknown as HeyGenService,
      { getAvatars: vi.fn(), getVoices: vi.fn() } as unknown as HedraService,
      { getVoices: vi.fn() } as unknown as ElevenLabsService,
      avatarsService,
    );
    captionsController = new CaptionsController(
      ingredientsService,
      captionsService,
      { transcribe: vi.fn() } as never,
      logger,
    );
    foldersController = new FoldersController(foldersService, logger);
    ingredientsController = new IngredientsController(
      ingredientsService,
      foldersService,
      { cancelProcessingIngredient: vi.fn() } as never,
      { ingredientsEndpoint: 'https://cdn.test/ingredients' } as never,
    );
    imagesUploadsController = new ImagesUploadsController(
      filesClientService as unknown as FilesClientService,
      { get: vi.fn() } as unknown as HttpService,
      logger,
      {
        confirmUpload: vi.fn(),
        getPresignedUploadUrl: vi.fn(),
      } as unknown as PresignedUploadService,
      sharedService as unknown as SharedService,
      { getNft: vi.fn() } as never,
      validationConfigService,
      {
        publishVideoComplete: vi.fn(),
      } as unknown as NotificationsPublisherService,
    );
    videosUploadController = new VideosUploadController(
      filesClientService as unknown as FilesClientService,
      ingredientsService,
      logger,
      { patch: vi.fn() } as never,
      sharedService as unknown as SharedService,
      {
        publishIngredientStatus: vi.fn(),
      } as unknown as NotificationsPublisherService,
    );
    musicsUploadController = new MusicsUploadController(
      filesClientService as unknown as FilesClientService,
      logger,
      { patch: vi.fn() } as never,
      musicsService,
      sharedService as unknown as SharedService,
    );
  });

  describe('service persistence scoping', () => {
    it('lists only live rows for the caller organization and brand', async () => {
      seedAsset({
        category: IngredientCategory.IMAGE,
        organizationId: ORGANIZATION_ID,
      });
      seedAsset({
        brandId: FOREIGN_BRAND_ID,
        category: IngredientCategory.IMAGE,
        organizationId: FOREIGN_ORGANIZATION_ID,
        userId: FOREIGN_USER_ID,
      });
      seedAsset({
        category: IngredientCategory.IMAGE,
        isDeleted: true,
        organizationId: ORGANIZATION_ID,
      });

      const listed = await imagesService.findAll(
        {
          where: {
            brandId: BRAND_ID,
            category: IngredientCategory.IMAGE,
            isDeleted: false,
            organizationId: ORGANIZATION_ID,
          },
        },
        { limit: 10, page: 1, pagination: true },
      );

      expect(listed.totalDocs).toBe(1);
      expect(listed.docs[0]).toMatchObject({
        brandId: BRAND_ID,
        isDeleted: false,
        organizationId: ORGANIZATION_ID,
      });
    });

    it('paginates populated results and returns an empty page for a fresh account', async () => {
      const empty = await imagesService.findAll(
        {
          where: { isDeleted: false, organizationId: ORGANIZATION_ID },
        },
        { limit: 2, page: 1, pagination: true },
      );
      expect(empty.docs).toEqual([]);
      expect(empty.totalDocs).toBe(0);

      seedAsset({
        category: IngredientCategory.IMAGE,
        organizationId: ORGANIZATION_ID,
      });
      seedAsset({
        category: IngredientCategory.IMAGE,
        organizationId: ORGANIZATION_ID,
      });
      seedAsset({
        category: IngredientCategory.IMAGE,
        organizationId: ORGANIZATION_ID,
      });

      const pageOne = await imagesService.findAll(
        { where: { isDeleted: false, organizationId: ORGANIZATION_ID } },
        { limit: 2, page: 1, pagination: true },
      );
      const pageTwo = await imagesService.findAll(
        { where: { isDeleted: false, organizationId: ORGANIZATION_ID } },
        { limit: 2, page: 2, pagination: true },
      );

      expect(pageOne.docs).toHaveLength(2);
      expect(pageOne.totalDocs).toBe(3);
      expect(pageTwo.docs).toHaveLength(1);
      expect(pageTwo.hasNextPage).toBe(false);
    });

    it('soft-deletes by isDeleted and hides the row from later scoped reads', async () => {
      const asset = seedAsset({
        category: IngredientCategory.VIDEO,
        organizationId: ORGANIZATION_ID,
      });

      const removed = await imagesService.remove(asset.id);
      expect(removed).toMatchObject({ id: asset.id, isDeleted: true });
      expect(assetRows.find((row) => row.id === asset.id)?.isDeleted).toBe(
        true,
      );

      const listed = await imagesService.findAll(
        {
          where: {
            category: IngredientCategory.VIDEO,
            isDeleted: false,
            organizationId: ORGANIZATION_ID,
          },
        },
        { pagination: false },
      );
      expect(listed.docs).toEqual([]);
    });
  });

  describe.each([
    {
      category: IngredientCategory.IMAGE,
      get: (id: string) => imagesController.findOne(request, id, owner),
      getForeign: (id: string) =>
        imagesController.findOne(request, id, foreignUser),
      list: (query: ImagesQueryDto) =>
        imagesController.findAll(request, owner, query),
      remove: (id: string) => imagesController.remove(request, id, owner),
      seedStatus: IngredientStatus.UPLOADED,
      serializer: IngredientSerializer,
    },
    {
      category: IngredientCategory.VIDEO,
      get: (id: string) =>
        videosController.findOne(request as never, id, owner),
      getForeign: (id: string) =>
        videosController.findOne(request as never, id, foreignUser),
      list: (query: VideosQueryDto) =>
        videosController.findAll(request as never, owner, query),
      remove: (id: string) =>
        videosController.remove(request as never, id, owner),
      seedStatus: IngredientStatus.UPLOADED,
      serializer: VideoSerializer,
    },
    {
      category: IngredientCategory.GIF,
      get: (id: string) => gifsController.findOne(request, id, owner),
      getForeign: (id: string) =>
        gifsController.findOne(request, id, foreignUser),
      list: (query: BaseQueryDto) =>
        gifsController.findAll(request, owner, query as never),
      remove: (id: string) => gifsController.remove(request, id, owner),
      seedStatus: IngredientStatus.GENERATED,
      serializer: IngredientSerializer,
    },
    {
      category: IngredientCategory.MUSIC,
      get: (id: string) => musicsController.findOne(request, owner, id),
      getForeign: (id: string) =>
        musicsController.findOne(request, foreignUser, id),
      list: (query: MusicQueryDto) =>
        musicsController.findAll(request, owner, query),
      remove: (id: string) => musicsController.remove(request, owner, id),
      seedStatus: IngredientStatus.UPLOADED,
      serializer: MusicSerializer,
    },
  ])('$category list/get/delete contract', (assetType) => {
    it('returns a serialized empty collection for a fresh account', async () => {
      const result = await assetType.list(emptyListQuery());
      expectSerializedCollection(result, assetType.serializer);
      expect(collectionIds(result)).toEqual([]);
    });

    it('lists, fetches, and soft-deletes a tenant-owned asset through serializers', async () => {
      const asset = seedAsset({
        category: assetType.category,
        organizationId: ORGANIZATION_ID,
        status: assetType.seedStatus,
      });

      const listed = await assetType.list(emptyListQuery());
      expectSerializedCollection(listed, assetType.serializer);
      expect(collectionIds(listed)).toContain(asset.id);
      const listedResource = (listed.data as JsonApiResource[])[0];
      expect(listedResource.attributes).toMatchObject({
        brandId: BRAND_ID,
        organizationId: ORGANIZATION_ID,
      });

      const fetched = await assetType.get(asset.id);
      expectSerializedSingle(fetched, assetType.serializer, asset.id);
      expect(fetched.data).toMatchObject({
        attributes: expect.objectContaining({
          organizationId: ORGANIZATION_ID,
        }),
      });

      await expect(assetType.getForeign(asset.id)).rejects.toBeInstanceOf(
        HttpException,
      );

      const deleted = await assetType.remove(asset.id);
      expectSerializedSingle(deleted, assetType.serializer, asset.id);
      expect(assetRows.find((row) => row.id === asset.id)?.isDeleted).toBe(
        true,
      );

      const afterDelete = await assetType.list(emptyListQuery());
      expect(collectionIds(afterDelete)).not.toContain(asset.id);

      await expect(assetType.get(asset.id)).rejects.toBeInstanceOf(
        HttpException,
      );
    });

    it('returns not-found for a missing id without leaking a raw record', async () => {
      await expect(
        assetType.get('cmlibmissing0000000001'),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      expect(serializeSingle).not.toHaveBeenCalled();
    });
  });

  describe('upload lifecycle', () => {
    const imageFile = {
      buffer: Buffer.from('image-bytes'),
      mimetype: 'image/jpeg',
      originalname: 'hero.jpg',
      size: 2048,
    } as Express.Multer.File;
    const videoFile = {
      buffer: Buffer.from('video-bytes'),
      mimetype: 'video/mp4',
      originalname: 'clip.mp4',
      size: 4096,
    } as Express.Multer.File;
    const musicFile = {
      buffer: Buffer.from('audio-bytes'),
      mimetype: 'audio/mpeg',
      originalname: 'bed.mp3',
      size: 1024,
    } as Express.Multer.File;

    it('uploads an image with org/brand ownership, lists it, then deletes it', async () => {
      const uploaded = await imagesUploadsController.upload(
        request,
        owner,
        imageFile,
        { category: IngredientCategory.IMAGE },
      );

      expect(filesClientService.uploadStreamToS3).toHaveBeenCalled();
      expect(serializeSingle).toHaveBeenCalledWith(
        request,
        IngredientUploadSerializer,
        expect.objectContaining({
          brandId: BRAND_ID,
          organizationId: ORGANIZATION_ID,
        }),
      );
      const uploadedId = String(singleResource(uploaded).id);

      const listed = await imagesController.findAll(
        request,
        owner,
        emptyListQuery(),
      );
      expect(collectionIds(listed)).toContain(uploadedId);

      await imagesController.remove(request, uploadedId, owner);
      const afterDelete = await imagesController.findAll(
        request,
        owner,
        emptyListQuery(),
      );
      expect(collectionIds(afterDelete)).not.toContain(uploadedId);
    });

    it('uploads a video through the mocked files client and keeps tenant scope', async () => {
      const uploaded = await videosUploadController.createUpload(
        request,
        owner,
        videoFile,
      );
      expect(filesClientService.uploadToS3).toHaveBeenCalled();
      expect(serializeSingle).toHaveBeenCalledWith(
        request,
        IngredientUploadSerializer,
        expect.objectContaining({
          brandId: BRAND_ID,
          category: IngredientCategory.VIDEO,
          organizationId: ORGANIZATION_ID,
        }),
      );
      expect(singleResource(uploaded).id).toBeDefined();
    });

    it('uploads music, lists the owned row, and rejects a missing file', async () => {
      const uploaded = await musicsUploadController.createUpload(
        request,
        owner,
        musicFile,
      );
      expect(filesClientService.uploadToS3).toHaveBeenCalled();
      const uploadedId = String(singleResource(uploaded).id);

      const listed = await musicsController.findAll(
        request,
        owner,
        emptyListQuery(),
      );
      expect(collectionIds(listed)).toContain(uploadedId);

      await expect(
        imagesUploadsController.upload(
          request,
          owner,
          null as unknown as Express.Multer.File,
          { category: IngredientCategory.IMAGE },
        ),
      ).rejects.toBeInstanceOf(HttpException);
    });
  });

  describe('voices and avatars', () => {
    it('lists cloned voices for the active org/brand and soft-deletes only owned clones', async () => {
      const empty = await voicesController.findAll(
        emptyListQuery(),
        request,
        owner,
      );
      expectSerializedCollection(empty, VoiceSerializer);
      expect(collectionIds(empty)).toEqual([]);

      const voice = seedAsset({
        category: IngredientCategory.VOICE,
        isCloned: true,
        organizationId: ORGANIZATION_ID,
        status: IngredientStatus.GENERATED,
        voiceProvider: VoiceProvider.ELEVENLABS,
      });
      seedAsset({
        brandId: FOREIGN_BRAND_ID,
        category: IngredientCategory.VOICE,
        isCloned: true,
        organizationId: FOREIGN_ORGANIZATION_ID,
        userId: FOREIGN_USER_ID,
        voiceProvider: VoiceProvider.ELEVENLABS,
      });

      const listed = await voicesController.findAll(
        emptyListQuery(),
        request,
        owner,
      );
      expectSerializedCollection(listed, VoiceSerializer);
      expect(collectionIds(listed)).toEqual([voice.id]);

      const deleted = await voicesController.deleteClonedVoice(
        request,
        owner,
        voice.id,
      );
      expect(serializeSingle).toHaveBeenCalledWith(
        request,
        VoiceCloneSerializer,
        expect.objectContaining({ id: voice.id }),
      );
      expect(singleResource(deleted).id).toBe(voice.id);
      expect(assetRows.find((row) => row.id === voice.id)?.isDeleted).toBe(
        true,
      );

      const afterDelete = await voicesController.findClonedVoices(
        request,
        owner,
        emptyListQuery(),
      );
      expect(collectionIds(afterDelete)).toEqual([]);

      await expect(
        voicesController.deleteClonedVoice(
          request,
          owner,
          'cmlibmissing0000000001',
        ),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('lists avatars scoped to the caller organization and user', async () => {
      const empty = await avatarsController.findAll(
        request,
        owner,
        emptyListQuery(),
      );
      expectSerializedCollection(empty, AvatarSerializer);
      expect(collectionIds(empty)).toEqual([]);

      const avatar = seedAsset({
        category: IngredientCategory.AVATAR,
        organizationId: ORGANIZATION_ID,
        status: IngredientStatus.GENERATED,
      });
      seedAsset({
        category: IngredientCategory.AVATAR,
        organizationId: FOREIGN_ORGANIZATION_ID,
        userId: FOREIGN_USER_ID,
      });

      const listed = await avatarsController.findAll(
        request,
        owner,
        emptyListQuery(),
      );
      expectSerializedCollection(listed, AvatarSerializer);
      expect(collectionIds(listed)).toEqual([avatar.id]);
    });
  });

  describe('captions', () => {
    it('lists captions for the caller org and hides missing records', async () => {
      const empty = await captionsController.findAll(
        request,
        owner,
        emptyListQuery(),
      );
      expectSerializedCollection(empty, CaptionSerializer);
      expect(collectionIds(empty)).toEqual([]);

      const caption: CaptionRow = {
        format: 'srt',
        id: nextCaptionId(),
        isDeleted: false,
        language: 'en',
        organizationId: ORGANIZATION_ID,
        userId: USER_ID,
      };
      captionRows.push(caption);
      captionRows.push({
        format: 'srt',
        id: nextCaptionId(),
        isDeleted: false,
        language: 'en',
        organizationId: FOREIGN_ORGANIZATION_ID,
        userId: FOREIGN_USER_ID,
      });

      const listed = await captionsController.findAll(
        request,
        owner,
        emptyListQuery(),
      );
      expect(collectionIds(listed)).toEqual([caption.id]);

      const fetched = await captionsController.findOne(request, caption.id);
      expectSerializedSingle(fetched, CaptionSerializer, caption.id);

      await expect(
        captionsController.findOne(request, 'cmlibmissing0000000001'),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });

      const removed = await captionsController.remove(request, caption.id);
      expectSerializedSingle(removed, CaptionSerializer, caption.id);
      expect(captionRows.find((row) => row.id === caption.id)?.isDeleted).toBe(
        true,
      );
    });
  });

  describe('folder lifecycle', () => {
    it('creates a folder, assigns an asset, lists All Assets, and preserves assets after folder delete', async () => {
      const asset = seedAsset({
        category: IngredientCategory.IMAGE,
        organizationId: ORGANIZATION_ID,
      });

      const created = await foldersController.create(request, owner, {
        brandId: BRAND_ID,
        description: 'Campaign stills',
        label: 'Campaign',
      });
      expect(serializeSingle).toHaveBeenCalledWith(
        request,
        FolderSerializer,
        expect.objectContaining({
          brandId: BRAND_ID,
          label: 'Campaign',
          organizationId: ORGANIZATION_ID,
        }),
      );
      const folderId = String(singleResource(created).id);

      await ingredientsController.update(request, asset.id, owner, {
        folderId,
      });
      expect(assetRows.find((row) => row.id === asset.id)?.folderId).toBe(
        folderId,
      );

      const allAssets = await imagesController.findAll(
        request,
        owner,
        emptyListQuery(),
      );
      expect(collectionIds(allAssets)).toContain(asset.id);

      const folderOnly = await imagesController.findAll(request, owner, {
        ...emptyListQuery(),
        folderId,
      });
      expect(collectionIds(folderOnly)).toEqual([asset.id]);

      const listedFolders = await foldersController.findAll(
        request,
        owner,
        emptyListQuery(),
      );
      expectSerializedCollection(listedFolders, FolderSerializer);
      expect(collectionIds(listedFolders)).toContain(folderId);

      await foldersController.remove(request, owner, folderId);
      expect(folderRows.find((row) => row.id === folderId)?.isDeleted).toBe(
        true,
      );
      expect(assetRows.find((row) => row.id === asset.id)).toMatchObject({
        folderId,
        isDeleted: false,
      });

      const foldersAfterDelete = await foldersController.findAll(
        request,
        owner,
        emptyListQuery(),
      );
      expect(collectionIds(foldersAfterDelete)).not.toContain(folderId);

      await expect(
        foldersController.findOne(request, owner, folderId),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
      await expect(
        foldersController.findOne(request, foreignUser, folderId),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });
  });
});
