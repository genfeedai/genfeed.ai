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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new UpdateMusicDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
