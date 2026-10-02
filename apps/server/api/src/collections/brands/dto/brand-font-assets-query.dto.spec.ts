import { BrandFontAssetsQueryDto } from '@api/collections/brands/dto/brand-font-assets-query.dto';
import { UploadBrandFontDto } from '@api/collections/brands/dto/upload-brand-font.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';

const pipe = new ValidationPipe();
describe('Font request DTO boundaries', () => {
  const query = { metatype: BrandFontAssetsQueryDto, type: 'query' as const };
  it('defaults limit and converts digit-only query strings', async () => {
    expect(await pipe.transform({}, query)).toMatchObject({ limit: 20 });
    expect(await pipe.transform({ limit: '50' }, query)).toMatchObject({
      limit: 50,
    });
  });
  it.each(['', '1.5', '1e1', 'NaN', null, [], 0, 51])(
    'rejects invalid limit %s',
    async (limit) => {
      await expect(pipe.transform({ limit }, query)).rejects.toThrow();
    },
  );
  it('rejects unknown query keys and invalid cursor type/bounds', async () => {
    for (const value of [
      { organizationId: 'foreign' },
      { cursor: null },
      { cursor: [] },
      { cursor: 'a'.repeat(2113) },
    ])
      await expect(pipe.transform(value, query)).rejects.toThrow();
  });
  it('normalizes displayName but rejects null/empty/noncanonical UUID and extra authority', async () => {
    const body = { metatype: UploadBrandFontDto, type: 'body' as const };
    const requestId = '1254ff7f-367d-4cda-af62-1c666a73fc8f';
    expect(
      await pipe.transform({ requestId, displayName: ' Acme ' }, body),
    ).toMatchObject({ displayName: 'Acme' });
    for (const value of [
      { requestId, displayName: null },
      { requestId, displayName: ' ' },
      { requestId: requestId.toUpperCase() },
      { requestId, category: 'FONT' },
    ])
      await expect(pipe.transform(value, body)).rejects.toThrow();
  });
});

it('enforces exact displayName UTF16 units through the actual DTO pipe', async () => {
  const metadata = { metatype: UploadBrandFontDto, type: 'body' as const };
  const requestId = '1254ff7f-367d-4cda-af62-1c666a73fc8f';
  await expect(
    pipe.transform({ requestId, displayName: '😀'.repeat(128) }, metadata),
  ).resolves.toMatchObject({ displayName: '😀'.repeat(128) });
  await expect(
    pipe.transform({ requestId, displayName: '😀'.repeat(129) }, metadata),
  ).rejects.toThrow();
});
