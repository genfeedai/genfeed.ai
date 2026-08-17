import { UpdateContextDto } from '@api/collections/contexts/dto/update-context.dto';

describe('UpdateContextDto', () => {
  it('should be defined', () => {
    expect(UpdateContextDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateContextDto();
      expect(dto).toBeInstanceOf(UpdateContextDto);
    });
  });
});
