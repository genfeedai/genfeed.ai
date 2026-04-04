import { SuggestTemplatesDto } from '@api/collections/templates/dto/suggest-templates.dto';

describe('SuggestTemplatesDto', () => {
  it('should be defined', () => {
    expect(SuggestTemplatesDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new SuggestTemplatesDto();
      expect(dto).toBeInstanceOf(SuggestTemplatesDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new SuggestTemplatesDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
