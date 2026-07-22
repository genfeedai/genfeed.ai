import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { FoldersService } from '@api/collections/folders/services/folders.service';
import { IngredientsController } from '@api/collections/ingredients/controllers/ingredients.controller';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { AssetAccessGuard } from '@api/guards/asset-access.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
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

const organizationId = '507f191e810c19729de86001';
const brandId = '507f191e810c19729de86002';
const userId = '507f191e810c19729de86003';
const ingredientId = '507f191e810c19729de86004';
const folderId = '507f191e810c19729de86005';

const mockUser = {
  id: userId,
  publicMetadata: {
    brand: brandId,
    organization: organizationId,
    user: userId,
  },
} as unknown as User;

const mockRequest = {
  originalUrl: `/api/ingredients/${ingredientId}`,
  params: { ingredientId },
  query: {},
} as unknown as Request;

const ingredient = {
  id: ingredientId,
  brandId,
  folderId: null,
  isDeleted: false,
  organizationId,
  userId,
};

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
    foldersService.findOne.mockResolvedValue({
      id: folderId,
      brandId,
      isDeleted: false,
      organizationId,
    });
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
      { folder: folderId },
    );

    expect(foldersService.findOne).toHaveBeenCalledWith({
      _id: folderId,
      isDeleted: false,
      organizationId,
    });
    expect(ingredientsService.findOne).toHaveBeenNthCalledWith(
      1,
      {
        _id: ingredientId,
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
        _id: ingredientId,
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
      id: folderId,
      brandId: '507f191e810c19729de86009',
      isDeleted: false,
      organizationId,
    });

    const result = await controller.update(
      mockRequest,
      ingredientId,
      mockUser,
      { folder: folderId },
    );

    expect(result).toEqual({
      error: `IngredientsController:${folderId}`,
    });
    expect(ingredientsService.patch).not.toHaveBeenCalled();
  });

  it('rejects assignment when the asset is outside caller brand scope', async () => {
    ingredientsService.findOne.mockResolvedValue({
      ...ingredient,
      brandId: '507f191e810c19729de86009',
    });

    const result = await controller.update(
      mockRequest,
      ingredientId,
      mockUser,
      { folder: folderId },
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
      folder: '',
    });

    expect(foldersService.findOne).not.toHaveBeenCalled();
    expect(ingredientsService.patch).toHaveBeenCalledWith(ingredientId, {
      folderId: null,
    });
  });
});
