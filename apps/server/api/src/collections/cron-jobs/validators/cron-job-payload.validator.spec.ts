import { CronJobPayloadValidator } from '@api/collections/cron-jobs/validators/cron-job-payload.validator';
import type { ValidationArguments } from 'class-validator';
import { describe, expect, it } from 'vitest';

function args(object: Record<string, unknown>): ValidationArguments {
  return {
    constraints: [],
    object,
    property: 'payload',
    targetName: 'CreateCronJobDto',
    value: object.payload,
  };
}

describe('CronJobPayloadValidator', () => {
  const validator = new CronJobPayloadValidator();

  it('skips validation until a job type is present', () => {
    expect(validator.validate(undefined, args({}))).toBe(true);
  });

  it('delegates payload checks to validateCronPayload', () => {
    expect(
      validator.validate(
        {},
        args({ jobType: 'workflow_execution', payload: {} }),
      ),
    ).toBe(false);
    expect(
      validator.validate(
        { workflowId: 'wf_1' },
        args({
          jobType: 'workflow_execution',
          payload: { workflowId: 'wf_1' },
        }),
      ),
    ).toBe(true);
  });

  it('surfaces the first payload error, with a fallback message', () => {
    expect(
      validator.defaultMessage(
        args({ jobType: 'workflow_execution', payload: {} }),
      ),
    ).toContain('workflowId');

    expect(
      validator.defaultMessage(
        args({
          jobType: 'newsletter_substack',
          payload: { publicationName: 'Genfeed' },
        }),
      ),
    ).toBe('Invalid cron payload for selected jobType');
  });
});
