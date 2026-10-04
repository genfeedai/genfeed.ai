import { EditImageDto } from '@api/collections/images/dto/edit-image.dto';
import { ImageGenerationAdmissionService } from '@api/collections/images/services/image-generation-admission.service';
import { buildIdeogramImageEditInput } from '@api/services/prompt-builder/builders/replicate/ideogram-image-edit.builder';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { testId } from '@helpers/testing/test-id.helper';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const primary = testId('edit', 1);
const secondary = testId('edit', 2);
const mask = testId('edit', 3);
const brandId = testId('edit', 4);
const organizationId = testId('edit', 5);
const model = MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_4_5;
const ready = (id: string, width = 1024, height = 768) => ({
  id,
  organizationId,
  brandId,
  category: IngredientCategory.IMAGE,
  status: IngredientStatus.UPLOADED,
  s3Key: `images/${id}.png`,
  metadata: { width, height, extension: 'png' },
});
const findOne = vi.fn();
const resolveCharacterReferences = vi.fn();
const service = new ImageGenerationAdmissionService(
  {} as never,
  { ingredientsEndpoint: 'https://cdn.example.com/ingredients' } as never,
  {} as never,
  { findOne } as never,
  {} as never,
  {} as never,
  { resolveCharacterReferences } as never,
);
const dto = (patch: Partial<EditImageDto> = {}) =>
  Object.assign(new EditImageDto(), {
    prompt: 'Change only the sign to OPEN',
    model,
    ...patch,
  });

beforeEach(() => {
  resolveCharacterReferences.mockReset();
  resolveCharacterReferences.mockResolvedValue({
    availableAvatarIds: new Set(),
    grantedAvatarOwners: new Map(),
    personaId: null,
  });
  findOne.mockReset();
  findOne.mockImplementation(async (query: { id: string }) => ready(query.id));
});

describe('Image editing admission and provider contract', () => {
  it('preserves source order and sends only the verified editing fields with one native batch', async () => {
    const editing = await service.admitImageEdit(
      primary,
      dto({
        references: [secondary],
        maskId: mask,
        size: '1536x640',
        outputs: 8,
        seed: 0,
      }),
      organizationId,
      brandId,
    );
    expect(editing).toMatchObject({
      width: 1024,
      height: 768,
      size: 'source',
      recipe: {
        sourceIds: [primary, secondary],
        maskId: mask,
        outputs: 8,
        quality: 'medium',
        seed: 0,
      },
    });
    expect(buildIdeogramImageEditInput(dto().prompt, editing, 8, 0)).toEqual({
      prompt: 'Change only the sign to OPEN',
      images: [primary, secondary].map(
        (id) => `https://cdn.example.com/ingredients/images/${id}`,
      ),
      mask: `https://cdn.example.com/ingredients/images/${mask}`,
      size: 'source',
      quality: 'medium',
      num_images: 8,
      seed: 0,
    });
    expect(findOne).toHaveBeenCalledWith(
      {
        id: mask,
        organizationId,
        brandId,
        category: IngredientCategory.IMAGE,
        isDeleted: false,
      },
      expect.any(Array),
    );
  });
  it.each([primary, secondary, mask])(
    'fails closed when any primary/reference/mask is missing or foreign (%s)',
    async (id) => {
      findOne.mockImplementation(async (query: { id: string }) =>
        query.id === id ? null : ready(query.id),
      );
      await expect(
        service.admitImageEdit(
          primary,
          dto({ references: [secondary], maskId: mask }),
          organizationId,
          brandId,
        ),
      ).rejects.toThrow('Editing image not found');
    },
  );
  it('rejects processing and dimensionless sources', async () => {
    findOne.mockResolvedValue({
      ...ready(primary),
      status: IngredientStatus.PROCESSING,
    });
    await expect(
      service.admitImageEdit(primary, dto(), organizationId, brandId),
    ).rejects.toThrow('finish processing');
    findOne.mockResolvedValue({
      ...ready(primary),
      metadata: { width: 0, height: 768 },
    });
    await expect(
      service.admitImageEdit(primary, dto(), organizationId, brandId),
    ).rejects.toThrow('finish processing');
  });
  it('rejects a mask that does not match the primary dimensions', async () => {
    findOne.mockImplementation(async (query: { id: string }) =>
      ready(query.id, query.id === mask ? 512 : 1024),
    );
    await expect(
      service.admitImageEdit(
        primary,
        dto({ maskId: mask }),
        organizationId,
        brandId,
      ),
    ).rejects.toThrow('dimensions must match');
  });
  it.each([
    { references: [primary] },
    {
      references: [
        secondary,
        mask,
        testId('edit', 6),
        testId('edit', 7),
        testId('edit', 8),
      ],
    },
    { outputs: 9 },
    { outputs: 1.5 },
    { seed: -1 },
    { size: '2048x2048' },
    { prompt: '  ' },
  ])(
    'rejects invalid editing inputs before asset lookup: %j',
    async (patch) => {
      findOne.mockClear();
      await expect(
        service.admitImageEdit(
          primary,
          dto(patch as Partial<EditImageDto>),
          organizationId,
          brandId,
        ),
      ).rejects.toThrow();
      expect(findOne).not.toHaveBeenCalled();
    },
  );
  it('does not expose generation-only or provider parameters on its DTO', async () => {
    const request = plainToInstance(EditImageDto, {
      prompt: 'Change the colour',
      providerInput: { images: ['https://foreign.example/image'] },
      harness: true,
      operation: 'image-edit',
    });
    const errors = await validate(request, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['providerInput', 'harness', 'operation']),
    );
  });
});

describe('FLUX.3 model-specific admission', () => {
  const fluxDto = (patch: Partial<EditImageDto> = {}) =>
    dto({
      model: MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE_EDIT,
      ...patch,
    });
  it.each([
    { maskId: mask },
    { seed: 0 },
    { size: 'source' },
    { outputs: 2 },
    { resolution: '8k' },
    { aspectRatio: '6:7' },
  ])(
    'rejects unsupported controls before any source lookup: %j',
    async (patch) => {
      await expect(
        service.admitImageEdit(
          primary,
          fluxDto(patch as Partial<EditImageDto>),
          organizationId,
          brandId,
        ),
      ).rejects.toThrow('FLUX.3');
      expect(findOne).not.toHaveBeenCalled();
    },
  );
  it.each([
    [255, 256],
    [256, 255],
    [4001, 4000],
  ])('rejects provider source dimensions %sx%s', async (width, height) => {
    findOne.mockResolvedValue(ready(primary, width, height));
    await expect(
      service.admitImageEdit(primary, fluxDto(), organizationId, brandId),
    ).rejects.toThrow('16 megapixels');
  });
  it.each([
    [256, 256],
    [4000, 4000],
  ])(
    'accepts provider boundary %sx%s and persists native controls',
    async (width, height) => {
      findOne.mockResolvedValue(ready(primary, width, height));
      const editing = await service.admitImageEdit(
        primary,
        fluxDto({ resolution: '1.5k', aspectRatio: 'auto' }),
        organizationId,
        brandId,
      );
      expect(editing.recipe).toMatchObject({
        outputs: 1,
        resolution: '1.5k',
        aspectRatio: 'auto',
        grounding: false,
      });
      expect(editing.recipe).not.toHaveProperty('quality');
      expect(editing.recipe).not.toHaveProperty('size');
    },
  );
  it('accepts ten ordered sources but rejects eleven before lookup', async () => {
    const references = Array.from({ length: 9 }, (_, i) =>
      testId('flux', i + 10),
    );
    const editing = await service.admitImageEdit(
      primary,
      fluxDto({ references }),
      organizationId,
      brandId,
    );
    expect(editing.sourceIds).toEqual([primary, ...references]);
    findOne.mockClear();
    await expect(
      service.admitImageEdit(
        primary,
        fluxDto({ references: [...references, testId('flux', 30)] }),
        organizationId,
        brandId,
      ),
    ).rejects.toThrow();
    expect(findOne).not.toHaveBeenCalled();
  });
  it.each(['svg', 'avif', ''])(
    'rejects unsupported or unknown source formats %s',
    async (extension) => {
      findOne.mockResolvedValue({
        ...ready(primary),
        metadata: { width: 1024, height: 768, extension },
      });
      await expect(
        service.resolveFlux3References(organizationId, brandId, [primary]),
      ).rejects.toThrow('JPEG');
    },
  );
  it('scopes ordinary generation references and fails on unresolved images', async () => {
    await service.resolveFlux3References(organizationId, brandId, [primary]);
    expect(findOne).toHaveBeenCalledWith(
      {
        id: primary,
        organizationId,
        brandId,
        isDeleted: false,
        category: IngredientCategory.IMAGE,
      },
      expect.any(Array),
    );
    findOne.mockResolvedValue(null);
    await expect(
      service.resolveFlux3References(organizationId, brandId, [secondary]),
    ).rejects.toThrow('not found');
  });

  it('resolves a shared character reference owned by another brand for FLUX.3 (#6009)', async () => {
    const avatar = testId('edit', 6);
    resolveCharacterReferences.mockResolvedValue({
      availableAvatarIds: new Set([avatar]),
      grantedAvatarOwners: new Map(),
      personaId: 'persona-1',
    });

    await expect(
      service.resolveFlux3References(organizationId, brandId, [avatar]),
    ).resolves.toEqual([
      `https://cdn.example.com/ingredients/images/${avatar}`,
    ]);

    const query = findOne.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(query.organizationId).toBe(organizationId);
    expect(query).not.toHaveProperty('brandId');
  });

  it('reads a granted character reference from its owning organization only (#6037)', async () => {
    const avatar = testId('edit', 8);
    resolveCharacterReferences.mockResolvedValue({
      availableAvatarIds: new Set([avatar]),
      grantedAvatarOwners: new Map([[avatar, 'org-owner']]),
      personaId: 'persona-g',
    });

    await service.resolveFlux3References(organizationId, brandId, [avatar]);

    const query = findOne.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(query.organizationId).toBe('org-owner');
    expect(query).not.toHaveProperty('brandId');
  });

  it('keeps FLUX.3 references brand-scoped when they are not a shared character image', async () => {
    const image = testId('edit', 7);

    await service.resolveFlux3References(organizationId, brandId, [image]);

    expect(findOne.mock.calls[0]?.[0]).toMatchObject({ brandId });
  });
});
