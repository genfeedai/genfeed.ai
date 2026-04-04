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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateTemplateDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
