import { FolderEntity } from '@api/collections/folders/entities/folder.entity';

describe('FolderEntity', () => {
  it('should be defined', () => {
    expect(FolderEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new FolderEntity();
    expect(entity).toBeInstanceOf(FolderEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new FolderEntity();
  //     // Test properties
  //   });
  // });
});
