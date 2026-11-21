import { describe, expect, it } from 'vitest';
import type { CanonicalToolDefinition } from '../../interfaces/tool-definition.interface';
import { deriveMcpCatalogPolicy } from './derive';

function target(
  overrides: Partial<CanonicalToolDefinition>,
): CanonicalToolDefinition {
  return {
    annotations: {
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
      readOnlyHint: true,
    },
    category: 'content',
    creditCost: 0,
    creditPricing: { amount: 0, mode: 'fixed' },
    description: 'Original tool.',
    name: 'get_thing',
    parameters: { properties: {}, type: 'object' },
    requiredRole: 'user',
    surfaces: { agent: false, cliAgentVisible: false, mcp: true },
    toolset: 'content',
    ...overrides,
  } as CanonicalToolDefinition;
}

const WRITE: Partial<CanonicalToolDefinition> = {
  annotations: {
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
    readOnlyHint: false,
  },
  mutationPolicy: 'approval-required',
};

describe('deriveMcpCatalogPolicy', () => {
  it('is read-only and idempotent only when every action is', () => {
    expect(deriveMcpCatalogPolicy([target({}), target({})])).toMatchObject({
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      mutationPolicy: undefined,
    });
    expect(
      deriveMcpCatalogPolicy([target({}), target(WRITE)]).annotations,
    ).toEqual({
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
      readOnlyHint: false,
    });
  });

  it('asks for approval when any action needs it, else declares a direct write', () => {
    expect(
      deriveMcpCatalogPolicy([target({}), target(WRITE)]).mutationPolicy,
    ).toBe('approval-required');
    expect(
      deriveMcpCatalogPolicy([target({}), target({ mutationPolicy: 'direct' })])
        .mutationPolicy,
    ).toBe('direct');
  });

  it('prices a free merged tool as free and a mixed one as a range', () => {
    expect(
      deriveMcpCatalogPolicy([target({}), target({})]).creditPricing,
    ).toEqual({ amount: 0, mode: 'fixed' });
    expect(
      deriveMcpCatalogPolicy([
        target({}),
        target({
          creditCost: 2,
          creditPricing: { amount: 2, mode: 'fixed' },
        }),
        target({
          creditCost: 0,
          creditPricing: {
            maximum: 10,
            minimum: 4,
            mode: 'variable',
            unit: 'generation',
          },
        }),
      ]),
    ).toMatchObject({
      creditCost: 0,
      creditPricing: { maximum: 10, minimum: 0, mode: 'variable' },
    });
  });

  it('asks for a quote per action when any action is quoted', () => {
    expect(
      deriveMcpCatalogPolicy([
        target({}),
        target({
          creditPricing: { mode: 'quote', quoteTool: 'quote_thing' },
        }),
      ]).creditPricing,
    ).toEqual({ mode: 'quote', quoteTool: 'find_tools' });
  });

  it('takes the widest data source and the lowest role', () => {
    expect(
      deriveMcpCatalogPolicy([
        target({ dataSource: 'provider' }),
        target({ dataSource: 'provider-paid', requiredRole: 'admin' }),
      ]),
    ).toMatchObject({ dataSource: 'provider-paid', requiredRole: 'user' });
  });
});
