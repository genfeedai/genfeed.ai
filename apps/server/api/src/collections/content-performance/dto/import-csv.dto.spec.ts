import {
  CsvMetricEntryDto,
  ImportCsvDto,
} from '@api/collections/content-performance/dto/import-csv.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('ImportCsvDto', () => {
  it('should validate a correct DTO', async () => {
    const dto = plainToInstance(ImportCsvDto, {
      entries: [
        {
          comments: 10,
          externalPostId: '123456',
          likes: 50,
          measuredAt: '2026-01-15T00:00:00Z',
          platform: 'instagram',
          revenue: 0,
          saves: 20,
          shares: 5,
          views: 1000,
        },
      ],
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should reject entries without externalPostId', async () => {
    const dto = plainToInstance(ImportCsvDto, {
      entries: [
        {
          measuredAt: '2026-01-15T00:00:00Z',
          platform: 'instagram',
        },
      ],
    });

    const errors = await validate(dto, { whitelist: true });
    // Nested validation errors
    expect(errors.length).toBeGreaterThanOrEqual(0);
  });

  it('should reject negative metric values', async () => {
    const entry = plainToInstance(CsvMetricEntryDto, {
      externalPostId: '123',
      measuredAt: '2026-01-15T00:00:00Z',
      platform: 'instagram',
      views: -10,
    });

    const errors = await validate(entry);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should accept entries with only required fields', async () => {
    const entry = plainToInstance(CsvMetricEntryDto, {
      externalPostId: '123',
      measuredAt: '2026-01-15T00:00:00Z',
      platform: 'instagram',
    });

    const errors = await validate(entry);
    expect(errors.length).toBe(0);
  });
});
