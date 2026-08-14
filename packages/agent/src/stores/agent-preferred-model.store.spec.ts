import { RouterPriority } from '@genfeedai/enums';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearPreferredAgentChatModel,
  clearPreferredGenerationPrefs,
  readPreferredAgentChatModel,
  readPreferredAgentChatPriority,
  readPreferredGenerationModel,
  readPreferredGenerationOutputs,
  readPreferredGenerationPriority,
  writePreferredAgentChatModel,
  writePreferredAgentChatPriority,
  writePreferredGenerationModel,
  writePreferredGenerationOutputs,
  writePreferredGenerationPriority,
} from './agent-preferred-model.store';

describe('agent-preferred-model.store', () => {
  beforeEach(() => {
    clearPreferredAgentChatModel();
    clearPreferredGenerationPrefs();
  });

  afterEach(() => {
    clearPreferredAgentChatModel();
    clearPreferredGenerationPrefs();
  });

  it('returns null when nothing is stored', () => {
    expect(readPreferredAgentChatModel()).toBeNull();
    expect(readPreferredAgentChatPriority()).toBeNull();
    expect(readPreferredGenerationModel()).toBeNull();
    expect(readPreferredGenerationPriority()).toBeNull();
    expect(readPreferredGenerationOutputs()).toBeNull();
  });

  it('persists and reads the preferred chat model', () => {
    writePreferredAgentChatModel('openai/gpt-5.6-terra');
    expect(readPreferredAgentChatModel()).toBe('openai/gpt-5.6-terra');
  });

  it('ignores blank writes', () => {
    writePreferredAgentChatModel('openai/gpt-5.6-terra');
    writePreferredAgentChatModel('   ');
    expect(readPreferredAgentChatModel()).toBe('openai/gpt-5.6-terra');
  });

  it('persists and reads the preferred Auto priority', () => {
    writePreferredAgentChatPriority(RouterPriority.COST);
    expect(readPreferredAgentChatPriority()).toBe(RouterPriority.COST);
  });

  it('keeps generation prefs off the chat keys', () => {
    writePreferredAgentChatModel('openai/gpt-5.6-terra');
    writePreferredGenerationModel('black-forest-labs/flux-2-dev');
    writePreferredGenerationPriority(RouterPriority.SPEED);
    writePreferredGenerationOutputs(3);

    expect(readPreferredAgentChatModel()).toBe('openai/gpt-5.6-terra');
    expect(readPreferredGenerationModel()).toBe('black-forest-labs/flux-2-dev');
    expect(readPreferredGenerationPriority()).toBe(RouterPriority.SPEED);
    expect(readPreferredGenerationOutputs()).toBe(3);
    expect(
      window.localStorage.getItem('genfeed:agent-preferred-chat-model:v1'),
    ).toBe('openai/gpt-5.6-terra');
    expect(
      window.localStorage.getItem(
        'genfeed:agent-preferred-generation-model:v1',
      ),
    ).toBe('black-forest-labs/flux-2-dev');
    expect(
      window.localStorage.getItem(
        'genfeed:agent-preferred-generation-outputs:v1',
      ),
    ).toBe('3');
  });
});
