import { describe, expect, it } from 'vitest';
import { readMissingWorkflowInputs } from './missingInputError';

function apiError(member: Record<string, unknown>): Error {
  return Object.assign(new Error('HTTP error 400'), {
    data: { errors: [member] },
  });
}

describe('readMissingWorkflowInputs', () => {
  it('reads every input the typed 400 lists', () => {
    const error = apiError({
      code: 'WORKFLOW_MISSING_INPUT',
      meta: {
        missingInputs: [
          {
            description: 'Camera angle',
            label: 'Visual angle',
            name: 'visualAngle',
            type: 'text',
          },
          {
            label: 'Visual style',
            name: 'visualStyle',
            type: 'select',
            validation: { options: ['Cinematic', 'Flat'] },
          },
        ],
      },
    });

    expect(readMissingWorkflowInputs(error)).toEqual([
      {
        description: 'Camera angle',
        label: 'Visual angle',
        name: 'visualAngle',
        type: 'text',
      },
      {
        label: 'Visual style',
        name: 'visualStyle',
        type: 'select',
        validation: { options: ['Cinematic', 'Flat'] },
      },
    ]);
  });

  it('falls back to the name and text when the definition is thin', () => {
    const error = apiError({
      code: 'WORKFLOW_MISSING_INPUT',
      meta: { missingInputs: [{ name: 'portrait' }, { label: 'no name' }] },
    });

    expect(readMissingWorkflowInputs(error)).toEqual([
      { label: 'portrait', name: 'portrait', type: 'text' },
    ]);
  });

  it.each([
    ['another API error', apiError({ code: '400', detail: 'Bad request' })],
    [
      'a code without a list',
      apiError({ code: 'WORKFLOW_MISSING_INPUT', meta: {} }),
    ],
    [
      'an empty list',
      apiError({ code: 'WORKFLOW_MISSING_INPUT', meta: { missingInputs: [] } }),
    ],
    ['a plain error', new Error('HTTP error 500')],
    ['a string', 'WORKFLOW_MISSING_INPUT'],
  ])('is null for %s', (_name, error) => {
    expect(readMissingWorkflowInputs(error)).toBeNull();
  });
});
