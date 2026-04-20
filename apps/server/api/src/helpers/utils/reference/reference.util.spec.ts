import { AssetsService } from '@api/collections/assets/services/assets.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { ConfigService } from '@api/config/config.service';
import {
  buildReferenceImageUrl,
  buildReferenceImageUrls,
} from '@api/helpers/utils/reference/reference.util';
import { LoggerService } from '@libs/logger/logger.service';

const BASE_URL = 'https://cdn.genfeed.ai';

function createMocks() {
  const ingredientsService = {
    findOne: vi.fn(),
  } as unknown as IngredientsService;

  const assetsService = {
    findOne: vi.fn(),
  } as unknown as AssetsService;

  const configService = {
    get: vi.fn().mockReturnValue(BASE_URL),
    ingredientsEndpoint: BASE_URL,
  } as unknown as ConfigService;

  const loggerService = {
    warn: vi.fn(),
  } as unknown as LoggerService;

  return { assetsService, configService, ingredientsService, loggerService };
}

describe('buildReferenceImageUrl', () => {
  const referenceId = '507f1f77bcf86cd799439011';

  it('returns null when reference id is empty', async () => {
    const { ingredientsService, assetsService, configService, loggerService } =
      createMocks();

    await expect(
      buildReferenceImageUrl({
        assetsService,
        configService,
        ingredientsService,
        loggerService,
        referenceId: '',
      }),
    ).resolves.toBeNull();

    expect(ingredientsService.findOne).not.toHaveBeenCalled();
    expect(assetsService.findOne).not.toHaveBeenCalled();
    expect(loggerService.warn).not.toHaveBeenCalled();
  });

  it('returns an ingredient image URL when IMAGE ingredient exists', async () => {
    const { ingredientsService, assetsService, configService, loggerService } =
      createMocks();

    (ingredientsService.findOne as vi.Mock).mockResolvedValue({
      _id: referenceId,
    });

    const url = await buildReferenceImageUrl({
      assetsService,
      configService,
      ingredientsService,
      loggerService,
      referenceId,
    });

    expect(url).toBe(`${BASE_URL}/images/${referenceId}`);
    expect(ingredientsService.findOne).toHaveBeenCalledTimes(1);
    const ingredientQuery = (ingredientsService.findOne as vi.Mock).mock
      .calls[0][0];
    expect(ingredientQuery._id).toBe(referenceId);
    expect(ingredientQuery.category).toBe('image');
    expect(ingredientQuery.isDeleted).toBe(false);
    expect(assetsService.findOne).not.toHaveBeenCalled();
  });

  it('returns a thumbnail URL when VIDEO ingredient exists', async () => {
    const { ingredientsService, assetsService, configService, loggerService } =
      createMocks();

    // First call (IMAGE) returns null, second call (VIDEO) returns the video
    (ingredientsService.findOne as vi.Mock)
      .mockResolvedValueOnce(null) // IMAGE check
      .mockResolvedValueOnce({ _id: referenceId }); // VIDEO check

    const url = await buildReferenceImageUrl({
      assetsService,
      configService,
      ingredientsService,
      loggerService,
      referenceId,
    });

    expect(url).toBe(`${BASE_URL}/thumbnails/${referenceId}`);
    expect(ingredientsService.findOne).toHaveBeenCalledTimes(2);
    const videoQuery = (ingredientsService.findOne as vi.Mock).mock.calls[1][0];
    expect(videoQuery.category).toBe('video');
    expect(videoQuery.isDeleted).toBe(false);
    expect(assetsService.findOne).not.toHaveBeenCalled();
  });

  it('falls back to an asset reference URL when ingredient is missing', async () => {
    const { ingredientsService, assetsService, configService, loggerService } =
      createMocks();

    // Both IMAGE and VIDEO checks return null
    (ingredientsService.findOne as vi.Mock).mockResolvedValue(null);
    (assetsService.findOne as vi.Mock).mockResolvedValue({
      _id: referenceId,
    });

    const url = await buildReferenceImageUrl({
      assetsService,
      configService,
      ingredientsService,
      loggerService,
      referenceId,
    });

    expect(url).toBe(`${BASE_URL}/references/${referenceId}`);
    expect(ingredientsService.findOne).toHaveBeenCalledTimes(2); // IMAGE + VIDEO checks
    expect(assetsService.findOne).toHaveBeenCalledTimes(1);
    const assetQuery = (assetsService.findOne as vi.Mock).mock.calls[0][0];
    expect(assetQuery._id).toBe(referenceId);
    expect(assetQuery.isDeleted).toBe(false);
  });

  it('logs a warning and returns null when reference is not found', async () => {
    const { ingredientsService, assetsService, configService, loggerService } =
      createMocks();

    (ingredientsService.findOne as vi.Mock).mockResolvedValue(null);
    (assetsService.findOne as vi.Mock).mockResolvedValue(null);

    await expect(
      buildReferenceImageUrl({
        assetsService,
        configService,
        ingredientsService,
        loggerService,
        referenceId,
      }),
    ).resolves.toBeNull();

    expect(ingredientsService.findOne).toHaveBeenCalledTimes(2); // IMAGE + VIDEO checks
    expect(loggerService.warn).toHaveBeenCalledWith(
      'Reference not found or invalid',
      { reference: referenceId },
    );
  });

  it('handles invalid object ids by logging and returning null', async () => {
    const invalidId = 'not-a-valid-object-id';
    const { ingredientsService, assetsService, configService, loggerService } =
      createMocks();

    (ingredientsService.findOne as vi.Mock).mockRejectedValue(
      new Error('Invalid ObjectId'),
    );

    await expect(
      buildReferenceImageUrl({
        assetsService,
        configService,
        ingredientsService,
        loggerService,
        referenceId: invalidId,
      }),
    ).resolves.toBeNull();

    expect(ingredientsService.findOne).toHaveBeenCalled();
    expect(assetsService.findOne).not.toHaveBeenCalled();
    expect(loggerService.warn).toHaveBeenCalledWith('Reference lookup failed', {
      reference: invalidId,
    });
  });
});

describe('buildReferenceImageUrls', () => {
  const id1 = '507f1f77bcf86cd799439011';
  const id2 = '507f1f77bcf86cd799439012';

  it('returns an empty array when no reference ids are provided', async () => {
    const { ingredientsService, assetsService, configService, loggerService } =
      createMocks();

    await expect(
      buildReferenceImageUrls({
        assetsService,
        configService,
        ingredientsService,
        loggerService,
        referenceIds: [],
      }),
    ).resolves.toEqual([]);

    expect(ingredientsService.findOne).not.toHaveBeenCalled();
    expect(assetsService.findOne).not.toHaveBeenCalled();
  });

  it('filters null results while aggregating valid reference URLs', async () => {
    const invalidId = 'invalid';
    const { ingredientsService, assetsService, configService, loggerService } =
      createMocks();

    // id1: IMAGE found on first call
    // id2: IMAGE not found, VIDEO not found, ASSET found
    // invalidId: findOne throws (invalid ObjectId), caught and returns null
    (ingredientsService.findOne as vi.Mock)
      .mockResolvedValueOnce({ _id: id1 }) // id1: IMAGE check - found
      .mockResolvedValueOnce(null) // id2: IMAGE check - not found
      .mockResolvedValueOnce(null) // id2: VIDEO check - not found
      .mockRejectedValueOnce(new Error('Invalid ObjectId')); // invalidId: throws

    (assetsService.findOne as vi.Mock).mockResolvedValueOnce({
      _id: id2,
    });

    const result = await buildReferenceImageUrls({
      assetsService,
      configService,
      ingredientsService,
      loggerService,
      referenceIds: [id1, id2, invalidId],
    });

    expect(result).toEqual([
      `${BASE_URL}/images/${id1}`,
      `${BASE_URL}/references/${id2}`,
    ]);
    // id1: 1 call (IMAGE found), id2: 2 calls (IMAGE + VIDEO), invalidId: 1 (throws)
    expect(ingredientsService.findOne).toHaveBeenCalledTimes(4);
    expect(assetsService.findOne).toHaveBeenCalledTimes(1);
  });
});
