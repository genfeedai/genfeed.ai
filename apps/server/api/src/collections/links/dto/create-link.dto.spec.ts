import { CreateLinkDto } from '@api/collections/links/dto/create-link.dto';

describe('CreateLinkDto', () => {
  it('should be defined', () => {
    expect(CreateLinkDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateLinkDto();
      expect(dto).toBeInstanceOf(CreateLinkDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateLinkDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
