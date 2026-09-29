import { SuggestTemplatesDto } from '@api/collections/templates/dto/suggest-templates.dto';

describe('SuggestTemplatesDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new SuggestTemplatesDto();
      expect(dto).toBeInstanceOf(SuggestTemplatesDto);
    });
  });
});
