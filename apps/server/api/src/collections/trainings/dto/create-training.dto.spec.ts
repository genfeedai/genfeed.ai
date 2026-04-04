import { CreateTrainingDto } from '@api/collections/trainings/dto/create-training.dto';

describe('CreateTrainingDto', () => {
  it('should be defined', () => {
    expect(CreateTrainingDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateTrainingDto();
      expect(dto).toBeInstanceOf(CreateTrainingDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateTrainingDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
