import { DEFAULT_LOCALE } from '@helpers/ui/locale/locale.helper';
import { describe, expect, it } from 'vitest';

describe('static App Shell locale', () => {
  it('ships English without reading the request', () => {
    expect(DEFAULT_LOCALE).toBe('en');
  });
});
