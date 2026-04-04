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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UseTemplateDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
