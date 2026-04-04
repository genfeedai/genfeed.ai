import { ActivitySchema } from '@api/collections/activities/schemas/activity.schema';

describe('ActivitySchema', () => {
  it('should be defined', () => {
    expect(ActivitySchema).toBeDefined();
  });

  it('should have required fields', () => {
    const schema = ActivitySchema.obj;
    expect(schema.user).toBeDefined();
    expect(schema.organization).toBeDefined();
    expect(schema.brand).toBeDefined();
    expect(schema.key).toBeDefined();
    expect(schema.value).toBeDefined();
    expect(schema.source).toBeDefined();
    expect(schema.isRead).toBeDefined();
    expect(schema.isDeleted).toBeDefined();
  });
});
