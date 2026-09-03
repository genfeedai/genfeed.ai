import { describe, expect, it } from 'vitest';
import {
  ALL_TOOLS,
  CURATED_ACTION_CATALOG,
  evaluateMutationPolicy,
  getToolByName,
  getToolsByCategory,
  getToolsForRole,
  getToolsForSurface,
  isActionOnSurface,
  isPublishingApprovalRequired,
  MCP_CREDIT_COST_META_KEY,
  toAgentTools,
  toMcpTools,
} from './index';

describe('package entry point', () => {
  it('re-exports the registry, catalog, and adapter surface', () => {
    expect(ALL_TOOLS.length).toBe(CURATED_ACTION_CATALOG.length);
    expect(MCP_CREDIT_COST_META_KEY).toBe('genfeed.ai/creditCost');
    for (const fn of [
      getToolByName,
      getToolsByCategory,
      getToolsForRole,
      getToolsForSurface,
      isActionOnSurface,
      isPublishingApprovalRequired,
      evaluateMutationPolicy,
      toAgentTools,
      toMcpTools,
    ]) {
      expect(fn).toBeTypeOf('function');
    }
  });

  it('round-trips a catalog entry through the exported helpers', () => {
    const [entry] = CURATED_ACTION_CATALOG;
    expect(entry).toBeDefined();
    if (!entry) {
      return;
    }
    expect(isActionOnSurface(entry, 'agent')).toBeTypeOf('boolean');
    expect(isPublishingApprovalRequired(entry)).toBeTypeOf('boolean');
    expect(getToolByName(entry.name)?.name).toBe(entry.name);
  });
});
