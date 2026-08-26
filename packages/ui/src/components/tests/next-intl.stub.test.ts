import { createTranslateFromCatalog } from '@ui/tests/next-intl.stub';
import { describe, expect, it } from 'vitest';

describe('createTranslateFromCatalog', () => {
  const translate = createTranslateFromCatalog({
    example: {
      greeting: 'Hello, {name}',
      items: '{count, plural, one {# item} other {# items}}',
    },
  });

  it('interpolates simple values and cardinal plurals', () => {
    const translateExample = translate('example');

    expect(translateExample('greeting', { name: 'Vincent' })).toBe(
      'Hello, Vincent',
    );
    expect(translateExample('items', { count: 1 })).toBe('1 item');
    expect(translateExample('items', { count: 2 })).toBe('2 items');
  });

  it('returns the full path when a message is missing or not a leaf', () => {
    const translateExample = translate('example');

    expect(translateExample('missing')).toBe('example.missing');
    expect(translateExample('')).toBe('example.');
  });
});
