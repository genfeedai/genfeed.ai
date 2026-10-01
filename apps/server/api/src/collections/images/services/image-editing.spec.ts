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
  metadata: { width, height },
});
const findOne = vi.fn();
const service = new ImageGenerationAdmissionService(
  {} as never,
  { ingredientsEndpoint: 'https://cdn.example.com/ingredients' } as never,
  {} as never,
  { findOne } as never,
  {} as never,
  {} as never,
);
const dto = (patch: Partial<EditImageDto> = {}) =>
  Object.assign(new EditImageDto(), {
    prompt: 'Change only the sign to OPEN',
    model,
    ...patch,
  });

beforeEach(() => {
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
