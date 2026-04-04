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

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateMusicDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
