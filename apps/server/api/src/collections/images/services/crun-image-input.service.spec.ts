import { CrunImageInputService } from '@api/collections/images/services/crun-image-input.service';
import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { buildCrunContract } from '@api/services/integrations/crun/contracts/crun-contract-import.service';
import {
  CRUN_IMAGE_MANIFEST,
  CRUN_PRICING_SNAPSHOT,
} from '@api/services/integrations/crun/contracts/crun-manifest';
import { ModelCategory } from '@genfeedai/contracts';

const user = {
  id: 'user',
  userId: 'user',
  organizationId: 'org',
  brandId: 'c1234567890123456789012345',
};
function fixture(index = 0) {
  const contract = buildCrunContract(CRUN_IMAGE_MANIFEST[index]);
  const model = {
    id: 'model',
    key: `crun/${contract.endpoint}`,
    category: ModelCategory.IMAGE,
    provider: 'crun',
    isActive: true,
    isDeleted: false,
    reviewedProviderContractVersion: contract.version,
    pendingProviderContractVersion: null,
    providerInputSchema: contract,
  };
  const prisma = {
    brand: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: user.brandId, label: 'Brand' }),
    },
    folder: { findFirst: vi.fn().mockResolvedValue({ id: 'folder' }) },
    prompt: {
      findFirst: vi.fn().mockResolvedValue({ enhanced: 'enhanced prompt' }),
    },
    ingredient: {
      findFirst: vi.fn().mockResolvedValue({
        metadata: {
          width: 1024,
          height: 1024,
          size: 512,
          extension: 'PNG',
          isDeleted: false,
        },
      }),
    },
    modelProviderContract: {
      findFirst: vi.fn().mockResolvedValue({ pricing: CRUN_PRICING_SNAPSHOT }),
    },
  };
  const models = {
    findOne: vi.fn().mockResolvedValue(model),
    findBillablePricingProfile: vi.fn().mockResolvedValue(
      billableProfile({
        key: model.key,
        provider: 'crun',
        rateVersion: contract.version,
      }),
    ),
  };
  const ingredients = {
    findOne: vi.fn().mockResolvedValue({ id: 'c2345678901234567890123456' }),
  };
  const assets = { findOne: vi.fn().mockResolvedValue(null) };
  const builder = {
    buildPrompt: vi.fn().mockResolvedValue({
      input: { prompt: 'deterministically rendered' },
      templateUsed: 'image-default',
      templateVersion: 1,
    }),
  };
  const tasks = {
    isAdmissionEnabled: vi.fn().mockReturnValue(true),
    resolveCredential: vi.fn().mockResolvedValue({
      apiKey: 'secret',
      credentialSource: 'hosted',
      credentialId: null,
      credentialFingerprint: 'a'.repeat(64),
    }),
  };
  const config = {
    get: vi.fn((key: string) =>
      key === 'CRUN_CREDITS_PER_USD' ? '1000' : 'test-rate',
    ),
    ingredientsEndpoint: 'https://owned.fixture.test',
    cdnUrl: 'https://cdn.fixture.test',
  };
  const service = new CrunImageInputService(
    prisma as never,
    models as never,
    ingredients as never,
    assets as never,
    builder as never,
    tasks as never,
    config as never,
  );
  const raw = {
    model: model.key,
    text: 'raw prompt',
    crunControls: { contractVersion: contract.version },
  };
  return {
    service,
    prisma,
    models,
    ingredients,
    assets,
    config,
    builder,
    tasks,
    raw,
    contract,
  };
}

describe('Crun deterministic image preparation', () => {
  it('prepares Nano mixed owned-image and canonical asset references in original order', async () => {
    const f = fixture();
    const imageId = 'c2345678901234567890123456';
    const assetId = 'c3456789012345678901234567';
    f.ingredients.findOne.mockImplementation(
      async (where: { id: string; category: string }) =>
        where.id === imageId && where.category === 'IMAGE'
          ? { id: imageId }
          : null,
    );
    f.assets.findOne.mockResolvedValue({
      id: assetId,
      userId: user.userId,
      mimeType: 'image/png',
      category: 'REFERENCE',
      parentType: 'BRAND',
      parentBrandId: user.brandId,
      parentOrgId: user.organizationId,
      parentIngredientId: null,
      parentArticleId: null,
    });
    const result = await f.service.prepare(
      { ...f.raw, references: [imageId, assetId, imageId] },
      user,
    );
    expect(result.isAvailable).toBe(true);
    if (!result.isAvailable) throw new Error(result.reasonCode);
    expect(result.data.preparation.request.input.img_urls).toEqual([
      `https://owned.fixture.test/images/${imageId}`,
      `https://cdn.fixture.test/references/${assetId}`,
      `https://owned.fixture.test/images/${imageId}`,
    ]);
    expect(f.assets.findOne).toHaveBeenCalledWith({
      id: assetId,
      userId: user.userId,
      isDeleted: false,
      category: 'REFERENCE',
    });
    expect(f.prisma.brand.findFirst).toHaveBeenCalledWith({
      where: {
        id: user.brandId,
        organizationId: user.organizationId,
        isDeleted: false,
      },
      select: { id: true },
    });
  });
  it.each([0, 1])(
    'prepares exact reviewed controls for launch model %s with one deterministic render',
    async (index) => {
      const f = fixture(index);
      const result = await f.service.prepare(f.raw, user);
      expect(result.isAvailable).toBe(true);
      if (!result.isAvailable) throw new Error('Unavailable');
      expect(result.data.preparation.request.input.prompt).toBe(
        'deterministically rendered',
      );
      expect(result.data.preparation.request.input).not.toHaveProperty('width');
      expect(result.data.preparation.request.input).not.toHaveProperty(
        'img_urls',
      );
      if (index === 1)
        expect(result.data.preparation.request.input).toMatchObject({
          num_outputs: 1,
          content_moderation: true,
          resolution: '2K',
        });
      expect(f.builder.buildPrompt).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    { extra: 'denied' },
    { seed: 1 },
    { references: ['https://external.test/image'] },
    { outputs: '4' },
    { crunControls: null },
    { text: null },
  ])(
    'denies unknown/coerced/null input before preparation: %j',
    async (invalid) => {
      const f = fixture();
      await expect(
        f.service.prepare({ ...f.raw, ...invalid }, user),
      ).rejects.toMatchObject({ response: { code: 'CRUN_INVALID_INPUT' } });
      expect(f.builder.buildPrompt).not.toHaveBeenCalled();
    },
  );
  it('pending enhancement has no provider estimate or automatic harness work', async () => {
    const f = fixture();
    expect(await f.service.prepare({ ...f.raw, harness: true }, user)).toEqual({
      isAvailable: false,
      reasonCode: 'CRUN_ENHANCEMENT_REQUIRED',
    });
    expect(f.builder.buildPrompt).not.toHaveBeenCalled();
    expect(f.tasks.resolveCredential).not.toHaveBeenCalled();
  });
  it('requires exact owned enhanced prompt provenance', async () => {
    const f = fixture();
    expect(
      await f.service.prepare(
        { ...f.raw, promptId: 'c3456789012345678901234567' },
        user,
      ),
    ).toMatchObject({ reasonCode: 'CRUN_ENHANCEMENT_REQUIRED' });
    expect(
      (
        await f.service.prepare(
          {
            ...f.raw,
            text: 'enhanced prompt',
            promptId: 'c3456789012345678901234567',
          },
          user,
        )
      ).isAvailable,
    ).toBe(true);
    expect(f.prisma.prompt.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org',
          userId: 'user',
          brandId: user.brandId,
          isDeleted: false,
        }),
      }),
    );
  });
  it('rejects unresolved selected references instead of dropping them', async () => {
    const f = fixture();
    f.ingredients.findOne.mockResolvedValue(null);
    await expect(
      f.service.prepare(
        { ...f.raw, references: ['c2345678901234567890123456'] },
        user,
      ),
    ).rejects.toMatchObject({ response: { code: 'CRUN_INVALID_INPUT' } });
    expect(f.builder.buildPrompt).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { width: 0, height: 1024, size: 512, extension: 'PNG', isDeleted: false },
    { width: 1024, height: 1024, size: 0, extension: 'PNG', isDeleted: false },
    { width: 1024, height: 1024, size: 512, extension: 'PNG', isDeleted: true },
  ])(
    'rejects Seedream references without complete nondeleted image facts',
    async (metadata) => {
      const f = fixture(1);
      f.prisma.ingredient.findFirst.mockResolvedValue({ metadata });
      await expect(
        f.service.prepare(
          { ...f.raw, references: ['c2345678901234567890123456'] },
          user,
        ),
      ).rejects.toMatchObject({ response: { code: 'CRUN_INVALID_INPUT' } });
      expect(f.builder.buildPrompt).not.toHaveBeenCalled();
    },
  );
  it('rejects foreign brand before deterministic render', async () => {
    const f = fixture();
    f.prisma.brand.findFirst.mockResolvedValue(null);
    await expect(f.service.prepare(f.raw, user)).rejects.toThrow(
      'Selected brand is unavailable',
    );
    expect(f.builder.buildPrompt).not.toHaveBeenCalled();
  });
  it('canonical launch defaults and empty knowledge normalize to the same intent as explicit controls', () => {
    const f = fixture();
    const raw = {
      model: f.raw.model,
      text: ' Bird ',
      crunControls: { contractVersion: f.contract.version },
    };
    expect(
      f.service.normalize({ ...raw, knowledge: {} }, user as never),
    ).toEqual(
      f.service.normalize(
        {
          ...raw,
          text: 'Bird',
          isBrandingEnabled: false,
          crunControls: {
            contractVersion: f.contract.version,
            aspectRatio: '1:1',
            resolution: '1K',
            outputFormat: 'png',
          },
        },
        user as never,
      ),
    );
  });
});
