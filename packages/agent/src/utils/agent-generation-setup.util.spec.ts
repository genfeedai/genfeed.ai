import { describe, expect, it } from 'vitest';
import { buildDefaultAgentGenerationSetupValues } from './agent-generation-setup.util';

describe('buildDefaultAgentGenerationSetupValues', () => {
  it('accepts an explicit modelKey override', () => {
    const values = buildDefaultAgentGenerationSetupValues(
      'image',
      'flux-schnell',
    );

    expect(values.modelKey).toBe('flux-schnell');
  });
});
