import { UpdateTemplateDto } from '@api/collections/templates/dto/update-template.dto';

describe('UpdateTemplateDto', () => {
  it('should be defined', () => {
    expect(UpdateTemplateDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateTemplateDto();
      expect(dto).toBeInstanceOf(UpdateTemplateDto);
    });
  });
});
