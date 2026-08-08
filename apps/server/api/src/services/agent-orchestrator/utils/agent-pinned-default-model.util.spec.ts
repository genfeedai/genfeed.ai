import { describe, expect, it } from 'vitest';

import { applyPinnedDefaultAgentModel } from './agent-pinned-default-model.util';

describe('applyPinnedDefaultAgentModel', () => {
  it('leaves an explicit client model untouched', () => {
    expect(
      applyPinnedDefaultAgentModel(
        { model: 'openai/gpt-5' },
        'anthropic/claude-sonnet',
      ),
    ).toEqual({ model: 'openai/gpt-5' });
  });

  it('applies a non-empty user pin when the client omits model', () => {
    expect(applyPinnedDefaultAgentModel({}, 'google/gemini-flash')).toEqual({
      model: 'google/gemini-flash',
    });
  });

  it('treats whitespace-only pin and model as Auto', () => {
    expect(applyPinnedDefaultAgentModel({ model: '  ' }, '  ')).toEqual({
      model: '  ',
    });
    expect(applyPinnedDefaultAgentModel({}, null)).toEqual({});
    expect(applyPinnedDefaultAgentModel({}, undefined)).toEqual({});
    expect(applyPinnedDefaultAgentModel({}, '')).toEqual({});
  });
});
