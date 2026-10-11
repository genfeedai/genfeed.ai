import { describe, expect, it } from 'vitest';
import { ALL_ACTIONS, getActionDefinition } from './action-registry';
import { CURATED_ACTION_CATALOG } from './curated-action-catalog';
import { ALL_TOOLS, getToolsForSurface } from './tool-registry';

const ACTION_ID = 'breakout.response.execute';

describe('breakout.response.execute system action', () => {
  it('is an internal system-only action with no credits or approval', () => {
    expect(getActionDefinition(ACTION_ID)).toMatchObject({
      approval: 'none',
      authorization: 'system',
      credits: { amount: 0, mode: 'fixed' },
      id: ACTION_ID,
      visibility: 'internal',
    });
    expect(
      ALL_ACTIONS.filter((action) => action.id === ACTION_ID),
    ).toHaveLength(1);
  });

  it('is absent from the curated, tool, agent and MCP catalogs', () => {
    expect(
      CURATED_ACTION_CATALOG.some((entry) => entry.name === ACTION_ID),
    ).toBe(false);
    expect(ALL_TOOLS.some((tool) => tool.name === ACTION_ID)).toBe(false);
    for (const surface of ['agent', 'mcp'] as const) {
      expect(
        getToolsForSurface(surface).some((tool) => tool.name === ACTION_ID),
      ).toBe(false);
    }
  });

  it('accepts only a closed scope request and never an actor', () => {
    const input = getActionDefinition(ACTION_ID)?.inputSchema as {
      properties: {
        request: {
          additionalProperties: boolean;
          properties: Record<string, unknown>;
          required: string[];
        };
      };
    };
    const request = input.properties.request;
    expect(request.additionalProperties).toBe(false);
    expect(Object.keys(request.properties).sort()).toEqual([
      'brandId',
      'credentialId',
      'organizationId',
      'platform',
      'responseId',
      'strategyId',
    ]);
    expect(request.required).toEqual(Object.keys(request.properties).sort());
    expect(JSON.stringify(input)).not.toMatch(/actor|userId|apiKey|scopes/i);
  });

  it('returns only identifiers and a closed status', () => {
    const output = getActionDefinition(ACTION_ID)?.outputSchema as {
      additionalProperties: boolean;
      properties: Record<string, { enum?: string[] }>;
    };
    expect(output.additionalProperties).toBe(false);
    expect(Object.keys(output.properties).sort()).toEqual([
      'outputIds',
      'reason',
      'responseId',
      'status',
    ]);
    expect(output.properties.status.enum).toEqual([
      'completed',
      'held',
      'processing',
    ]);
  });
});
