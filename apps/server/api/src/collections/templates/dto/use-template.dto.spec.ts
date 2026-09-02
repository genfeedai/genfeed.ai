import { UseTemplateDto } from '@api/collections/templates/dto/use-template.dto';

describe('UseTemplateDto', () => {
  it('should be defined', () => {
    expect(UseTemplateDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UseTemplateDto();
      expect(dto).toBeInstanceOf(UseTemplateDto);
    });
  });
});
