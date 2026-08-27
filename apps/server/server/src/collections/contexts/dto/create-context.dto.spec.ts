import { CreateContextDto } from '@server/collections/contexts/dto/create-context.dto';

describe('CreateContextDto', () => {
  it('should be defined', () => {
    expect(CreateContextDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateContextDto();
      expect(dto).toBeInstanceOf(CreateContextDto);
    });
  });
});
