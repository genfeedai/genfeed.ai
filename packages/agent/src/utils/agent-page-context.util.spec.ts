import { describe, expect, it } from 'vitest';
import { mergeComposerModeIntoPageContext } from './agent-page-context.util';

describe('mergeComposerModeIntoPageContext', () => {
  it('returns base context for chat mode', () => {
    const base = { route: '/agent', draftInstructions: 'Keep brand voice' };
    expect(mergeComposerModeIntoPageContext(base, 'chat', null)).toEqual(base);
  });

  it('injects contentFormat and mode instructions for image mode', () => {
    const merged = mergeComposerModeIntoPageContext(
      { route: '/agent', draftInstructions: 'Keep brand voice' },
      'image',
      'nano-banana',
    );

    expect(merged?.contentFormat).toBe('image');
    expect(merged?.draftInstructions).toContain('Keep brand voice');
    expect(merged?.draftInstructions).toContain(
      'Composer mode for this turn: Image',
    );
    expect(merged?.draftInstructions).toContain('nano-banana');
  });
});
