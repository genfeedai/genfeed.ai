import { describe, expect, it } from 'vitest';
import { toEvalFinishReason } from './finish-reason';

describe('toEvalFinishReason', () => {
  it('reads every provider spelling of the token-limit stop as a cut-off', () => {
    expect(toEvalFinishReason('length')).toBe('length');
    expect(toEvalFinishReason('max_tokens')).toBe('length');
  });

  it('maps normal stops, filters and unknown reasons apart', () => {
    expect(toEvalFinishReason('stop')).toBe('stop');
    expect(toEvalFinishReason('end_turn')).toBe('stop');
    expect(toEvalFinishReason('tool_calls')).toBe('stop');
    expect(toEvalFinishReason('content_filter')).toBe('content-filter');
    expect(toEvalFinishReason('error')).toBe('other');
  });

  it('reports nothing when the route sent no reason', () => {
    expect(toEvalFinishReason(undefined)).toBeNull();
    expect(toEvalFinishReason(null)).toBeNull();
    expect(toEvalFinishReason('')).toBeNull();
  });
});
