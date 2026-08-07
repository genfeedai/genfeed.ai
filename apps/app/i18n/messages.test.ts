import { DEFAULT_LOCALE, PSEUDO_LOCALE } from '@genfeedai/constants';
import { describe, expect, it } from 'vitest';
import { loadMessages } from './messages';
import { pseudoLocalizeMessage } from './pseudo';

describe('loadMessages', () => {
  it('serves the English catalog for the default locale', () => {
    expect(loadMessages(DEFAULT_LOCALE).common.actions.save).toBe('Save');
  });

  it('derives the pseudo-locale from the English catalog at load time', () => {
    expect(loadMessages(PSEUDO_LOCALE).common.actions.save).toBe(
      pseudoLocalizeMessage('Save'),
    );
  });

  it('keeps the pseudo-locale key-for-key identical to English', () => {
    const collectKeys = (
      messages: Record<string, unknown>,
      prefix = '',
    ): string[] =>
      Object.entries(messages).flatMap(([key, value]) =>
        typeof value === 'string'
          ? [`${prefix}${key}`]
          : collectKeys(value as Record<string, unknown>, `${prefix}${key}.`),
      );

    expect(collectKeys(loadMessages(PSEUDO_LOCALE))).toEqual(
      collectKeys(loadMessages(DEFAULT_LOCALE)),
    );
  });

  it('does not mutate the English catalog when building the pseudo-locale', () => {
    loadMessages(PSEUDO_LOCALE);

    expect(loadMessages(DEFAULT_LOCALE).common.actions.save).toBe('Save');
  });
});
