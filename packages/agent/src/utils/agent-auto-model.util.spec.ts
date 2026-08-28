import { AUTO_MODEL_OPTION_VALUE } from '@ui/dropdowns/model-selector/model-selector.constants';
import { describe, expect, it } from 'vitest';
import {
  isAutoAgentModel,
  resolveAgentModelForBalance,
  toRuntimeAgentModel,
} from './agent-auto-model.util';

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

  it('routes zero-balance Auto through the selectable free model', () => {
    expect(
      resolveAgentModelForBalance(AUTO_MODEL_OPTION_VALUE, 0, [
        'openrouter/free',
        'openai/gpt-5.4',
      ]),
    ).toBe('openrouter/free');
    expect(resolveAgentModelForBalance('', 0, ['openrouter/free'])).toBe(
      'openrouter/free',
    );
    expect(resolveAgentModelForBalance(undefined, 0, ['openrouter/free'])).toBe(
      'openrouter/free',
    );
  });

  it('does not replace explicit or unavailable model picks', () => {
    expect(
      resolveAgentModelForBalance('openai/gpt-5.4', 0, ['openrouter/free']),
    ).toBe('openai/gpt-5.4');
    expect(
      resolveAgentModelForBalance(AUTO_MODEL_OPTION_VALUE, 0, [
        'openai/gpt-5.4',
      ]),
    ).toBe(AUTO_MODEL_OPTION_VALUE);
    expect(
      resolveAgentModelForBalance(AUTO_MODEL_OPTION_VALUE, 1, [
        'openrouter/free',
      ]),
    ).toBe(AUTO_MODEL_OPTION_VALUE);
  });
});
