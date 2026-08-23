import { XAdWatchedAdvertisersQueryDto } from '@api/collections/x-ad-watched-advertisers/dto/x-ad-watched-advertisers-query.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('XAdWatchedAdvertisersQueryDto', () => {
  it('does not expose organizationId as a client-selectable query field', async () => {
    const dto = plainToInstance(XAdWatchedAdvertisersQueryDto, {
      advertiserHandle: 'nike',
      organizationId: 'other-org',
    });

    await validate(dto, { whitelist: true });

    expect(dto).toMatchObject({ advertiserHandle: 'nike' });
    expect(dto).not.toHaveProperty('organizationId');
  });
});
