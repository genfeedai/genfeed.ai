import { CreateElementLensDto } from '@api/collections/elements/lenses/dto/create-lens.dto';

describe('CreateElementLensDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateElementLensDto();
      expect(dto).toBeInstanceOf(CreateElementLensDto);
    });
  });
});
