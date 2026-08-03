import { ModelCategory } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import {
  buildComposerModeInstruction,
  getComposerModeDefinition,
  isGenerationComposerMode,
} from './composer-mode.constant';

describe('composer-mode.constant', () => {
  it('maps generation modes to model categories', () => {
    expect(getComposerModeDefinition('image').modelCategory).toBe(
      ModelCategory.IMAGE,
    );
    expect(getComposerModeDefinition('video').modelCategory).toBe(
      ModelCategory.VIDEO,
    );
    expect(getComposerModeDefinition('voice').modelCategory).toBe(
      ModelCategory.VOICE,
    );
    expect(getComposerModeDefinition('chat').modelCategory).toBeNull();
  });

  it('detects generation modes', () => {
    expect(isGenerationComposerMode('chat')).toBe(false);
    expect(isGenerationComposerMode('image')).toBe(true);
  });

  it('builds mode instructions only for generation modes', () => {
    expect(buildComposerModeInstruction('chat', null)).toBeNull();
    expect(buildComposerModeInstruction('image', null)).toContain(
      'Composer mode for this turn: Image',
    );
    expect(
      buildComposerModeInstruction('video', 'replicate/google/veo-3'),
    ).toContain('replicate/google/veo-3');
  });
});
