import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { Types } from 'mongoose';

describe('ActivityEntity', () => {
  it('should be defined', () => {
    const entity = new ActivityEntity({
      organization: new Types.ObjectId(),
    });
    expect(entity).toBeDefined();
    expect(entity.organization).toBeDefined();
  });
});
