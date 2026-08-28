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
        parameters: { includeMetadata: true },
      }),
    ).toEqual({
      data: {
        config: {
          actionId: 'youtube.resolve-source',
          parameters: { includeMetadata: true },
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

  it('owns every atomic content-pipeline action used by compiled graphs', () => {
    expect(
      [
        'content.pipeline.generate-image',
        'content.pipeline.generate-music',
        'content.pipeline.generate-speech',
        'content.pipeline.generate-video',
        'content.pipeline.publish',
        'content.pipeline.resolve-context',
      ].every((actionId) => getActionDefinition(actionId)),
    ).toBe(true);
  });

  it('owns the atomic clip-generation graph actions', () => {
    expect(getActionDefinition('clip.generation.generate-one')).toBeDefined();
    expect(
      getActionDefinition('clip.generation.collect-results'),
    ).toBeDefined();
    expect(getActionDefinition('clip.handoff.prepare-publish')).toBeDefined();
    expect(getActionDefinition('clip.handoff.create-editor')).toBeDefined();
    expect(getActionDefinition('clip.handoff.link-library')).toBeDefined();
    expect(getActionDefinition('clip.continuity.begin')).toBeDefined();
    expect(getActionDefinition('clip.continuity.fail')).toBeDefined();
    expect(getActionDefinition('clip.continuity.persist-report')).toBeDefined();
  });

  it('owns recurring product actions launched by system sweeps', () => {
    expect(
      [
        'engagement-rule-evaluation',
        'review-gate-timeout',
        'rss-source-poll',
        'streak-maintenance',
        'tiktok-status-reconciliation',
        'youtube-comments-ingest',
        'youtube-status-reconciliation',
      ].every((actionId) => getActionDefinition(actionId)),
    ).toBe(true);
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

  it('marks editor-installable workflow actions explicitly', () => {
    expect(getActionDefinition('imageGen')?.visibility).toBe('workflow');
    expect(getActionDefinition('socialRead')?.visibility).toBe('workflow');
    expect(
      ALL_ACTIONS.filter((action) => action.visibility === 'workflow').length,
    ).toBeGreaterThan(0);
  });
});
