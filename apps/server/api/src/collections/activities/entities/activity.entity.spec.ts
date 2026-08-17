import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import { testId } from '@helpers/testing/test-id.helper';

describe('ActivityEntity', () => {
  it('should be defined', () => {
    const entity = new ActivityEntity({
      organization: testId('org'),
    });
    expect(entity).toBeDefined();
    expect(entity.organization).toBeDefined();
  });
});
