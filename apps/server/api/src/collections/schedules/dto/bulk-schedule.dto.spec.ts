import {
  BulkScheduleDto,
  MAX_BULK_SCHEDULE_CONTENT_IDS,
  MAX_BULK_SCHEDULE_TARGETS,
} from '@api/collections/schedules/dto/bulk-schedule.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

async function errorsForProperty(
  property: string,
  overrides: Record<string, unknown>,
) {
  const dto = plainToInstance(BulkScheduleDto, {
    brandIds: ['brand-1'],
    contentIds: ['content-1'],
    platforms: ['instagram'],
    schedulingStrategy: 'evenly-distributed',
    ...overrides,
  });
  const errors = await validate(dto);

  return errors.filter((error) => error.property === property);
}

function idsOfLength(length: number): string[] {
  return Array.from({ length }, (_, i) => `content-${i}`);
}

describe('BulkScheduleDto', () => {
  it('should be defined', () => {
    expect(BulkScheduleDto).toBeDefined();
  });

  describe('validation', () => {
    it('accepts a contentIds array at the maximum size', async () => {
      expect(
        await errorsForProperty('contentIds', {
          contentIds: idsOfLength(MAX_BULK_SCHEDULE_CONTENT_IDS),
        }),
      ).toEqual([]);
    });

    it('rejects a contentIds array over the maximum size', async () => {
      const contentIdErrors = await errorsForProperty('contentIds', {
        contentIds: idsOfLength(MAX_BULK_SCHEDULE_CONTENT_IDS + 1),
      });

      expect(contentIdErrors).toHaveLength(1);
      expect(contentIdErrors[0]?.constraints).toHaveProperty('arrayMaxSize');
    });

    it('rejects a platforms array over the maximum size', async () => {
      const platformErrors = await errorsForProperty('platforms', {
        platforms: idsOfLength(MAX_BULK_SCHEDULE_TARGETS + 1),
      });

      expect(platformErrors).toHaveLength(1);
      expect(platformErrors[0]?.constraints).toHaveProperty('arrayMaxSize');
    });

    it('rejects a brandIds array over the maximum size', async () => {
      const brandIdErrors = await errorsForProperty('brandIds', {
        brandIds: idsOfLength(MAX_BULK_SCHEDULE_TARGETS + 1),
      });

      expect(brandIdErrors).toHaveLength(1);
      expect(brandIdErrors[0]?.constraints).toHaveProperty('arrayMaxSize');
    });

    it('rejects non-string contentIds', async () => {
      const contentIdErrors = await errorsForProperty('contentIds', {
        contentIds: ['content-1', 42],
      });

      expect(contentIdErrors).toHaveLength(1);
      expect(contentIdErrors[0]?.constraints).toHaveProperty('isString');
    });
  });
});
