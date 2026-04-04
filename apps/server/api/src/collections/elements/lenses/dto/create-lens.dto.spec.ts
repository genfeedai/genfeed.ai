import { CreateElementLensDto } from '@api/collections/elements/lenses/dto/create-lens.dto';

describe('CreateElementLensDto', () => {
  it('should be defined', () => {
    expect(CreateElementLensDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateElementLensDto();
      expect(dto).toBeInstanceOf(CreateElementLensDto);
    });
  });
});
