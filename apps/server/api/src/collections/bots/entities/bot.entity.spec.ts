import { BotEntity } from '@api/collections/bots/entities/bot.entity';

describe('BotEntity', () => {
  it('should be defined', () => {
    expect(BotEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new BotEntity();
    expect(entity).toBeInstanceOf(BotEntity);
  });
});
