import type { IErrorDebugInfo } from '@genfeedai/contracts/interfaces/modals/error-debug.interface';
import { describe, expect, it } from 'vitest';
import {
  formatErrorDebugForAgent,
  formatErrorDebugRequest,
  formatErrorDebugResponse,
  resolveErrorDebugSummary,
} from './error-debug-copy.util';

const baseError: IErrorDebugInfo = {
  message: 'No such customer: cus_x',
  method: 'POST',
  status: 400,
  statusText: 'Bad Request',
  timestamp: '2026-08-06T16:00:00.000Z',
  url: '/v1/services/stripe/checkout',
  errorCode: 'ERR_BAD_REQUEST',
  response: {
    data: {
      errors: [
        {
          code: '400',
          title: 'No such customer: cus_x',
          detail: 'Failed to create checkout session',
        },
      ],
    },
  },
  stack: 'Error: boom\n    at foo',
  context: { orgSlug: 'default' },
};

describe('error-debug-copy.util', () => {
  it('formats request fields for clipboard', () => {
    const text = formatErrorDebugRequest(baseError);
    expect(text).toContain('message: No such customer: cus_x');
    expect(text).toContain('url: /v1/services/stripe/checkout');
    expect(text).toContain('method: POST');
    expect(text).toContain('status: 400 Bad Request');
    expect(text).toContain('errorCode: ERR_BAD_REQUEST');
  });

  it('formats response JSON', () => {
    const text = formatErrorDebugResponse(baseError);
    expect(text).toContain('Failed to create checkout session');
    expect(text).toContain('"code": "400"');
  });

  it('builds an agent-ready dump with all sections', () => {
    const text = formatErrorDebugForAgent(baseError);
    expect(text).toContain('## Request failed — agent debug dump');
    expect(text).toContain('### Request');
    expect(text).toContain('### Response');
    expect(text).toContain('### Stack');
    expect(text).toContain('### Context');
    expect(text).toContain('Diagnose and fix the root cause');
    expect(text).toContain('orgSlug');
  });

  it('prefers API title/detail over the generic client message', () => {
    const generic: IErrorDebugInfo = {
      ...baseError,
      message: 'Request failed with status code 400',
    };
    expect(resolveErrorDebugSummary(generic)).toBe(
      'No such customer: cus_x — Failed to create checkout session',
    );
    expect(formatErrorDebugForAgent(generic)).toContain(
      'No such customer: cus_x — Failed to create checkout session',
    );
    expect(formatErrorDebugForAgent(generic)).toContain(
      'raw client message: Request failed with status code 400',
    );
  });
});
