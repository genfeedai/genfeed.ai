import { validateCronPayload } from '@api/collections/cron-jobs/utils/cron-payload-validation.util';
import { describe, expect, it } from 'vitest';

describe('validateCronPayload', () => {
  it('requires workflowId for workflow jobs', () => {
    const errors = validateCronPayload('workflow_execution', {});
    expect(errors[0]).toContain('workflowId');
  });

  it('validates newsletter webhook headers as string map', () => {
    const errors = validateCronPayload('newsletter_substack', {
      webhookHeaders: { A: 1 },
    } as unknown as Record<string, unknown>);
    expect(errors[0]).toContain('webhookHeaders');
  });

  it('accepts valid newsletter payload', () => {
    const errors = validateCronPayload('newsletter_substack', {
      publicationName: 'Genfeed.ai',
      sources: ['https://genfeed.ai'],
      webhookHeaders: { 'X-Test': 'ok' },
      webhookUrl: 'https://example.com/hook',
    });
    expect(errors).toHaveLength(0);
  });
});
