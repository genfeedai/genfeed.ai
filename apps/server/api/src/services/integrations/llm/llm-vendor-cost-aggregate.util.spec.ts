import type { ILlmVendorCostGroupRow } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import { foldLlmVendorCostGroups } from './llm-vendor-cost-aggregate.util';

function row(
  overrides: Partial<ILlmVendorCostGroupRow> &
    Pick<ILlmVendorCostGroupRow, 'isByok' | 'model' | 'provider'>,
): ILlmVendorCostGroupRow {
  return {
    _count: { _all: 2 },
    _sum: {
      completionTokens: 10,
      promptTokens: 20,
      vendorCostMicros: 180,
    },
    ...overrides,
  };
}

describe('foldLlmVendorCostGroups', () => {
  it('aggregates platform vendor cost per org model and keeps BYOK tokens separate', () => {
    const folded = foldLlmVendorCostGroups([
      row({
        isByok: false,
        model: 'deepseek/deepseek-v4-flash-0731',
        provider: 'openrouter',
      }),
      row({
        _count: { _all: 1 },
        _sum: {
          completionTokens: 5,
          promptTokens: 10,
          vendorCostMicros: 999,
        },
        isByok: true,
        model: 'deepseek/deepseek-v4-flash-0731',
        provider: 'openrouter',
      }),
      row({
        isByok: false,
        model: 'anthropic/claude-sonnet-5',
        provider: 'anthropic',
        _sum: {
          completionTokens: 8,
          promptTokens: 12,
          vendorCostMicros: 400,
        },
      }),
    ]);

    expect(folded).toEqual([
      {
        byokCallCount: 0,
        callCount: 2,
        completionTokens: 8,
        model: 'anthropic/claude-sonnet-5',
        platformCallCount: 2,
        promptTokens: 12,
        provider: 'anthropic',
        vendorCostMicros: 400,
      },
      {
        byokCallCount: 1,
        callCount: 3,
        completionTokens: 15,
        model: 'deepseek/deepseek-v4-flash-0731',
        platformCallCount: 2,
        promptTokens: 30,
        provider: 'openrouter',
        vendorCostMicros: 180,
      },
    ]);
  });
});
