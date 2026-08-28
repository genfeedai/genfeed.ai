import { describe, expect, it } from 'vitest';
import {
  ALL_ACTIONS,
  createGenfeedActionNode,
  getActionDefinition,
} from './action-registry.js';

describe('Genfeed action registry', () => {
  it('contains exactly one definition for every action ID', () => {
    const ids = ALL_ACTIONS.map((action) => action.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not register visual aliases as duplicate actions', () => {
    const visualAliases = [
      'ai-avatar-video',
      'ai-generate-image',
      'ai-generate-newsletter',
      'ai-generate-post',
      'ai-generate-video',
      'ai-lip-sync',
      'ai-llm',
      'ai-prompt-constructor',
      'ai-reframe',
      'ai-text-to-speech',
      'ai-upscale',
      'ai-voice-change',
      'attach-post-ingredient',
      'cast-prompt-generator',
      'effect-color-grade',
      'generateVideo',
      'output-publish',
      'source-corpus',
    ];

    expect(
      visualAliases.filter((actionId) => getActionDefinition(actionId)),
    ).toEqual([]);
  });

  it('generates action nodes from registered definitions', () => {
    expect(
      createGenfeedActionNode({
        actionId: 'youtube.resolve-source',
        id: 'resolve-source',
        inputVariableKeys: ['youtubeUrl'],
      }),
    ).toEqual({
      data: {
        config: {
          actionId: 'youtube.resolve-source',
          parameters: {},
        },
        inputVariableKeys: ['youtubeUrl'],
        label: 'Resolve YouTube Source',
      },
      id: 'resolve-source',
      position: { x: 0, y: 120 },
      type: 'genfeedAction',
    });
  });

  it('fails closed for an unknown action ID', () => {
    expect(getActionDefinition('not-an-action')).toBeUndefined();
    expect(() =>
      createGenfeedActionNode({
        actionId: 'not-an-action',
        id: 'unknown',
      }),
    ).toThrow('Unknown Genfeed action: not-an-action');
  });

  it('owns the shared terminal output collector definition', () => {
    expect(getActionDefinition('workflow.collect-output')).toMatchObject({
      authorization: 'user',
      id: 'workflow.collect-output',
      visibility: 'internal',
    });
  });

  it('owns workflow credit policy instead of delegating it to the engine', () => {
    expect(getActionDefinition('imageGen')?.credits).toEqual({
      amount: 5,
      mode: 'fixed',
    });
    expect(getActionDefinition('videoGen')?.credits).toEqual({
      amount: 10,
      mode: 'fixed',
    });
    expect(getActionDefinition('long-form.transform-text')?.credits).toEqual({
      mode: 'dynamic',
    });
  });
});
