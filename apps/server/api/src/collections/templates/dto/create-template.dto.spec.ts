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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateTemplateDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
