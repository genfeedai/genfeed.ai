import { ActivitiesQueryDto } from '@api/collections/activities/dto/activities-query.dto';

describe('ActivitiesQueryDto', () => {
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
