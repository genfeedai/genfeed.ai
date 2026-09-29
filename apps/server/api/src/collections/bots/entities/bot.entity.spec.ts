import { BotEntity } from '@api/collections/bots/entities/bot.entity';

describe('BotEntity', () => {
  it('should create an instance', () => {
    const entity = new BotEntity();
    expect(entity).toBeInstanceOf(BotEntity);
  });
});
