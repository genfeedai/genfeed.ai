import { CrunVideoInputService } from '@api/collections/videos/services/crun-video-input.service';
import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { buildCrunContract } from '@api/services/integrations/crun/contracts/crun-contract-import.service';
import {
  CRUN_VIDEO_MANIFEST,
  CRUN_VIDEO_PRICING_SNAPSHOT,
} from '@api/services/integrations/crun/contracts/crun-manifest';
import { personasServiceStub } from '@api/shared/testing/personas-service.stub';
import { ModelCategory } from '@genfeedai/contracts';

const user = {
  id: 'user',
  userId: 'user',
  organizationId: 'org',
  brandId: 'c1234567890123456789012345',
};
function fixture(index = 0) {
  const contract = buildCrunContract(CRUN_VIDEO_MANIFEST[index]);
  const model = {
    id: 'model',
    key: `crun/${contract.endpoint}`,
    category: ModelCategory.VIDEO,
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
      findFirst: vi
        .fn()
        .mockResolvedValue({ pricing: CRUN_VIDEO_PRICING_SNAPSHOT }),
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
  };
  const personas = personasServiceStub();
  const service = new CrunVideoInputService(
    prisma as never,
    models as never,
    ingredients as never,
    assets as never,
    builder as never,
    tasks as never,
    config as never,
    personas,
  );
  const raw = {
    model: model.key,
    text: 'raw prompt',
    crunControls: { contractVersion: contract.version },
  };
  return {
    assets,
    service,
    prisma,
    models,
    ingredients,
    builder,
    tasks,
    raw,
    contract,
  };
}

describe('Crun reviewed video preparation', () => {
  it.each([0, 1])(
    'builds exact reviewed video %s once with defaults',
    async (index) => {
      const f = fixture(index);
      const result = await f.service.prepare(f.raw, user);
      expect(result.isAvailable).toBe(true);
      if (!result.isAvailable) throw new Error('Unavailable video');
      expect(result.data.preparation.request.model).toBe(f.contract.endpoint);
      expect(result.data.preparation.request.input).toMatchObject({
        prompt: 'deterministically rendered',
        duration: index === 0 ? 5 : 8,
        aspect_ratio: '16:9',
      });
      expect(result.data.preparation.request.input).not.toHaveProperty('audio');
      expect(f.builder.buildPrompt).toHaveBeenCalledTimes(1);
      expect(f.builder.buildPrompt.mock.calls[0]?.[1]).toMatchObject({
        modelCategory: ModelCategory.VIDEO,
      });
    },
  );
  it.each([4, 6])(
    'rejects unreviewed Veo duration %s before prompt or credential work',
    async (duration) => {
      const f = fixture(1);
      expect(
        await f.service.prepare(
          { ...f.raw, crunControls: { ...f.raw.crunControls, duration } },
          user,
        ),
      ).toEqual({ isAvailable: false, reasonCode: 'PRICING_UNAVAILABLE' });
      expect(f.builder.buildPrompt).not.toHaveBeenCalled();
      expect(f.tasks.resolveCredential).not.toHaveBeenCalled();
    },
  );
  it.each([
    { width: 1024 },
    { references: ['https://other.invalid/frame'] },
    { audio: true },
    { crunControls: { contractVersion: 'v', seed: 1 } },
    { text: null },
  ])(
    'rejects unknown and malformed original video intent %j',
    async (invalid) => {
      const f = fixture();
      await expect(
        f.service.prepare({ ...f.raw, ...invalid }, user),
      ).rejects.toMatchObject({ response: { code: 'CRUN_INVALID_INPUT' } });
      expect(f.builder.buildPrompt).not.toHaveBeenCalled();
    },
  );
  it.each([null, 42, {}, ['invalid']])(
    'rejects malformed compiled prompt %j before credential admission',
    async (prompt) => {
      const f = fixture();
      f.builder.buildPrompt.mockResolvedValue({
        input: { prompt },
        templateUsed: 'image-default',
        templateVersion: 1,
      } as never);
      await expect(f.service.prepare(f.raw, user)).rejects.toMatchObject({
        response: { code: 'CRUN_INVALID_INPUT' },
      });
      expect(f.tasks.resolveCredential).not.toHaveBeenCalled();
    },
  );
  it('preserves zero guidance and false translation in exact provider input', async () => {
    for (const index of [0, 1]) {
      const f = fixture(index);
      const result = await f.service.prepare(
        {
          ...f.raw,
          crunControls: {
            ...f.raw.crunControls,
            ...(index === 0
              ? { guidanceScale: 0 }
              : { translatePrompt: false }),
          },
        },
        user,
      );
      if (!result.isAvailable) throw new Error('Unavailable video');
      expect(result.data.preparation.request.input).toHaveProperty(
        index === 0 ? 'cfg_scale' : 'translate_prompt',
        index === 0 ? 0 : false,
      );
    }
  });
  it('authorizes ordered start/end frames, omits aspect, and rejects foreign frames before rendering', async () => {
    const f = fixture();
    const start = 'c2345678901234567890123456';
    const end = 'c3456789012345678901234567';
    f.ingredients.findOne.mockImplementation(async (where: { id: string }) => ({
      id: where.id,
    }));
    const result = await f.service.prepare(
      { ...f.raw, references: [start], endFrame: end, parentId: start },
      user,
    );
    if (!result.isAvailable) throw new Error('Unavailable frames');
    expect(result.data.preparation.request.input.img_urls).toEqual([
      `https://owned.fixture.test/images/${start}`,
      `https://owned.fixture.test/images/${end}`,
    ]);
    expect(result.data.preparation.request.input).not.toHaveProperty(
      'aspect_ratio',
    );
    f.prisma.ingredient.findFirst.mockResolvedValue(null);
    f.ingredients.findOne.mockResolvedValue(null);
    f.assets.findOne.mockResolvedValue(null);
    f.builder.buildPrompt.mockClear();
    await expect(
      f.service.prepare({ ...f.raw, references: [start] }, user),
    ).rejects.toMatchObject({ response: { code: 'CRUN_INVALID_INPUT' } });
    expect(f.builder.buildPrompt).not.toHaveBeenCalled();
  });
  it('denies brand scope and enhancement without rendering', async () => {
    const f = fixture();
    expect(
      await f.service.prepare({ ...f.raw, harness: true }, user),
    ).toMatchObject({ reasonCode: 'CRUN_ENHANCEMENT_REQUIRED' });
    f.prisma.brand.findFirst.mockResolvedValue(null);
    await expect(f.service.prepare(f.raw, user)).rejects.toMatchObject({
      status: 403,
    });
    expect(f.builder.buildPrompt).not.toHaveBeenCalled();
  });
});
