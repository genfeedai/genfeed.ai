import { ActivitiesQueryDto } from '@api/collections/activities/dto/activities-query.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('ActivitiesQueryDto', () => {
  it('parses explicit active-only query booleans and rejects invalid values', async () => {
    expect(
      plainToInstance(ActivitiesQueryDto, { activeOnly: 'true' }).activeOnly,
    ).toBe(true);
    expect(
      plainToInstance(ActivitiesQueryDto, { activeOnly: 'false' }).activeOnly,
    ).toBe(false);
    const errors = await validate(
      plainToInstance(ActivitiesQueryDto, { activeOnly: 'sometimes' }),
    );
    expect(errors.some((error) => error.property === 'activeOnly')).toBe(true);
  });
  it('should be defined', () => {
    expect(ActivitiesQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new ActivitiesQueryDto();
      expect(dto).toBeInstanceOf(ActivitiesQueryDto);
    });
  });
});
