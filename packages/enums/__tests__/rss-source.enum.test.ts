import { describe, expect, it } from 'vitest';
import {
  parseRssApprovalMode,
  parseRssImportPolicy,
  RssApprovalMode,
  RssImportPolicy,
} from '../src/rss-source.enum';

describe('RSS source enum parsers', () => {
  it.each(Object.values(RssApprovalMode))(
    'preserves the known approval mode %s',
    (mode) => {
      expect(parseRssApprovalMode(mode)).toBe(mode);
    },
  );

  it.each(Object.values(RssImportPolicy))(
    'preserves the known import policy %s',
    (policy) => {
      expect(parseRssImportPolicy(policy)).toBe(policy);
    },
  );

  it.each([undefined, null, '', 'UNKNOWN'])(
    'keeps the established defaults for invalid value %s',
    (value) => {
      expect(parseRssApprovalMode(value)).toBe(RssApprovalMode.APPROVAL);
      expect(parseRssImportPolicy(value)).toBe(RssImportPolicy.DRAFT);
    },
  );
});
