import { describe, expect, it } from 'vitest';
import {
  buildAgentWorkflowRunInput,
  listEditableExtraSlots,
  listUnfilledRequiredAfterForm,
  seedExtraInputsFromBinding,
} from './agent-workflow-run-input.util';

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

  it('merges extra workflow slot inputs', () => {
    const result = buildAgentWorkflowRunInput({
      extraInputs: {
        customHook: '  open with a question ',
        empty: '   ',
      },
      topic: 'Hooks',
    });

    expect(result.inputs).toEqual({
      customHook: 'open with a question',
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

describe('listEditableExtraSlots', () => {
  it('skips standard keys and filled optional slots', () => {
    const slots = listEditableExtraSlots([
      {
        defaultValue: null,
        description: null,
        filledValue: null,
        key: 'topic',
        label: 'Topic',
        required: true,
        source: 'unfilled',
        type: 'string',
      },
      {
        defaultValue: null,
        description: null,
        filledValue: null,
        key: 'customHook',
        label: 'Hook',
        required: true,
        source: 'unfilled',
        type: 'string',
      },
      {
        defaultValue: 'keep',
        description: null,
        filledValue: 'filled',
        key: 'optionalNote',
        label: 'Note',
        required: false,
        source: 'default',
        type: 'string',
      },
    ]);

    expect(slots.map((slot) => slot.key)).toEqual(['customHook']);
  });
});

describe('seedExtraInputsFromBinding', () => {
  it('seeds defaults for editable extras', () => {
    expect(
      seedExtraInputsFromBinding([
        {
          defaultValue: 'hook default',
          description: null,
          filledValue: null,
          key: 'customHook',
          label: 'Hook',
          required: true,
          source: 'default',
          type: 'string',
        },
      ]),
    ).toEqual({ customHook: 'hook default' });
  });
});

describe('listUnfilledRequiredAfterForm', () => {
  it('requires extra slots when form does not fill them', () => {
    expect(
      listUnfilledRequiredAfterForm(
        [
          {
            defaultValue: null,
            description: null,
            filledValue: null,
            key: 'topic',
            label: 'Topic',
            required: true,
            source: 'unfilled',
            type: 'string',
          },
          {
            defaultValue: null,
            description: null,
            filledValue: null,
            key: 'customHook',
            label: 'Hook',
            required: true,
            source: 'unfilled',
            type: 'string',
          },
        ],
        { topic: 'Launch' },
      ),
    ).toEqual(['customHook']);
  });

  it('is empty when form fills required extras', () => {
    expect(
      listUnfilledRequiredAfterForm(
        [
          {
            defaultValue: null,
            description: null,
            filledValue: null,
            key: 'customHook',
            label: 'Hook',
            required: true,
            source: 'unfilled',
            type: 'string',
          },
        ],
        { extraInputs: { customHook: 'open strong' } },
      ),
    ).toEqual([]);
  });
});
