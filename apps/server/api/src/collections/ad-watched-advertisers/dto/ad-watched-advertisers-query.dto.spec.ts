import { AdWatchedAdvertisersQueryDto } from '@api/collections/ad-watched-advertisers/dto/ad-watched-advertisers-query.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('AdWatchedAdvertisersQueryDto', () => {
  it('does not expose organizationId as a client-selectable query field', async () => {
    const dto = plainToInstance(AdWatchedAdvertisersQueryDto, {
      advertiserHandle: 'nike',
      organizationId: 'other-org',
    });

    await validate(dto, { whitelist: true });

    expect(dto).toMatchObject({ advertiserHandle: 'nike' });
    expect(dto).not.toHaveProperty('organizationId');
  });
});
