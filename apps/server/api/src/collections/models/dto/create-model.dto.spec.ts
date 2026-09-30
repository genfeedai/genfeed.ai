import { CreateModelDto } from '@api/collections/models/dto/create-model.dto';

describe('CreateModelDto', () => {
  it('should be defined', () => {
    expect(CreateModelDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateModelDto();
      expect(dto).toBeInstanceOf(CreateModelDto);
    });
  });
});
