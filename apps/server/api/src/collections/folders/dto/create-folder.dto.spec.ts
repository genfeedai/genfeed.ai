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
  });
});
