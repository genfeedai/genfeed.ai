import type { ExecutionOptions as CanonicalExecutionOptions } from '@genfeedai/workflows/contracts';
import { DEFAULT_RETRY_CONFIG as CANONICAL_RETRY_CONFIG } from '@genfeedai/workflows/contracts';
import { describe, expect, it } from 'vitest';
import type { ExecutionOptions as EngineExecutionOptions } from './types';
import { DEFAULT_RETRY_CONFIG as ENGINE_RETRY_CONFIG } from './types';

const acceptCanonicalOptions = (
  options: CanonicalExecutionOptions,
): EngineExecutionOptions => options;
const acceptEngineOptions = (
  options: EngineExecutionOptions,
): CanonicalExecutionOptions => options;

describe('workflow execution contract boundary', () => {
  it('re-exports the canonical retry configuration', () => {
    expect(ENGINE_RETRY_CONFIG).toBe(CANONICAL_RETRY_CONFIG);
  });

  it('keeps engine and canonical execution options assignable', () => {
    const options = { executionId: 'run-1', maxRetries: 2 };

    expect(acceptCanonicalOptions(options)).toEqual(options);
    expect(acceptEngineOptions(options)).toEqual(options);
  });
});
