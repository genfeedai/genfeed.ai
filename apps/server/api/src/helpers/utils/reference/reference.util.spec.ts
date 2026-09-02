import { AssetsService } from '@api/collections/assets/services/assets.service';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import {
  buildReferenceImageUrl,
  buildReferenceImageUrls,
} from '@api/helpers/utils/reference/reference.util';
import { AssetCategory, IngredientCategory } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';

const BASE_URL = 'https://cdn.genfeed.ai';
const ORGANIZATION_ID = testId('org');
const FOREIGN_ORGANIZATION_ID = testId('org', 2);

type ReferenceLookupQuery = {
  category?: string;
  id?: string;
  isDeleted?: boolean;
  organizationId?: string;
};

type TenantMediaRow = {
  id: string;
  isDeleted?: boolean;
  organizationId: string;
};

function createMocks() {
  const ingredientsService = {
    findOne: vi.fn(),
  } as unknown as IngredientsService;

  const assetsService = {
    findOne: vi.fn(),
  } as unknown as AssetsService;

  const configService = {
    cdnUrl: BASE_URL,
    get: vi.fn().mockReturnValue(BASE_URL),
    ingredientsEndpoint: `${BASE_URL}/ingredients`,
  } as unknown as ConfigService;

  const loggerService = {
    warn: vi.fn(),
  } as unknown as LoggerService;

  return { assetsService, configService, ingredientsService, loggerService };
}

function withOrganization(
  mocks: ReturnType<typeof createMocks>,
  extra: { referenceId: string },
): ReturnType<typeof createMocks> & {
  organizationId: string;
  referenceId: string;
};
function withOrganization(
  mocks: ReturnType<typeof createMocks>,
  extra: { referenceIds: string[] },
): ReturnType<typeof createMocks> & {
  organizationId: string;
  referenceIds: string[];
};
function withOrganization(
  mocks: ReturnType<typeof createMocks>,
  extra: { referenceId: string } | { referenceIds: string[] },
) {
  return {
    ...mocks,
    organizationId: ORGANIZATION_ID,
    ...extra,
  };
}

function resolveTenantRow(
  rows: TenantMediaRow[],
  query: ReferenceLookupQuery,
): Promise<{ id: string } | null> {
  const row = rows.find((candidate) => candidate.id === query.id);
  if (!row) {
    return Promise.resolve(null);
  }
  if (
    query.organizationId !== undefined &&
    row.organizationId !== query.organizationId
  ) {
    return Promise.resolve(null);
  }
  if (query.isDeleted === false && row.isDeleted === true) {
    return Promise.resolve(null);
  }
  return Promise.resolve({ id: row.id });
}

describe('buildReferenceImageUrl', () => {
  const referenceId = testId('reference');

  it('returns null when reference id is empty', async () => {
    const { ingredientsService, assetsService, configService, loggerService } =
      createMocks();

    await expect(
      buildReferenceImageUrl(
        withOrganization(
          { assetsService, configService, ingredientsService, loggerService },
          { referenceId: '' },
        ),
      ),
    ).resolves.toBeNull();

    expect(ingredientsService.findOne).not.toHaveBeenCalled();
    expect(assetsService.findOne).not.toHaveBeenCalled();
    expect(loggerService.warn).not.toHaveBeenCalled();
  });

  it('returns an ingredient image URL when IMAGE ingredient exists', async () => {
    const { ingredientsService, assetsService, configService, loggerService } =
      createMocks();

    (ingredientsService.findOne as vi.Mock).mockResolvedValue({
      id: referenceId,
    });

    const url = await buildReferenceImageUrl(
      withOrganization(
        { assetsService, configService, ingredientsService, loggerService },
        { referenceId },
      ),
    );

    expect(url).toBe(`${BASE_URL}/ingredients/images/${referenceId}`);
    expect(ingredientsService.findOne).toHaveBeenCalledTimes(1);
    expect(ingredientsService.findOne).toHaveBeenCalledWith({
      category: IngredientCategory.IMAGE,
      id: referenceId,
      isDeleted: false,
      organizationId: ORGANIZATION_ID,
    });
    expect(assetsService.findOne).not.toHaveBeenCalled();
  });

  it('returns a thumbnail URL when VIDEO ingredient exists', async () => {
    const { ingredientsService, assetsService, configService, loggerService } =
      createMocks();

    (ingredientsService.findOne as vi.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: referenceId });

    const url = await buildReferenceImageUrl(
      withOrganization(
        { assetsService, configService, ingredientsService, loggerService },
        { referenceId },
      ),
    );

    expect(url).toBe(`${BASE_URL}/ingredients/thumbnails/${referenceId}`);
    expect(ingredientsService.findOne).toHaveBeenCalledTimes(2);
    expect(ingredientsService.findOne).toHaveBeenNthCalledWith(2, {
      category: IngredientCategory.VIDEO,
      id: referenceId,
      isDeleted: false,
      organizationId: ORGANIZATION_ID,
    });
    expect(assetsService.findOne).not.toHaveBeenCalled();
  });

  it('falls back to an asset reference URL when ingredient is missing', async () => {
    const { ingredientsService, assetsService, configService, loggerService } =
      createMocks();

    (ingredientsService.findOne as vi.Mock).mockResolvedValue(null);
    (assetsService.findOne as vi.Mock).mockResolvedValue({
      id: referenceId,
    });

    const url = await buildReferenceImageUrl(
      withOrganization(
        { assetsService, configService, ingredientsService, loggerService },
        { referenceId },
      ),
    );

    expect(url).toBe(`${BASE_URL}/references/${referenceId}`);
    expect(ingredientsService.findOne).toHaveBeenCalledTimes(2);
    expect(assetsService.findOne).toHaveBeenCalledTimes(1);
    expect(assetsService.findOne).toHaveBeenCalledWith({
      category: AssetCategory.REFERENCE,
      id: referenceId,
      isDeleted: false,
      organizationId: ORGANIZATION_ID,
    });
  });

  it('logs a warning and returns null when reference is not found', async () => {
    const { ingredientsService, assetsService, configService, loggerService } =
      createMocks();

    (ingredientsService.findOne as vi.Mock).mockResolvedValue(null);
    (assetsService.findOne as vi.Mock).mockResolvedValue(null);

    await expect(
      buildReferenceImageUrl(
        withOrganization(
          { assetsService, configService, ingredientsService, loggerService },
          { referenceId },
        ),
      ),
    ).resolves.toBeNull();

    expect(ingredientsService.findOne).toHaveBeenCalledTimes(2);
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
      buildReferenceImageUrl(
        withOrganization(
          { assetsService, configService, ingredientsService, loggerService },
          { referenceId: invalidId },
        ),
      ),
    ).resolves.toBeNull();

    expect(ingredientsService.findOne).toHaveBeenCalled();
    expect(assetsService.findOne).not.toHaveBeenCalled();
    expect(loggerService.warn).toHaveBeenCalledWith('Reference lookup failed', {
      reference: invalidId,
    });
  });
});

describe('buildReferenceImageUrls', () => {
  const id1 = testId('ref', 1);
  const id2 = testId('ref', 2);

  it('returns an empty array when no reference ids are provided', async () => {
    const { ingredientsService, assetsService, configService, loggerService } =
      createMocks();

    await expect(
      buildReferenceImageUrls(
        withOrganization(
          { assetsService, configService, ingredientsService, loggerService },
          { referenceIds: [] },
        ),
      ),
    ).resolves.toEqual([]);

    expect(ingredientsService.findOne).not.toHaveBeenCalled();
    expect(assetsService.findOne).not.toHaveBeenCalled();
  });

  it('filters null results while aggregating valid reference URLs', async () => {
    const invalidId = 'invalid';
    const { ingredientsService, assetsService, configService, loggerService } =
      createMocks();

    (ingredientsService.findOne as vi.Mock).mockImplementation(
      (query: ReferenceLookupQuery) => {
        if (query.id === invalidId) {
          return Promise.reject(new Error('Invalid ObjectId'));
        }
        if (query.id === id1 && query.category === IngredientCategory.IMAGE) {
          return Promise.resolve({ id: id1 });
        }
        return Promise.resolve(null);
      },
    );

    (assetsService.findOne as vi.Mock).mockImplementation(
      (query: ReferenceLookupQuery) =>
        Promise.resolve(query.id === id2 ? { id: id2 } : null),
    );

    const result = await buildReferenceImageUrls(
      withOrganization(
        { assetsService, configService, ingredientsService, loggerService },
        { referenceIds: [id1, id2, invalidId] },
      ),
    );

    expect(result).toEqual([
      `${BASE_URL}/ingredients/images/${id1}`,
      `${BASE_URL}/references/${id2}`,
    ]);
    expect(ingredientsService.findOne).toHaveBeenCalledTimes(4);
    expect(assetsService.findOne).toHaveBeenCalledTimes(1);
    expect(ingredientsService.findOne).toHaveBeenCalledWith({
      category: IngredientCategory.IMAGE,
      id: id1,
      isDeleted: false,
      organizationId: ORGANIZATION_ID,
    });
  });

  it('starts independent reference lookups concurrently', async () => {
    const { ingredientsService, assetsService, configService, loggerService } =
      createMocks();
    let releaseFirstLookup = () => {};
    const firstLookup = new Promise<{ id: string }>((resolve) => {
      releaseFirstLookup = () => resolve({ id: id1 });
    });

    (ingredientsService.findOne as vi.Mock).mockImplementation(
      (query: ReferenceLookupQuery) =>
        query.id === id1
          ? firstLookup
          : Promise.resolve({ id: query.id as string }),
    );

    const resultPromise = buildReferenceImageUrls(
      withOrganization(
        { assetsService, configService, ingredientsService, loggerService },
        { referenceIds: [id1, id2] },
      ),
    );

    expect(ingredientsService.findOne).toHaveBeenCalledTimes(2);
    releaseFirstLookup();
    await expect(resultPromise).resolves.toEqual([
      `${BASE_URL}/ingredients/images/${id1}`,
      `${BASE_URL}/ingredients/images/${id2}`,
    ]);
  });

  it('reuses the lookup for duplicate reference ids', async () => {
    const { ingredientsService, assetsService, configService, loggerService } =
      createMocks();
    (ingredientsService.findOne as vi.Mock).mockResolvedValue({ id: id1 });

    await expect(
      buildReferenceImageUrls(
        withOrganization(
          { assetsService, configService, ingredientsService, loggerService },
          { referenceIds: [id1, id1] },
        ),
      ),
    ).resolves.toEqual([
      `${BASE_URL}/ingredients/images/${id1}`,
      `${BASE_URL}/ingredients/images/${id1}`,
    ]);
    expect(ingredientsService.findOne).toHaveBeenCalledTimes(1);
  });
});

describe('reference image tenant isolation', () => {
  const sameTenantId = testId('reference', 10);
  const foreignId = testId('reference', 11);
  const deletedId = testId('reference', 12);
  const missingId = testId('reference', 13);

  const rows: TenantMediaRow[] = [
    { id: sameTenantId, organizationId: ORGANIZATION_ID },
    { id: foreignId, organizationId: FOREIGN_ORGANIZATION_ID },
    { id: deletedId, isDeleted: true, organizationId: ORGANIZATION_ID },
  ];

  function createTenantMocks() {
    const mocks = createMocks();
    (mocks.ingredientsService.findOne as vi.Mock).mockImplementation(
      (query: ReferenceLookupQuery) => resolveTenantRow(rows, query),
    );
    (mocks.assetsService.findOne as vi.Mock).mockImplementation(
      (query: ReferenceLookupQuery) => resolveTenantRow(rows, query),
    );
    return mocks;
  }

  it('resolves a same-tenant live IMAGE ingredient', async () => {
    const mocks = createTenantMocks();

    const url = await buildReferenceImageUrl(
      withOrganization(mocks, { referenceId: sameTenantId }),
    );

    expect(url).toBe(`${BASE_URL}/ingredients/images/${sameTenantId}`);
    expect(mocks.ingredientsService.findOne).toHaveBeenCalledWith({
      category: IngredientCategory.IMAGE,
      id: sameTenantId,
      isDeleted: false,
      organizationId: ORGANIZATION_ID,
    });
  });

  it('returns null for a foreign-organization id without a distinct error', async () => {
    const mocks = createTenantMocks();

    await expect(
      buildReferenceImageUrl(
        withOrganization(mocks, { referenceId: foreignId }),
      ),
    ).resolves.toBeNull();

    expect(mocks.loggerService.warn).toHaveBeenCalledWith(
      'Reference not found or invalid',
      { reference: foreignId },
    );
    expect(
      JSON.stringify((mocks.ingredientsService.findOne as vi.Mock).mock.calls),
    ).not.toContain(FOREIGN_ORGANIZATION_ID);
  });

  it('returns null for a soft-deleted same-tenant id', async () => {
    const mocks = createTenantMocks();

    await expect(
      buildReferenceImageUrl(
        withOrganization(mocks, { referenceId: deletedId }),
      ),
    ).resolves.toBeNull();

    expect(mocks.loggerService.warn).toHaveBeenCalledWith(
      'Reference not found or invalid',
      { reference: deletedId },
    );
  });

  it('treats missing, foreign, and deleted ids as indistinguishable misses', async () => {
    const mocks = createTenantMocks();

    const missing = await buildReferenceImageUrl(
      withOrganization(mocks, { referenceId: missingId }),
    );
    const foreign = await buildReferenceImageUrl(
      withOrganization(mocks, { referenceId: foreignId }),
    );
    const deleted = await buildReferenceImageUrl(
      withOrganization(mocks, { referenceId: deletedId }),
    );

    expect(missing).toBeNull();
    expect(foreign).toBeNull();
    expect(deleted).toBeNull();
    expect(mocks.loggerService.warn).toHaveBeenCalledTimes(3);
    expect(mocks.loggerService.warn).toHaveBeenNthCalledWith(
      1,
      'Reference not found or invalid',
      { reference: missingId },
    );
    expect(mocks.loggerService.warn).toHaveBeenNthCalledWith(
      2,
      'Reference not found or invalid',
      { reference: foreignId },
    );
    expect(mocks.loggerService.warn).toHaveBeenNthCalledWith(
      3,
      'Reference not found or invalid',
      { reference: deletedId },
    );
  });

  it('aggregates only same-tenant live URLs from a mixed id list', async () => {
    const mocks = createTenantMocks();

    const result = await buildReferenceImageUrls(
      withOrganization(mocks, {
        referenceIds: [sameTenantId, foreignId, deletedId, missingId],
      }),
    );

    expect(result).toEqual([`${BASE_URL}/ingredients/images/${sameTenantId}`]);
  });
});
