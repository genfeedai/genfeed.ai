import { ModelsQueryDto } from '@api/collections/models/dto/models-query.dto';

describe('ModelsQueryDto', () => {
  it('should be defined', () => {
    expect(ModelsQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new ModelsQueryDto();
      expect(dto).toBeInstanceOf(ModelsQueryDto);
    });
  });
});
