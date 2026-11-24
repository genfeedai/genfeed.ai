import { WorkflowMissingInputException } from '@api/helpers/exceptions/workflow-missing-input/workflow-missing-input.exception';
import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

describe('WorkflowMissingInputException', () => {
  it('answers 400 with a stable code and a message that names the input', () => {
    const exception = new WorkflowMissingInputException([
      { label: 'Visual angle', name: 'visualAngle', type: 'text' },
    ]);

    expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(exception.message).toBe(
      'Missing required workflow input: visualAngle',
    );
    expect(exception.getResponse()).toMatchObject({
      code: 'WORKFLOW_MISSING_INPUT',
      detail: 'Missing required workflow input: visualAngle',
    });
  });

  it('lists every missing input in one message', () => {
    const exception = new WorkflowMissingInputException([
      { label: 'Visual angle', name: 'visualAngle', type: 'text' },
      { label: 'Visual style', name: 'visualStyle', type: 'text' },
    ]);

    expect(exception.message).toBe(
      'Missing required workflow inputs: visualAngle, visualStyle',
    );
    expect(exception.missingInputs.map((input) => input.name)).toEqual([
      'visualAngle',
      'visualStyle',
    ]);
  });
});
