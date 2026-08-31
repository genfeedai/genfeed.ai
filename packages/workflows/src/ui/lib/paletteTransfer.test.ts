import { describe, expect, it } from 'vitest';
import {
  decodeWorkflowNodeTransfer,
  encodeWorkflowNodeTransfer,
} from './paletteTransfer';

describe('workflow node palette transfer', () => {
  it('round-trips an action-bound node payload', () => {
    const encoded = encodeWorkflowNodeTransfer({
      actionId: 'imageGen',
      label: 'Generate Image',
      type: 'genfeedAction',
    });

    expect(decodeWorkflowNodeTransfer(encoded)).toEqual({
      actionId: 'imageGen',
      label: 'Generate Image',
      type: 'genfeedAction',
      version: 1,
    });
  });

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
