import { MusicEntity } from '@api/collections/musics/entities/music.entity';

describe('MusicEntity', () => {
  it('should create an instance', () => {
    const entity = new MusicEntity();
    expect(entity).toBeInstanceOf(MusicEntity);
  });
});
