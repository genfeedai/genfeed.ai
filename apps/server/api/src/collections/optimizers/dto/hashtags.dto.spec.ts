import { SuggestHashtagsDto } from '@api/collections/optimizers/dto/hashtags.dto';

describe('SuggestHashtagsDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new SuggestHashtagsDto();
      expect(dto).toBeInstanceOf(SuggestHashtagsDto);
    });
  });
});
