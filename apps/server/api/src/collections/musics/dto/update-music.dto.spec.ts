import { UpdateMusicDto } from '@api/collections/musics/dto/update-music.dto';

describe('UpdateMusicDto', () => {
  it('should be defined', () => {
    expect(UpdateMusicDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new UpdateMusicDto();
      expect(dto).toBeInstanceOf(UpdateMusicDto);
    });
  });
});
