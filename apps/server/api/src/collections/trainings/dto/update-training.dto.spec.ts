import { UpdateTrainingDto } from '@api/collections/trainings/dto/update-training.dto';

describe('UpdateTrainingDto', () => {
  it('should be defined', () => {
    expect(UpdateTrainingDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateTrainingDto();
      expect(dto).toBeInstanceOf(UpdateTrainingDto);
    });
  });
});
