import { FolderEntity } from '@api/collections/folders/entities/folder.entity';

describe('FolderEntity', () => {
  it('should create an instance', () => {
    const entity = new FolderEntity();
    expect(entity).toBeInstanceOf(FolderEntity);
  });
});
