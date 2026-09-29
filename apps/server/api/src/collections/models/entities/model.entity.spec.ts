import { ModelEntity } from '@api/collections/models/entities/model.entity';

describe('ModelEntity', () => {
  it('should create an instance', () => {
    const entity = new ModelEntity();
    expect(entity).toBeInstanceOf(ModelEntity);
  });
});
