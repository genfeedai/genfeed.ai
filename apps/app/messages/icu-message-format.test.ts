import { parse } from '@formatjs/icu-messageformat-parser';
import {
  ActivityKey,
  getCreditActivityChangeDescriptor,
  getCreditActivityMessageDescriptor,
} from '@genfeedai/contracts';
import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import agent from './en/agent.json';
import common from './en/common.json';
import pages from './en/pages.json';
import ui from './en/ui.json';

function collectLeaves(
  value: unknown,
  path: string,
): Array<{ path: string; value: string }> {
  if (typeof value === 'string') {
    return [{ path, value }];
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    collectLeaves(child, path ? `${path}.${key}` : key),
  );
}

describe('ICU message catalogs', () => {
  it('parses every message in apps/app/messages/* without a FormatJS error', () => {
    const catalogs: Array<[string, unknown]> = [
      ['agent', agent],
      ['common', common],
      ['pages', pages],
      ['ui', ui],
    ];

    const failures = catalogs.flatMap(([catalogName, catalog]) =>
      collectLeaves(catalog, catalogName)
        .map(({ path, value }) => {
          try {
            parse(value);
            return null;
          } catch (error) {
            return `${path}: ${(error as Error).message}`;
          }
        })
        .filter((failure): failure is string => failure !== null),
    );

    expect(failures).toEqual([]);
  });

  it('keeps the byok-usage credit category as an ICU-safe selector', () => {
    expect(common.activity.credits.remove).toContain('byok_usage');
    expect(common.activity.credits.change).toContain('byok_usage');
    expect(common.activity.credits.remove).not.toMatch(/\bbyok-usage\b/);
    expect(common.activity.credits.change).not.toMatch(/\bbyok-usage\b/);
  });
});

describe('BYOK usage credit activity rendering', () => {
  // Exercises the real next-intl/FormatJS pipeline (not the JS fallback in
  // formatActivityMessage, and not the simplified next-intl.stub used by
  // component tests) so a reintroduced hyphenated selector fails loudly here.
  const translate = createTranslator({
    locale: 'en',
    messages: { common },
    namespace: 'common',
  });

  it('shows the BYOK-specific text for activity.credits.remove', () => {
    const value = JSON.stringify({
      category: 'byok-usage',
      description: '[BYOK] Image generation',
      value: 1,
    });
    const descriptor = getCreditActivityMessageDescriptor(
      ActivityKey.CREDITS_REMOVE,
      value,
      'system',
    );

    expect(translate(descriptor.id, descriptor.params)).toBe(
      'Image generation (your API key)',
    );
  });

  it('shows "No credits charged" for activity.credits.change', () => {
    const value = JSON.stringify({
      category: 'byok-usage',
      description: '[BYOK] Image generation',
      value: 1,
    });
    const descriptor = getCreditActivityChangeDescriptor(
      ActivityKey.CREDITS_REMOVE,
      value,
    );
    if (!descriptor) throw new Error('Missing credit amount descriptor');

    expect(translate(descriptor.id, descriptor.params)).toBe(
      'No credits charged',
    );
  });

  it('still formats non-BYOK categories through the same selector', () => {
    const value = JSON.stringify({
      category: 'expire',
      description: 'Promotional grant expired',
      value: 5,
    });
    const descriptor = getCreditActivityMessageDescriptor(
      ActivityKey.CREDITS_REMOVE,
      value,
      'system',
    );

    expect(translate(descriptor.id, descriptor.params)).toBe(
      'Credits expired: Promotional grant expired',
    );
  });
});
