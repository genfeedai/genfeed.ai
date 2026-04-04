import * as DataHelper from '@helpers/data/data/data.helper';
import { describe, expect, it } from 'vitest';

describe('DataHelper', () => {
  it('should export status array correctly', () => {
    expect(DataHelper.status).toBeDefined();
    expect(Array.isArray(DataHelper.status)).toBe(true);
    expect(DataHelper.status.length).toBeGreaterThan(0);
  });

  it('should export formatVideos array correctly', () => {
    expect(DataHelper.formatVideos).toBeDefined();
    expect(Array.isArray(DataHelper.formatVideos)).toBe(true);
    expect(DataHelper.formatVideos.length).toBeGreaterThan(0);
  });

  it('should have format videos with required properties', () => {
    const format = DataHelper.formatVideos[0];
    expect(format).toHaveProperty('id');
    expect(format).toHaveProperty('label');
    expect(format).toHaveProperty('width');
    expect(format).toHaveProperty('height');
  });
});
