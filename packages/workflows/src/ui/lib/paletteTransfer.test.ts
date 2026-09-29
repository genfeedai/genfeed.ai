import { describe, expect, it } from 'vitest';
import { decodeWorkflowNodeTransfer } from './paletteTransfer';

describe('workflow node palette transfer', () => {
  it.each([
    '',
    'not json',
    '{}',
    '{"version":2,"type":"genfeedAction","label":"Image"}',
    '{"version":1,"type":"","label":"Image"}',
    '{"version":1,"type":"genfeedAction","label":"","actionId":"imageGen"}',
  ])('rejects an invalid or unsupported payload: %s', (payload) => {
    expect(decodeWorkflowNodeTransfer(payload)).toBeNull();
  });
});
