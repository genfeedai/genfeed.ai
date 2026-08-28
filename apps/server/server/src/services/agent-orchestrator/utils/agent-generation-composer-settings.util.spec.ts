import { describe, expect, it } from 'vitest';
import { extractAgentGenerationSettings } from './agent-generation-composer-settings.util';

describe('extractAgentGenerationSettings', () => {
  it('extracts and normalizes composer-owned media settings', () => {
    expect(
      extractAgentGenerationSettings(
        'Keep the subject centered.\nUse these operator-selected generation settings exactly: {"aspectRatio":"9:16","duration":5,"model":"replicate/veo","outputs":12}',
      ),
    ).toEqual({
      aspectRatio: '9:16',
      duration: 5,
      model: 'replicate/veo',
      outputs: 8,
    });
  });

  it('ignores malformed or incomplete settings', () => {
    expect(
      extractAgentGenerationSettings(
        'Use these operator-selected generation settings exactly: nope',
      ),
    ).toBeUndefined();
    expect(
      extractAgentGenerationSettings(
        'Use these operator-selected generation settings exactly: {"outputs":2}',
      ),
    ).toBeUndefined();
  });
});
