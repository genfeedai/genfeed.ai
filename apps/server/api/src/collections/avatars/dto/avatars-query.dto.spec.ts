import { AvatarsQueryDto } from '@api/collections/avatars/dto/avatars-query.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('AvatarsQueryDto', () => {
  it('accepts repeated origins keys and normalizes their case', async () => {
    const dto = plainToInstance(AvatarsQueryDto, {
      origins: ['uploaded', 'GENERATED'],
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto.origins).toEqual(['UPLOADED', 'GENERATED']);
  });

  it('rejects an unknown origin', async () => {
    const dto = plainToInstance(AvatarsQueryDto, { origins: ['mine'] });

    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});
