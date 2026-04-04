import { CreateFolderDto } from '@api/collections/folders/dto/create-folder.dto';

describe('CreateFolderDto', () => {
  it('should be defined', () => {
    expect(CreateFolderDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateFolderDto();
      expect(dto).toBeInstanceOf(CreateFolderDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateFolderDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
