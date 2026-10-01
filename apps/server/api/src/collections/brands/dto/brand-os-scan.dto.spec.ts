import { BrandOsScanDto } from '@api/collections/brands/dto/brand-os-scan.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { BadRequestException } from '@nestjs/common';

const pipe = new ValidationPipe();
const valid = {
  url: 'https://acme.example',
  requestId: '1254ff7f-367d-4cda-af62-1c666a73fc8f',
};
const metadata = { metatype: BrandOsScanDto, type: 'body' as const };
describe('BrandOsScanDto through global ValidationPipe', () => {
  it('accepts only the frozen URL and UUID inputs', async () => {
    expect(await pipe.transform(valid, metadata)).toEqual(valid);
  });
  it.each([
    { url: '' },
    { url: 42 },
    { url: 'x'.repeat(2049) },
    { requestId: 'not-uuid' },
  ])('rejects invalid input %j', async (invalid) => {
    await expect(
      pipe.transform({ ...valid, ...invalid }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each([
    'organizationId',
    'generationRules',
    'assets',
    'availability',
    'approval',
    'status',
  ])('rejects injected %s instead of stripping it', async (key) => {
    await expect(
      pipe.transform({ ...valid, [key]: 'injected' }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
