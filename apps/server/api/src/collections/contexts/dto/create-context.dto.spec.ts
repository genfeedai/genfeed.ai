import { CreateContextDto } from '@api/collections/contexts/dto/create-context.dto';

describe('CreateContextDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateContextDto();
      expect(dto).toBeInstanceOf(CreateContextDto);
    });
  });
});
