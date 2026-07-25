import {
  BULK_UPDATE_ACTIVITIES_MAX_IDS,
  BulkUpdateActivitiesDto,
} from '@api/collections/activities/dto/bulk-update-activities.dto';
import { validate } from 'class-validator';

function buildIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    index.toString(16).padStart(24, '0'),
  );
}

describe('BulkUpdateActivitiesDto', () => {
  it('should be defined', () => {
    expect(BulkUpdateActivitiesDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new BulkUpdateActivitiesDto();
      expect(dto).toBeInstanceOf(BulkUpdateActivitiesDto);
    });

    it('accepts an id list at the maximum size', async () => {
      const dto = Object.assign(new BulkUpdateActivitiesDto(), {
        ids: buildIds(BULK_UPDATE_ACTIVITIES_MAX_IDS),
        isRead: true,
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('rejects an id list over the maximum size', async () => {
      const dto = Object.assign(new BulkUpdateActivitiesDto(), {
        ids: buildIds(BULK_UPDATE_ACTIVITIES_MAX_IDS + 1),
        isRead: true,
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('ids');
      expect(errors[0]?.constraints).toHaveProperty('arrayMaxSize');
    });

    it('rejects non-string ids', async () => {
      const dto = Object.assign(new BulkUpdateActivitiesDto(), {
        ids: [1, 2],
      });

      const errors = await validate(dto);

      expect(JSON.stringify(errors)).toContain('isString');
    });
  });
});
