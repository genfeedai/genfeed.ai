import { UpdateTagDto } from '@api/collections/tags/dto/update-tag.dto';

describe('UpdateTagDto', () => {
  it('should be defined', () => {
    expect(UpdateTagDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateTagDto();
      expect(dto).toBeInstanceOf(UpdateTagDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateTagDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
