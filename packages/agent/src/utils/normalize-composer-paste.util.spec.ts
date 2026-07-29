import { describe, expect, it } from 'vitest';
import { normalizeComposerPasteText } from './normalize-composer-paste.util';

describe('normalizeComposerPasteText', () => {
  it('collapses single newlines into spaces', () => {
    expect(normalizeComposerPasteText('this is\nthis is\nthis is')).toBe(
      'this is this is this is',
    );
  });

  it('keeps paragraph breaks', () => {
    expect(
      normalizeComposerPasteText('First paragraph.\n\nSecond paragraph.'),
    ).toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('normalizes windows newlines and nbsp', () => {
    expect(normalizeComposerPasteText('hello\r\nworld\u00a0there')).toBe(
      'hello world there',
    );
  });
});
