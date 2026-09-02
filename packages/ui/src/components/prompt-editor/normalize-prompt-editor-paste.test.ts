import { describe, expect, it } from 'vitest';
import { normalizePromptEditorPasteText } from './normalize-prompt-editor-paste';

describe('normalizePromptEditorPasteText', () => {
  it('collapses single newlines into spaces', () => {
    expect(normalizePromptEditorPasteText('this is\nthis is\nthis is')).toBe(
      'this is this is this is',
    );
  });

  it('keeps paragraph breaks', () => {
    expect(
      normalizePromptEditorPasteText('First paragraph.\n\nSecond paragraph.'),
    ).toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('treats whitespace-only blank lines as paragraph breaks', () => {
    expect(normalizePromptEditorPasteText('First\n \nSecond')).toBe(
      'First\n\nSecond',
    );
    expect(normalizePromptEditorPasteText('First\n\t\nSecond')).toBe(
      'First\n\nSecond',
    );
  });

  it('normalizes windows newlines and nbsp', () => {
    expect(normalizePromptEditorPasteText('hello\r\nworld\u00a0there')).toBe(
      'hello world there',
    );
  });
});
