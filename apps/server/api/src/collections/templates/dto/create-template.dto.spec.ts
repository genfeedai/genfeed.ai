import { CreateTemplateDto } from '@api/collections/templates/dto/create-template.dto';

describe('CreateTemplateDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateTemplateDto();
      expect(dto).toBeInstanceOf(CreateTemplateDto);
    });
  });
});
