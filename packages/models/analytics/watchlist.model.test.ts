import { Watchlist } from '@models/analytics/watchlist.model';
import { describe, expect, it } from 'vitest';

describe('Watchlist', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new Watchlist({});
      expect(instance).toBeDefined();
    });
  });
});
