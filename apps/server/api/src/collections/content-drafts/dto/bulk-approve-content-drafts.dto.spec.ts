import {
  BulkApproveContentDraftsDto,
  MAX_BULK_APPROVE_DRAFTS,
} from '@api/collections/content-drafts/dto/bulk-approve-content-drafts.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

async function idsErrorsFor(idCount: number) {
  const dto = plainToInstance(BulkApproveContentDraftsDto, {
    ids: Array.from({ length: idCount }, (_, i) => `draft-${i}`),
  });
  const errors = await validate(dto);

  return errors.filter((error) => error.property === 'ids');
}

describe('BulkApproveContentDraftsDto', () => {
  it('should be defined', () => {
    expect(BulkApproveContentDraftsDto).toBeDefined();
  });

  describe('validation', () => {
    it('accepts an ids array at the maximum size', async () => {
      expect(await idsErrorsFor(MAX_BULK_APPROVE_DRAFTS)).toEqual([]);
    });

    it('rejects an ids array over the maximum size', async () => {
      const idsErrors = await idsErrorsFor(MAX_BULK_APPROVE_DRAFTS + 1);

      expect(idsErrors).toHaveLength(1);
      expect(idsErrors[0]?.constraints).toHaveProperty('arrayMaxSize');
    });

    it('rejects non-string ids', async () => {
      const dto = plainToInstance(BulkApproveContentDraftsDto, {
        ids: ['draft-1', 42],
      });
      const errors = await validate(dto);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.constraints).toHaveProperty('isString');
    });
  });
});
