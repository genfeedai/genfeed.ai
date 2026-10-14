import { runWithActionOrigin } from '@api/action-origin/action-origin.context';
import {
  resolveMediaGenerationReceiptBrand,
  resolveMediaGenerationReceiptPrompts,
  resolveMediaGenerationReceiptSurface,
} from '@api/services/media-generation-receipts/media-generation-receipt-input.util';
import { ActionOrigin } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

describe('resolveMediaGenerationReceiptSurface', () => {
  it.each([
    [ActionOrigin.UI, 'studio'],
    [ActionOrigin.AGENT, 'agent'],
    [ActionOrigin.MCP, 'mcp'],
    [ActionOrigin.API, 'api'],
    [ActionOrigin.CLI, 'api'],
    [ActionOrigin.WORKFLOW, 'workflow'],
    [ActionOrigin.UNKNOWN, 'ui'],
  ] as const)('maps the server-verified %s origin to %s', (origin, surface) => {
    expect(
      runWithActionOrigin({ origin }, () =>
        resolveMediaGenerationReceiptSurface(),
      ),
    ).toBe(surface);
  });

  it('falls back to a generic UI surface outside a request', () => {
    expect(resolveMediaGenerationReceiptSurface()).toBe('ui');
  });
});

describe('resolveMediaGenerationReceiptPrompts', () => {
  const harness = {
    originalPrompt: 'typed',
    enhancedPrompt: 'typed, enhanced',
    status: 'applied' as const,
    source: 'brand' as const,
    brandId: 'brand-1',
    appliedPacks: [],
  };

  it('keeps typed, enhanced and dispatched prompts distinct', () => {
    expect(
      resolveMediaGenerationReceiptPrompts({
        harness,
        fallbackPrompt: 'ignored',
        dispatched: [undefined, '  ', 'compiled for provider'],
      }),
    ).toEqual({
      originalPrompt: 'typed',
      enhancedPrompt: 'typed, enhanced',
      compiledPrompt: 'compiled for provider',
    });
  });

  it('claims no enhancement when enhancement was skipped', () => {
    expect(
      resolveMediaGenerationReceiptPrompts({
        harness: { ...harness, status: 'skipped', enhancedPrompt: 'typed' },
        fallbackPrompt: 'ignored',
        dispatched: [],
      }),
    ).toEqual({ originalPrompt: 'typed', compiledPrompt: 'typed' });
    expect(
      resolveMediaGenerationReceiptPrompts({
        fallbackPrompt: 'request text',
        dispatched: [42],
      }),
    ).toEqual({
      originalPrompt: 'request text',
      compiledPrompt: 'request text',
    });
  });
});

describe('resolveMediaGenerationReceiptBrand', () => {
  const applied = {
    originalPrompt: 'typed',
    enhancedPrompt: 'typed, enhanced',
    status: 'applied' as const,
    source: 'brand' as const,
    brandId: 'brand-1',
    appliedPacks: [],
  };

  it.each(['approved_brand', 'provisional_brand'] as const)(
    'pins the %s revision of an applied enhancement',
    (brandMode) => {
      expect(
        resolveMediaGenerationReceiptBrand({
          ...applied,
          brandMode,
          brandRevisionId: 'revision-1',
          brandRevisionVersion: 2,
        }),
      ).toEqual({
        brand: {
          mode: brandMode,
          revisionId: 'revision-1',
          revisionVersion: 2,
        },
      });
    },
  );

  it('carries no brand for a skipped or raw output, or one without a pin', () => {
    expect(resolveMediaGenerationReceiptBrand(undefined)).toEqual({});
    expect(
      resolveMediaGenerationReceiptBrand({
        ...applied,
        status: 'skipped',
        brandMode: 'raw',
      }),
    ).toEqual({});
    expect(
      resolveMediaGenerationReceiptBrand({
        ...applied,
        brandMode: 'approved_brand',
      }),
    ).toEqual({});
    expect(resolveMediaGenerationReceiptBrand(applied)).toEqual({});
  });
});
