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
  });
});
