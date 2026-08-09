import { DEFAULT_LOCALE, PSEUDO_LOCALE } from '@genfeedai/constants';
import {
  ACTIVITY_MESSAGE_ID_BY_KEY,
  ActivityKey,
  getActivityMessageDescriptor,
} from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import { loadMessages, mergeMessagesWithEnglish } from './messages';
import { pseudoLocalizeMessage } from './pseudo';

function resolveMessageId(
  messages: Record<string, unknown>,
  id: string,
): unknown {
  return id.split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object') {
      return undefined;
    }
    return (value as Record<string, unknown>)[segment];
  }, messages);
}

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

  it('falls back to English for keys missing from a non-default locale', () => {
    const messages = mergeMessagesWithEnglish({
      common: {
        actions: {
          save: 'Localized save',
        },
      },
    });

    expect(messages.common.actions.save).toBe('Localized save');
    expect(messages.common.activity.post.ready).toBe(
      'Content is ready for review',
    );
  });

  it('covers every ActivityKey with a resolvable English message id', () => {
    const activityKeys = Object.values(ActivityKey).toSorted();
    const catalogKeys = Object.keys(ACTIVITY_MESSAGE_ID_BY_KEY).toSorted();
    const english = loadMessages(DEFAULT_LOCALE).common as Record<
      string,
      unknown
    >;

    expect(catalogKeys).toEqual(activityKeys);

    for (const key of activityKeys) {
      const descriptor = getActivityMessageDescriptor(key);
      expect(ACTIVITY_MESSAGE_ID_BY_KEY[key]).toBe(descriptor.id);
      expect(resolveMessageId(english, descriptor.id)).toEqual(
        expect.any(String),
      );
    }
  });
});
