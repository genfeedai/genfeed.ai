import { TrainingEntity } from '@api/collections/trainings/entities/training.entity';

describe('TrainingEntity', () => {
  it('should create an instance', () => {
    const entity = new TrainingEntity();
    expect(entity).toBeInstanceOf(TrainingEntity);
  });
});
