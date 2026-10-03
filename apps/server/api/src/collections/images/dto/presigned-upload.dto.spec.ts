import { PresignedUploadDto } from '@api/collections/images/dto/presigned-upload.dto';
import { IngredientCategory } from '@genfeedai/contracts';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const errorsFor = async (plain: Record<string, unknown>) =>
  (await validate(plainToInstance(PresignedUploadDto, plain))).map(
    (error) => error.property,
  );

describe('PresignedUploadDto', () => {
  const valid = {
    category: 'image',
    contentType: 'image/png',
    filename: 'a.png',
    sizeBytes: 100,
  };

  it('accepts a valid body and upper-cases the category', async () => {
    expect(await errorsFor(valid)).toEqual([]);
    expect(plainToInstance(PresignedUploadDto, valid).category).toBe(
      IngredientCategory.IMAGE,
    );
  });

  it('keeps the category optional', async () => {
    const { category: _category, ...rest } = valid;
    expect(await errorsFor(rest)).toEqual([]);
  });

  it.each([
    ['sizeBytes', { sizeBytes: undefined }],
    ['sizeBytes', { sizeBytes: 0 }],
    ['sizeBytes', { sizeBytes: 1.5 }],
    ['sizeBytes', { sizeBytes: '10' }],
    ['contentType', { contentType: '' }],
    ['filename', { filename: undefined }],
    ['category', { category: 'rocket' }],
  ])('rejects an invalid %s', async (property, override) => {
    expect(await errorsFor({ ...valid, ...override })).toContain(property);
  });
});
