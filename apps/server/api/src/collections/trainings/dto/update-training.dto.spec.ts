import { UpdateTrainingDto } from '@api/collections/trainings/dto/update-training.dto';

describe('UpdateTrainingDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateTrainingDto();
      expect(dto).toBeInstanceOf(UpdateTrainingDto);
    });
  });
});
