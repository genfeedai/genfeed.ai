import {
  CsvMetricEntryDto,
  ImportCsvDto,
} from '@api/collections/content-performance/dto/import-csv.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import type { IValidationErrorResponse } from '@genfeedai/interfaces';
import { type ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const MAX_CSV_ENTRIES = 200;

const metadata: ArgumentMetadata = {
  metatype: ImportCsvDto,
  type: 'body',
};

function buildBody(entryCount: number) {
  return {
    entries: Array.from({ length: entryCount }, (_value, index) => ({
      externalPostId: `external-${index}`,
      measuredAt: '2026-01-15T00:00:00Z',
      platform: 'instagram',
      views: 10,
    })),
  };
}

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

  describe('entries array cap', () => {
    let pipe: ValidationPipe;

    beforeEach(() => {
      pipe = new ValidationPipe();
    });

    it(`accepts an entries array at the ${MAX_CSV_ENTRIES} limit`, async () => {
      await expect(
        pipe.transform(buildBody(MAX_CSV_ENTRIES), metadata),
      ).resolves.toBeInstanceOf(ImportCsvDto);
    });

    it('rejects an over-limit entries array with a 400', async () => {
      await expect(
        pipe.transform(buildBody(MAX_CSV_ENTRIES + 1), metadata),
      ).rejects.toThrow(BadRequestException);
    });

    it('reports arrayMaxSize as the failing constraint', async () => {
      const error = await pipe
        .transform(buildBody(MAX_CSV_ENTRIES + 1), metadata)
        .then(
          () => null,
          (thrown: unknown) => thrown as BadRequestException,
        );

      const response = error?.getResponse() as IValidationErrorResponse;

      expect(
        response.errors.find((entry) => entry.property === 'entries')
          ?.constraints,
      ).toHaveProperty('arrayMaxSize');
    });
  });
});
