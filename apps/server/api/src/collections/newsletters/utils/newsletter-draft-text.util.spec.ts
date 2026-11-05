import {
  parseJsonArray,
  resolveDraftTitle,
} from '@api/collections/newsletters/utils/newsletter-draft-text.util';
import { describe, expect, it } from 'vitest';

describe('parseJsonArray', () => {
  it.each([
    ['Here you go: [{"title":"A"}] thanks', [{ title: 'A' }]],
    ['[1,2]', [1, 2]],
    ['{"title":"A"}', []],
  ])('%s', (value, expected) => {
    expect(parseJsonArray(value)).toEqual(expected);
  });
});

describe('resolveDraftTitle', () => {
  it.each([
    ['# Weekly wins\nBody', 'Weekly wins'],
    ['Plain first line\nBody', 'Plain first line'],
    ['\nBody', 'Fallback topic'],
  ])('%s', (draft, expected) => {
    expect(resolveDraftTitle('Fallback topic', draft)).toBe(expected);
  });
});
