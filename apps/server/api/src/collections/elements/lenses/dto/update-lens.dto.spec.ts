import { UpdateElementLensDto } from '@api/collections/elements/lenses/dto/update-lens.dto';

describe('UpdateElementLensDto', () => {
  it('should be defined', () => {
    expect(UpdateElementLensDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateElementLensDto();
      expect(dto).toBeInstanceOf(UpdateElementLensDto);
    });
  });
});
