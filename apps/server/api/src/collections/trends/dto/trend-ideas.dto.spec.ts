import { GenerateTrendIdeasDto } from '@api/collections/trends/dto/trend-ideas.dto';

describe('GenerateTrendIdeasDto', () => {
  it('should be defined', () => {
    expect(GenerateTrendIdeasDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new GenerateTrendIdeasDto();
      expect(dto).toBeInstanceOf(GenerateTrendIdeasDto);
    });
  });
});
