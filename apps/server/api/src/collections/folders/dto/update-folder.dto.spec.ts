import { UpdateFolderDto } from '@api/collections/folders/dto/update-folder.dto';

describe('UpdateFolderDto', () => {
  it('should be defined', () => {
    expect(UpdateFolderDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateFolderDto();
      expect(dto).toBeInstanceOf(UpdateFolderDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateFolderDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
