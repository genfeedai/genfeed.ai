import { runWithActionOrigin } from '@api/action-origin/action-origin.context';
import {
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

  it('claims no enhancement when enhancement was skipped or failed', () => {
    expect(
      resolveMediaGenerationReceiptPrompts({
        harness: { ...harness, status: 'failed', enhancedPrompt: 'typed' },
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
