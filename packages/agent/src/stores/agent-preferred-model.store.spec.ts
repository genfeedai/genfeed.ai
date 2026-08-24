import { RouterPriority } from '@genfeedai/enums';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  adoptNewThreadGenerationPrefs,
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
    const scoped = JSON.parse(
      window.localStorage.getItem(
        'genfeed:agent-preferred-generation-by-scope:v1',
      ) ?? '{}',
    ) as Record<
      string,
      { model?: string; outputs?: number; priority?: string }
    >;
    expect(scoped['__new__:image']).toEqual(
      expect.objectContaining({
        model: 'black-forest-labs/flux-2-dev',
        outputs: 3,
        priority: RouterPriority.SPEED,
      }),
    );
  });

  it('keeps image and video generation prefs isolated across threads', () => {
    writePreferredGenerationModel('black-forest-labs/flux-2-dev', {
      generationType: 'image',
      threadId: 'thread-image',
    });
    writePreferredGenerationModel('klingai/kling-v2', {
      generationType: 'video',
      threadId: 'thread-video',
    });

    expect(
      readPreferredGenerationModel({
        generationType: 'image',
        threadId: 'thread-image',
      }),
    ).toBe('black-forest-labs/flux-2-dev');
    expect(
      readPreferredGenerationModel({
        generationType: 'video',
        threadId: 'thread-video',
      }),
    ).toBe('klingai/kling-v2');
    expect(
      readPreferredGenerationModel({
        generationType: 'video',
        threadId: 'thread-image',
      }),
    ).toBeNull();
    expect(
      readPreferredGenerationModel({
        generationType: 'image',
        threadId: 'thread-video',
      }),
    ).toBeNull();
  });

  it('adopts /agent/new generation prefs onto the created thread once', () => {
    writePreferredGenerationModel('black-forest-labs/flux-2-dev', {
      generationType: 'image',
    });
    adoptNewThreadGenerationPrefs('thread-created');

    expect(
      readPreferredGenerationModel({
        generationType: 'image',
        threadId: 'thread-created',
      }),
    ).toBe('black-forest-labs/flux-2-dev');

    writePreferredGenerationModel('klingai/kling-v2', {
      generationType: 'image',
    });
    adoptNewThreadGenerationPrefs('thread-created');
    expect(
      readPreferredGenerationModel({
        generationType: 'image',
        threadId: 'thread-created',
      }),
    ).toBe('black-forest-labs/flux-2-dev');
  });
});
