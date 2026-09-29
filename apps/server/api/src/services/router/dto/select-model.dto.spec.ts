import { SelectModelDto } from '@api/services/router/dto/select-model.dto';

describe('SelectModelDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new SelectModelDto();
      expect(dto).toBeInstanceOf(SelectModelDto);
    });
  });
});
