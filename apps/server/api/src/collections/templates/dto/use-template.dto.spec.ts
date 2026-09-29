import { UseTemplateDto } from '@api/collections/templates/dto/use-template.dto';

describe('UseTemplateDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UseTemplateDto();
      expect(dto).toBeInstanceOf(UseTemplateDto);
    });
  });
});
