import {
  createTranslateFromCatalog,
  translateFromCatalog,
} from '@ui/tests/next-intl.stub';
import { describe, expect, it } from 'vitest';

describe('createTranslateFromCatalog', () => {
  const translate = createTranslateFromCatalog({
    example: {
      greeting: 'Hello, {name}',
      connections:
        '{count, plural, =0 {Not connected} one {# connected} other {# connected}}',
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

  it('prefers an exact `=N` clause over the keyword categories', () => {
    const translateExample = translate('example');

    expect(translateExample('connections', { count: 0 })).toBe('Not connected');
    expect(translateExample('connections', { count: 1 })).toBe('1 connected');
    expect(translateExample('connections', { count: 3 })).toBe('3 connected');
  });

  it('returns the full path when a message is missing or not a leaf', () => {
    const translateExample = translate('example');

    expect(translateExample('missing')).toBe('example.missing');
    expect(translateExample('')).toBe('example.');
  });

  it('returns one stable translator per namespace, like useTranslations', () => {
    expect(translate('example')).toBe(translate('example'));
    expect(translate('example')).not.toBe(translate('other'));
  });
});

describe('shared UI test catalogs', () => {
  it('keeps platform preview and generation setup catalogs available together', () => {
    expect(
      translateFromCatalog('ui.platformPreview')('platformLabel', {
        platform: 'X',
      }),
    ).toBe('X platform preview');
    expect(
      translateFromCatalog('agent.generationSetup')('configureSection', {
        section: 'Type',
      }),
    ).toBe('Configure Type');
    expect(
      translateFromCatalog('ui.generationHarness')('organizationLabel'),
    ).toBe('Organization prompt enhancement');
  });
});
