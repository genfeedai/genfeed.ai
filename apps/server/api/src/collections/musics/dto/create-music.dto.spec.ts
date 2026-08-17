import { CreateMusicDto } from '@api/collections/musics/dto/create-music.dto';

describe('CreateMusicDto', () => {
  it('should be defined', () => {
    expect(CreateMusicDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateMusicDto();
      expect(dto).toBeInstanceOf(CreateMusicDto);
    });
  });
});
