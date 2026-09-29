import { GenerateTrendIdeasDto } from '@api/collections/trends/dto/trend-ideas.dto';

describe('GenerateTrendIdeasDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new GenerateTrendIdeasDto();
      expect(dto).toBeInstanceOf(GenerateTrendIdeasDto);
    });
  });
});
