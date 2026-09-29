import { CreateMusicDto } from '@api/collections/musics/dto/create-music.dto';

describe('CreateMusicDto', () => {
  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateMusicDto();
      expect(dto).toBeInstanceOf(CreateMusicDto);
    });
  });
});
