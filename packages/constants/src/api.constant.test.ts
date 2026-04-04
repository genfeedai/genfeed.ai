import { describe, expect, it } from 'vitest';
import { API_ENDPOINTS } from './api.constant';

describe('api.constant', () => {
  it('exports API_ENDPOINTS as an object', () => {
    expect(API_ENDPOINTS).toBeDefined();
    expect(typeof API_ENDPOINTS).toBe('object');
  });

  it('all values are strings starting with /', () => {
    for (const [, value] of Object.entries(API_ENDPOINTS)) {
      expect(typeof value).toBe('string');
      expect(value.startsWith('/')).toBe(true);
    }
  });

  it('contains ACTIVITIES endpoint', () => {
    expect(API_ENDPOINTS.ACTIVITIES).toBe('/activities');
  });
});
