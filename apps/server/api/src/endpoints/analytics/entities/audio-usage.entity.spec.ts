import { AudioUsageEntity } from '@api/endpoints/analytics/entities/audio-usage.entity';

describe('AudioUsageEntity', () => {
  it('should be defined', () => {
    expect(new AudioUsageEntity({})).toBeDefined();
  });
});
