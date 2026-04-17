import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';

describe('ActivityEntity', () => {
  it('should be defined', () => {
    const entity = new ActivityEntity({
      organization: '507f191e810c19729de860ee',
    });
    expect(entity).toBeDefined();
    expect(entity.organization).toBeDefined();
  });
});
