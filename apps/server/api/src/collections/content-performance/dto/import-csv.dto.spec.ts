import {
  CsvMetricEntryDto,
  ImportCsvDto,
} from '@api/collections/content-performance/dto/import-csv.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import type { IValidationErrorResponse } from '@genfeedai/contracts/interfaces';
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
