import { ElementBlacklistEntity } from '@api/collections/elements/blacklists/entities/blacklist.entity';

describe('ElementBlacklistEntity', () => {
  it('should be defined', () => {
    expect(ElementBlacklistEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new ElementBlacklistEntity();
    expect(entity).toBeInstanceOf(ElementBlacklistEntity);
  });
});
