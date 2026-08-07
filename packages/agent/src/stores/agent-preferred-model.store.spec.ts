import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearPreferredAgentChatModel,
  readPreferredAgentChatModel,
  writePreferredAgentChatModel,
} from './agent-preferred-model.store';

describe('agent-preferred-model.store', () => {
  beforeEach(() => {
    clearPreferredAgentChatModel();
  });

  afterEach(() => {
    clearPreferredAgentChatModel();
  });

  it('returns null when nothing is stored', () => {
    expect(readPreferredAgentChatModel()).toBeNull();
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
});
