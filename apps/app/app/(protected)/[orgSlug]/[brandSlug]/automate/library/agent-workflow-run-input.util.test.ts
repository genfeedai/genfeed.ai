import { describe, expect, it } from 'vitest';
import { buildAgentWorkflowRunInput } from './agent-workflow-run-input.util';

describe('buildAgentWorkflowRunInput', () => {
  it('maps topic/prompt/cta without image', () => {
    expect(
      buildAgentWorkflowRunInput({
        cta: ' Follow ',
        prompt: ' angle ',
        topic: ' Launch ',
      }),
    ).toEqual({
      cta: 'Follow',
      prompt: 'angle',
      referenceImage: undefined,
      topic: 'Launch',
    });
  });

  it('prefers selected library ingredient URL over free-text reference image', () => {
    const result = buildAgentWorkflowRunInput({
      referenceImageUrl: 'https://example.com/typed.png',
      selectedIngredient: {
        id: 'ing-42',
        label: 'Moodboard hero',
        url: 'https://cdn.example.com/library/hero.png',
      },
      topic: 'Visual pack',
    });

    expect(result.referenceImage).toBe(
      'https://cdn.example.com/library/hero.png',
    );
    expect(result.inputs).toEqual({
      ingredientId: 'ing-42',
      photoUrl: 'https://cdn.example.com/library/hero.png',
      referenceImage: 'https://cdn.example.com/library/hero.png',
      referenceImageId: 'ing-42',
    });
    expect(result.topic).toBe('Visual pack');
  });

  it('falls back to free-text URL when no ingredient is selected', () => {
    const result = buildAgentWorkflowRunInput({
      referenceImageUrl: 'https://example.com/paste.png',
      topic: 'Paste path',
    });

    expect(result.referenceImage).toBe('https://example.com/paste.png');
    expect(result.inputs).toEqual({
      photoUrl: 'https://example.com/paste.png',
      referenceImage: 'https://example.com/paste.png',
    });
  });

  it('omits empty strings', () => {
    expect(
      buildAgentWorkflowRunInput({
        cta: '   ',
        prompt: '',
        referenceImageUrl: '  ',
        topic: '',
      }),
    ).toEqual({
      cta: undefined,
      prompt: undefined,
      referenceImage: undefined,
      topic: undefined,
    });
  });
});
