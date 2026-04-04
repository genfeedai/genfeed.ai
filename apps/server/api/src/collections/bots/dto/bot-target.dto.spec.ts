import { BotTargetDto } from '@api/collections/bots/dto/bot-target.dto';

describe('BotTargetDto', () => {
  it('should be defined', () => {
    expect(BotTargetDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new BotTargetDto();
      expect(dto).toBeInstanceOf(BotTargetDto);
    });

    // it('should validate successfully with valid data', async () => {
    //   const dto = new BotTargetDto();
    //   // Add test data
    //   const errors = await validate(dto);
    //   expect(errors.length).toBe(0);
    // });
  });
});
