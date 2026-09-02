import { SuggestHashtagsDto } from '@api/collections/optimizers/dto/hashtags.dto';

describe('SuggestHashtagsDto', () => {
  it('should be defined', () => {
    expect(SuggestHashtagsDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new SuggestHashtagsDto();
      expect(dto).toBeInstanceOf(SuggestHashtagsDto);
    });
  });
});
