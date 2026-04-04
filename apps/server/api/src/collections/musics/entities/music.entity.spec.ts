import { MusicEntity } from '@api/collections/musics/entities/music.entity';

describe('MusicEntity', () => {
  it('should be defined', () => {
    expect(MusicEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new MusicEntity();
    expect(entity).toBeInstanceOf(MusicEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new MusicEntity();
  //     // Test properties
  //   });
  // });
});
