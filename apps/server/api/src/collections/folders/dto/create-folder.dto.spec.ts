import { CreateFolderDto } from '@api/collections/folders/dto/create-folder.dto';

describe('CreateFolderDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateFolderDto();
      expect(dto).toBeInstanceOf(CreateFolderDto);
    });
  });
});
