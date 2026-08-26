import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { FolderDocument } from '@api/collections/folders/schemas/folder.schema';
import { FoldersService } from '@api/collections/folders/services/folders.service';
import { IngredientsController } from '@api/collections/ingredients/controllers/ingredients.controller';
import { IngredientGenerationCancellationService } from '@api/collections/ingredients/services/ingredient-generation-cancellation.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { AssetAccessGuard } from '@api/guards/asset-access.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { createIngredientDocumentFixture } from '@api-test/fixtures/ingredient-document.fixture';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn((name: string, id: string) => ({
    error: `${name}:${id}`,
  })),
  serializeCollection: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

const organizationId = testId('org');
const brandId = testId('brand');
const userId = testId('user');
const ingredientId = testId('ingredient');
const folderId = testId('folder');

const mockUser = {
  id: userId,
  brandId: brandId,
  organizationId: organizationId,
  userId: userId,
} as unknown as User;

const mockRequest = {
  originalUrl: `/api/ingredients/${ingredientId}`,
  params: { ingredientId },
  query: {},
} as unknown as Request;

/** The mocked service returns a full Prisma row, so the fixture is complete. */
const folder = {
  id: folderId,
  brandId,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  description: null,
  isActive: true,
  isDeleted: false,
  label: 'Campaigns',
  organizationId,
  parentId: null,
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  userId,
} as FolderDocument;

const ingredient = createIngredientDocumentFixture({
  id: ingredientId,
  brandId,
  folderId: null,
  isDeleted: false,
  organizationId,
  userId,
});

describe('IngredientsController folder assignment', () => {
  let controller: IngredientsController;
  let foldersService: vi.Mocked<FoldersService>;
  let ingredientsService: vi.Mocked<IngredientsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IngredientsController],
      providers: [
        {
          provide: IngredientsService,
          useValue: {
            findOne: vi.fn(),
            patch: vi.fn(),
          },
        },
        {
          provide: FoldersService,
          useValue: {
            findOne: vi.fn(),
          },
        },
        {
          provide: IngredientGenerationCancellationService,
          useValue: {
            cancelProcessingIngredient: vi.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            ingredientsEndpoint: 'https://cdn.genfeed.ai/ingredients',
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AssetAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(IngredientsController);
    foldersService = module.get(FoldersService);
    ingredientsService = module.get(IngredientsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('assigns an owned asset to an active folder in caller scope', async () => {
    foldersService.findOne.mockResolvedValue(folder);
    ingredientsService.findOne
      .mockResolvedValueOnce(ingredient)
      .mockResolvedValueOnce({ ...ingredient, folderId });
    ingredientsService.patch.mockResolvedValue({
      ...ingredient,
      folderId,
    });

    const result = await controller.update(
      mockRequest,
      ingredientId,
      mockUser,
      { folderId },
    );

    expect(foldersService.findOne).toHaveBeenCalledWith({
      id: folderId,
      isDeleted: false,
      organizationId,
    });
    expect(ingredientsService.findOne).toHaveBeenNthCalledWith(
      1,
      {
        id: ingredientId,
        isDeleted: false,
        organizationId,
      },
      expect.any(Array),
    );
    expect(ingredientsService.patch).toHaveBeenCalledWith(ingredientId, {
      folderId,
    });
    expect(ingredientsService.findOne).toHaveBeenNthCalledWith(
      2,
      {
        id: ingredientId,
        isDeleted: false,
        organizationId,
      },
      expect.any(Array),
    );
    expect(result).toEqual({
      data: expect.objectContaining({ folderId }),
    });
  });

  it('rejects a folder outside the caller brand scope', async () => {
    ingredientsService.findOne.mockResolvedValueOnce(ingredient);
    foldersService.findOne.mockResolvedValue({
      ...folder,
      brandId: testId('brand', 2),
    });

    const result = await controller.update(
      mockRequest,
      ingredientId,
      mockUser,
      { folderId },
    );

    expect(result).toEqual({
      error: `IngredientsController:${folderId}`,
    });
    expect(ingredientsService.patch).not.toHaveBeenCalled();
  });

  it('rejects assignment when the asset is outside caller brand scope', async () => {
    ingredientsService.findOne.mockResolvedValue({
      ...ingredient,
      brandId: testId('brand', 2),
    });

    const result = await controller.update(
      mockRequest,
      ingredientId,
      mockUser,
      { folderId },
    );

    expect(result).toEqual({
      error: `IngredientsController:${ingredientId}`,
    });
    expect(foldersService.findOne).not.toHaveBeenCalled();
    expect(ingredientsService.patch).not.toHaveBeenCalled();
  });

  it('clears the folder assignment without requiring a folder lookup', async () => {
    ingredientsService.findOne
      .mockResolvedValueOnce({ ...ingredient, folderId })
      .mockResolvedValueOnce(ingredient);
    ingredientsService.patch.mockResolvedValue(ingredient);

    await controller.update(mockRequest, ingredientId, mockUser, {
      folderId: null,
    });

    expect(foldersService.findOne).not.toHaveBeenCalled();
    expect(ingredientsService.patch).toHaveBeenCalledWith(ingredientId, {
      folderId: null,
    });
  });
});
