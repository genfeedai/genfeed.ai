import {
  hasStoredPromptId,
  requireVideoPromptInput,
  resolveInlinePromptText,
  resolveStoredPromptText,
} from './video-generation-prompt.util';

describe('video prompt resolution', () => {
  it('requires either a prompt id or inline text', () => {
    expect(requireVideoPromptInput({})).toBe(false);
    expect(requireVideoPromptInput({ text: 'hello' })).toBe(true);
    expect(requireVideoPromptInput({ promptId: 'p1' })).toBe(true);
  });

  it('returns inline text only when no prompt id is supplied', () => {
    expect(resolveInlinePromptText(undefined, 'hello')).toBe('hello');
    expect(resolveInlinePromptText(undefined, undefined)).toBe('');
    expect(resolveInlinePromptText('p1', 'hello')).toBeUndefined();
  });

  it('prefers enhanced text and fails closed without an id', () => {
    expect(hasStoredPromptId(null)).toBe(false);
    expect(hasStoredPromptId({ id: '' })).toBe(false);
    expect(hasStoredPromptId({ id: 'p1' })).toBe(true);
    expect(
      resolveStoredPromptText({ enhanced: 'better', original: 'raw' }),
    ).toBe('better');
    expect(resolveStoredPromptText({ original: 'raw' })).toBe('raw');
    expect(resolveStoredPromptText({})).toBe('');
  });
});
