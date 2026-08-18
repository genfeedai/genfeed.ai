import { CreateTemplateDto } from '@api/collections/templates/dto/create-template.dto';

describe('CreateTemplateDto', () => {
  it('should be defined', () => {
    expect(CreateTemplateDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateTemplateDto();
      expect(dto).toBeInstanceOf(CreateTemplateDto);
    });
  });
});
