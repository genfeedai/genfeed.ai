import {
  StudioGenerateDraftReferenceDto,
  UpsertStudioGenerateDraftDto,
} from '@api/collections/studio-generate-drafts/dto/upsert-studio-generate-draft.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

describe('Studio draft reference order', () => {
  it.each([undefined, 0, 23])(
    'accepts optional bounded order %s',
    async (order) => {
      const reference = plainToInstance(StudioGenerateDraftReferenceDto, {
        id: 'image',
        role: 'reference',
        ...(order !== undefined ? { order } : {}),
      });
      expect(await validate(reference)).toEqual([]);
    },
  );
  it.each([-1, 24, 1.5, '1', null])(
    'rejects a present invalid order %s',
    async (order) => {
      const reference = plainToInstance(StudioGenerateDraftReferenceDto, {
        id: 'image',
        role: 'reference',
        order,
      });
      expect(
        (await validate(reference)).some((error) => error.property === 'order'),
      ).toBe(true);
    },
  );
  it('retains order through nested transport validation with whitelisting', async () => {
    const draft = plainToInstance(UpsertStudioGenerateDraftDto, {
      brandId: 'brand',
      type: 'image',
      prompt: 'Use @Image1 and @Image2',
      settingsByType: {},
      references: [{ id: 'library', role: 'reference', order: 0 }],
      attachments: [{ id: 'upload', role: 'reference', order: 1 }],
      knowledgeSelection: {},
    });
    expect(
      await validate(draft, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
    expect(draft.references[0]?.order).toBe(0);
    expect(draft.attachments[0]?.order).toBe(1);
  });
});
