vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { FoldersController } from '@api/collections/folders/controllers/folders.controller';
import type { CreateFolderDto } from '@api/collections/folders/dto/create-folder.dto';
import type { FolderDocument } from '@api/collections/folders/schemas/folder.schema';
import { FoldersService } from '@api/collections/folders/services/folders.service';
import { IngredientsController } from '@api/collections/ingredients/controllers/ingredients.controller';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { ModuleRef } from '@nestjs/core';
import type { Request } from 'express';

type FolderRow = Pick<
  FolderDocument,
  | 'brandId'
  | 'description'
  | 'id'
  | 'isActive'
  | 'isDeleted'
  | 'label'
  | 'organizationId'
  | 'userId'
>;

type IngredientRow = Pick<
  IngredientDocument,
  'brandId' | 'folderId' | 'id' | 'isDeleted' | 'organizationId' | 'userId'
>;

const organizationId = '507f191e810c19729de86001';
const brandId = '507f191e810c19729de86002';
const userId = '507f191e810c19729de86003';
const ingredientId = '507f191e810c19729de86004';
const folderId = '507f191e810c19729de86005';

describe('Library folder lifecycle persistence', () => {
  let folderRows: FolderRow[];
  let ingredientRows: IngredientRow[];
  let foldersController: FoldersController;
  let foldersService: FoldersService;
  let ingredientsController: IngredientsController;
  let ingredientsService: IngredientsService;

  beforeEach(() => {
    folderRows = [];
    ingredientRows = [
      {
        brandId,
        folderId: null,
        id: ingredientId,
        isDeleted: false,
        organizationId,
        userId,
      },
    ];

    const folderDelegate = {
      count: vi.fn(({ where }: { where: Partial<FolderRow> }) =>
        Promise.resolve(
          folderRows.filter(
            (row) =>
              (where.organizationId === undefined ||
                row.organizationId === where.organizationId) &&
              (where.isDeleted === undefined ||
                row.isDeleted === where.isDeleted),
          ).length,
        ),
      ),
      create: vi.fn(({ data }: { data: FolderRow }) => {
        const row = {
          ...data,
          id: folderId,
          isActive: data.isActive ?? true,
          isDeleted: data.isDeleted ?? false,
        };
        folderRows.push(row);
        return Promise.resolve(row);
      }),
      findFirst: vi.fn(
        ({
          where,
        }: {
          where: Partial<FolderRow> & {
            OR?: Array<{ id?: string; mongoId?: string }>;
          };
        }) =>
          Promise.resolve(
            folderRows.find(
              (row) =>
                (where.organizationId === undefined ||
                  row.organizationId === where.organizationId) &&
                (where.isDeleted === undefined ||
                  row.isDeleted === where.isDeleted) &&
                (!where.OR ||
                  where.OR.some(
                    (candidate) =>
                      candidate.id === row.id ||
                      candidate.mongoId === row.id,
                  )),
            ) ?? null,
          ),
      ),
      findMany: vi.fn(({ where }: { where: Partial<FolderRow> }) =>
        Promise.resolve(
          folderRows.filter(
            (row) =>
              (where.organizationId === undefined ||
                row.organizationId === where.organizationId) &&
              (where.isDeleted === undefined ||
                row.isDeleted === where.isDeleted),
          ),
        ),
      ),
      update: vi.fn(
        ({
          data,
          where,
        }: {
          data: Partial<FolderRow>;
          where: { id: string };
        }) => {
          const row = folderRows.find((folder) => folder.id === where.id);
          if (!row) {
            return Promise.resolve(null);
          }
          Object.assign(row, data);
          return Promise.resolve(row);
        },
      ),
    };

    const ingredientDelegate = {
      findFirst: vi.fn(({ where }: { where: Partial<IngredientRow> }) =>
        Promise.resolve(
          ingredientRows.find(
            (row) =>
              (where.id === undefined || row.id === where.id) &&
              (where.isDeleted === undefined ||
                row.isDeleted === where.isDeleted),
          ) ?? null,
        ),
      ),
      update: vi.fn(
        ({
          data,
          where,
        }: {
          data: Partial<IngredientRow>;
          where: { id: string };
        }) => {
          const row = ingredientRows.find(
            (ingredient) => ingredient.id === where.id,
          );
          if (!row) {
            return Promise.resolve(null);
          }
          Object.assign(row, data);
          return Promise.resolve(row);
        },
      ),
    };

    const prisma = {
      folder: folderDelegate,
      ingredient: ingredientDelegate,
    } as unknown as PrismaService;
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;

    foldersService = new FoldersService(prisma, logger);
    ingredientsService = new IngredientsService(
      prisma,
      logger,
      { get: vi.fn() } as unknown as ModuleRef,
    );
    foldersController = new FoldersController(foldersService, logger);
    ingredientsController = new IngredientsController(
      ingredientsService,
      foldersService,
    );
  });

  it('persists scalar relationships, preserves assigned assets, and hides a removed folder', async () => {
    const user = {
      id: userId,
      publicMetadata: { brand: brandId, organization: organizationId, user: userId },
    } as unknown as User;
    const request = {
      originalUrl: '/api/folders',
      params: {},
      query: {},
    } as Request;
    const createDto: CreateFolderDto = {
      brand: brandId,
      description: 'Campaign assets',
      label: 'Campaign',
    };
    const folder = await foldersService.create(
      foldersController.enrichCreateDto(createDto, user),
    );

    await ingredientsController.update(request, ingredientId, user, {
      folder: folder.id,
    });
    await foldersController.remove(request, user, folder.id);

    const activeFolders = await foldersService.findAll(
      {
        where: { isDeleted: false, organizationId },
      },
      { pagination: false },
    );

    expect(activeFolders.docs).toEqual([]);
    expect(folderRows).toEqual([
      expect.objectContaining({ id: folderId, isDeleted: true }),
    ]);
    expect(ingredientRows).toEqual([
      expect.objectContaining({
        folderId,
        id: ingredientId,
        isDeleted: false,
      }),
    ]);
  });
});
