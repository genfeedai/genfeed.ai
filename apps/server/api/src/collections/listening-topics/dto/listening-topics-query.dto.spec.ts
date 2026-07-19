import { ListeningTopicsQueryDto } from '@api/collections/listening-topics/dto/listening-topics-query.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('ListeningTopicsQueryDto', () => {
  it.each([
    ['true', true],
    ['false', false],
    [true, true],
    [false, false],
  ])('normalizes the explicit isActive value %j', async (value, expected) => {
    const dto = plainToInstance(ListeningTopicsQueryDto, { isActive: value });

    expect(dto.isActive).toBe(expected);
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('preserves invalid isActive strings for boolean validation', async () => {
    const dto = plainToInstance(ListeningTopicsQueryDto, {
      isActive: 'invalid',
    });

    const errors = await validate(dto);

    expect(dto.isActive).toBe('invalid');
    expect(errors[0]?.constraints).toHaveProperty('isBoolean');
  });
});
