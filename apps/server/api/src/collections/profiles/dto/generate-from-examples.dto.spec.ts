import { GenerateFromExamplesDto } from '@api/collections/profiles/dto/generate-from-examples.dto';

describe('GenerateFromExamplesDto', () => {
  it('should be defined', () => {
    expect(GenerateFromExamplesDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new GenerateFromExamplesDto();
      expect(dto).toBeInstanceOf(GenerateFromExamplesDto);
    });
  });
});
