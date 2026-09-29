import { describe, expect, it } from 'vitest';
import type { ExecutionOptions as CanonicalExecutionOptions } from '../contracts';
import type { ExecutionOptions as EngineExecutionOptions } from './types';

const acceptCanonicalOptions = (
  options: CanonicalExecutionOptions,
): EngineExecutionOptions => options;
const acceptEngineOptions = (
  options: EngineExecutionOptions,
): CanonicalExecutionOptions => options;

describe('workflow execution contract boundary', () => {
  it('keeps engine and canonical execution options assignable', () => {
    const options = { executionId: 'run-1', maxRetries: 2 };

    expect(acceptCanonicalOptions(options)).toEqual(options);
    expect(acceptEngineOptions(options)).toEqual(options);
  });
});
