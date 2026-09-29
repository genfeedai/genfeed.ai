import { CreateModelDto } from '@api/collections/models/dto/create-model.dto';

describe('CreateModelDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateModelDto();
      expect(dto).toBeInstanceOf(CreateModelDto);
    });
  });
});
