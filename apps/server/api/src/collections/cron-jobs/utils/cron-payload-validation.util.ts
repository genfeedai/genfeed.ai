import type { CronJobType } from '@api/collections/cron-jobs/schemas/cron-job.schema';

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return Object.values(value as Record<string, unknown>).every(
    (entry) => typeof entry === 'string',
  );
}

export function validateCronPayload(
  jobType: CronJobType,
  payload: Record<string, unknown> | undefined,
): string[] {
  const data = payload ?? {};
  const errors: string[] = [];

  switch (jobType) {
    case 'workflow_execution': {
      if (typeof data.workflowId !== 'string' || !data.workflowId.trim()) {
        errors.push('payload.workflowId is required for workflow_execution');
      }
      return errors;
    }

    case 'agent_strategy_execution': {
      if (
        data.strategyId !== undefined &&
        typeof data.strategyId !== 'string'
      ) {
        errors.push('payload.strategyId must be a string');
      }
      if (data.objective !== undefined && typeof data.objective !== 'string') {
        errors.push('payload.objective must be a string');
      }
      if (
        data.creditBudget !== undefined &&
        (typeof data.creditBudget !== 'number' ||
          Number.isNaN(data.creditBudget))
      ) {
        errors.push('payload.creditBudget must be a number');
      }
      if (data.model !== undefined && typeof data.model !== 'string') {
        errors.push('payload.model must be a string');
      }
      if (data.agentType !== undefined && typeof data.agentType !== 'string') {
        errors.push('payload.agentType must be a string');
      }
      if (
        data.autonomyMode !== undefined &&
        typeof data.autonomyMode !== 'string'
      ) {
        errors.push('payload.autonomyMode must be a string');
      }
      return errors;
    }

    case 'newsletter_substack': {
      if (data.topic !== undefined && typeof data.topic !== 'string') {
        errors.push('payload.topic must be a string');
      }
      if (
        data.publicationName !== undefined &&
        typeof data.publicationName !== 'string'
      ) {
        errors.push('payload.publicationName must be a string');
      }
      if (
        data.instructions !== undefined &&
        typeof data.instructions !== 'string'
      ) {
        errors.push('payload.instructions must be a string');
      }
      if (data.model !== undefined && typeof data.model !== 'string') {
        errors.push('payload.model must be a string');
      }
      if (data.sources !== undefined && !isStringArray(data.sources)) {
        errors.push('payload.sources must be an array of strings');
      }
      if (
        data.webhookUrl !== undefined &&
        typeof data.webhookUrl !== 'string'
      ) {
        errors.push('payload.webhookUrl must be a string');
      }
      if (
        data.webhookSecret !== undefined &&
        typeof data.webhookSecret !== 'string'
      ) {
        errors.push('payload.webhookSecret must be a string');
      }
      if (
        data.webhookHeaders !== undefined &&
        !isStringRecord(data.webhookHeaders)
      ) {
        errors.push(
          'payload.webhookHeaders must be an object of string values',
        );
      }
      return errors;
    }

    default:
      return errors;
  }
}
