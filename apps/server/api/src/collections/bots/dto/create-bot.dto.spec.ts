import { CreateBotDto } from '@api/collections/bots/dto/create-bot.dto';

describe('CreateBotDto', () => {
  it('should be defined', () => {
    expect(CreateBotDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new CreateBotDto();
      expect(dto).toBeInstanceOf(CreateBotDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new CreateBotDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
