import { UpdateModelDto } from '@api/collections/models/dto/update-model.dto';

describe('UpdateModelDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateModelDto();
      expect(dto).toBeInstanceOf(UpdateModelDto);
    });
  });
});
