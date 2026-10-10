import { mergeWorkflowProviderResult } from '@api/collections/workflows/services/workflow-provider-result.util';
import { describe, expect, it } from 'vitest';

describe('accepted workflow provider evidence', () => {
  it('preserves original quantities across a conflicting file callback', () => {
    const original = { completionQuantities: { duration: 6 }, externalId: 'actual-url' };
    expect(mergeWorkflowProviderResult({ acceptedFalOutput: original }, { externalId: 'actual-url', acceptedFalOutput: { completionQuantities: { duration: 999 } } })).toEqual({ externalId: 'actual-url', acceptedFalOutput: original });
  });
  it('does not let a callback invent missing accepted evidence', () => {
    expect(mergeWorkflowProviderResult(null, { acceptedFalOutput: { duration: 6 }, measuredFalOutput: { measurement: { duration: 999 } }, externalId: 'url' })).toEqual({ externalId: 'url' });
  });
  it('preserves the server file measurement when a callback supplies different quantities', () => {
    const measurement = { externalId: 'url', measurement: { width: 864, height: 496, duration: 6 } };
    expect(mergeWorkflowProviderResult({ measuredFalOutput: measurement }, { measuredFalOutput: { measurement: { duration: 999 } }, externalId: 'url' })).toEqual({ externalId: 'url', measuredFalOutput: measurement });
  });
  it('leaves a payload-less callback unchanged', () => {
    expect(mergeWorkflowProviderResult({ acceptedFalOutput: {} }, undefined)).toBeUndefined();
  });
});
