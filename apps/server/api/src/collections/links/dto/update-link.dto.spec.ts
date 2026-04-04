import { UpdateLinkDto } from '@api/collections/links/dto/update-link.dto';

describe('UpdateLinkDto', () => {
  it('should be defined', () => {
    expect(UpdateLinkDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateLinkDto();
      expect(dto).toBeInstanceOf(UpdateLinkDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateLinkDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
