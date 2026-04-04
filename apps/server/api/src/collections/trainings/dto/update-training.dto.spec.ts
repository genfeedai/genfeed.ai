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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateTrainingDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
