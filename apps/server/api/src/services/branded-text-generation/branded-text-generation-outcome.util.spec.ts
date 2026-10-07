import {
  BRANDED_GENERATION_BLOCKED_REASON,
  brandedReasonHttpStatus,
  brandedReceiptReasonCode,
} from '@api/services/branded-text-generation/branded-text-generation-outcome.util';
import type { BrandedGenerationReceiptV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { describe, expect, it } from 'vitest';

const receipt = (
  diagnostics: { code: string; severity: 'info' | 'warning' | 'error' }[],
) => ({ diagnostics }) as unknown as BrandedGenerationReceiptV1;

describe('brandedReceiptReasonCode', () => {
  it('returns the last error diagnostic', () => {
    expect(
      brandedReceiptReasonCode(
        receipt([
          { code: 'first', severity: 'error' },
          { code: 'noted', severity: 'info' },
          { code: 'last', severity: 'error' },
          { code: 'warned', severity: 'warning' },
        ]),
      ),
    ).toBe('last');
  });

  it('falls back to the generic reason without an error diagnostic', () => {
    expect(
      brandedReceiptReasonCode(receipt([{ code: 'noted', severity: 'info' }])),
    ).toBe(BRANDED_GENERATION_BLOCKED_REASON);
    expect(brandedReceiptReasonCode(receipt([]))).toBe(
      'branded_generation_blocked',
    );
  });
});

describe('brandedReasonHttpStatus', () => {
  it.each([
    ['channel_limit_exceeded', 422],
    ['provider_output_empty', 422],
    ['provider_attempt_ref_unavailable', 502],
    ['artifact_persist_failed', 500],
    ['artifact_bind_failed', 500],
    ['no_approved_revision', 409],
    ['unsupported_capability', 409],
    ['anything_else', 409],
  ])('maps %s to %i', (reasonCode, status) => {
    expect(brandedReasonHttpStatus(reasonCode)).toBe(status);
  });
});
