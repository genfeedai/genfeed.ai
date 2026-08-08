import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import { describe, expect, it } from 'vitest';
import { isAutoAgentModel, toRuntimeAgentModel } from './agent-auto-model.util';

describe('agent-auto-model.util', () => {
  it('treats only the explicit Auto sentinel as Auto', () => {
    expect(isAutoAgentModel(AUTO_MODEL_OPTION_VALUE)).toBe(true);
    expect(isAutoAgentModel('')).toBe(false);
    expect(isAutoAgentModel(null)).toBe(false);
    expect(isAutoAgentModel('openai/gpt-5.4')).toBe(false);
  });

  it('omits model on the wire when Auto is selected', () => {
    expect(toRuntimeAgentModel(AUTO_MODEL_OPTION_VALUE)).toBe('');
    expect(toRuntimeAgentModel('openai/gpt-5.4')).toBe('openai/gpt-5.4');
  });
});
