import { TrainingEntity } from '@api/collections/trainings/entities/training.entity';

describe('TrainingEntity', () => {
  it('should be defined', () => {
    expect(TrainingEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new TrainingEntity();
    expect(entity).toBeInstanceOf(TrainingEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new TrainingEntity();
  //     // Test properties
  //   });
  // });
});
