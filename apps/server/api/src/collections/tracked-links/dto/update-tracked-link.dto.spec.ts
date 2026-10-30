import { UpdateTrackedLinkDto } from '@api/collections/tracked-links/dto/update-tracked-link.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('UpdateTrackedLinkDto', () => {
  it('accepts each mutable field', async () => {
    const dto = plainToInstance(UpdateTrackedLinkDto, {
      isActive: false,
      originalUrl: 'https://example.com/landing',
      title: 'Launch',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('accepts an empty body', async () => {
    await expect(
      validate(plainToInstance(UpdateTrackedLinkDto, {})),
    ).resolves.toHaveLength(0);
  });

  it.each([
    { isActive: 'false' },
    { isActive: 1 },
    { originalUrl: 42 },
    { originalUrl: '' },
    { title: { nested: true } },
  ])('rejects a malformed body %j', async (body) => {
    const dto = plainToInstance(UpdateTrackedLinkDto, body);

    expect(await validate(dto)).not.toHaveLength(0);
  });
});
