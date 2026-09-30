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
  });
});
