import {
  buildAgentRoutingMetadata,
  resolveAgentRoutingPolicy,
} from '@api/services/agent-orchestrator/utils/agent-routing-policy.util';
import { AgentChatRoutingTier } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

const DEFAULT_MODEL_KEY = 'openrouter/auto';

const base = {
  defaultModelKey: DEFAULT_MODEL_KEY,
  model: DEFAULT_MODEL_KEY,
};

describe('resolveAgentRoutingPolicy', () => {
  it('keeps the keyword outcome when no decision is supplied', () => {
    expect(
      resolveAgentRoutingPolicy({
        ...base,
        prompt: 'search the web for the latest pricing',
      }),
    ).toEqual({ plugins: [{ id: 'web' }], reason: 'explicit-web-search' });
    expect(
      resolveAgentRoutingPolicy({
        ...base,
        prompt: 'what is trending in the creator economy today',
      }),
    ).toEqual({ plugins: [{ id: 'web' }], reason: 'fresh-live-data' });
    expect(
      resolveAgentRoutingPolicy({ ...base, prompt: 'rewrite this caption' }),
    ).toEqual({ reason: 'default' });
  });

  it('lets a live decision turn the web plugin on where the regex would not', () => {
    expect(
      resolveAgentRoutingPolicy({
        ...base,
        isWebSearchNeeded: true,
        prompt: 'who won the match',
      }),
    ).toEqual({ plugins: [{ id: 'web' }], reason: 'decided-live-data' });
  });

  it('lets a live decision turn the web plugin off where the regex would not', () => {
    expect(
      resolveAgentRoutingPolicy({
        ...base,
        isWebSearchNeeded: false,
        prompt: 'what is trending in the creator economy today',
      }),
    ).toEqual({ reason: 'default' });
  });

  it('never attaches the plugin off the default model or on onboarding', () => {
    expect(
      resolveAgentRoutingPolicy({
        defaultModelKey: DEFAULT_MODEL_KEY,
        isWebSearchNeeded: true,
        model: 'vendor/explicit',
        prompt: 'latest news today',
      }),
    ).toEqual({ reason: 'default' });
    expect(
      resolveAgentRoutingPolicy({
        ...base,
        isWebSearchNeeded: true,
        prompt: 'latest news today',
        source: 'onboarding',
      }),
    ).toEqual({ reason: 'default' });
  });
});

describe('buildAgentRoutingMetadata', () => {
  it('stays empty for a turn with no decision and no web policy', () => {
    expect(
      buildAgentRoutingMetadata({ ...base, prompt: 'rewrite this caption' }),
    ).toEqual({});
  });

  it('records tier, confidence and the chosen key on a live turn', () => {
    expect(
      buildAgentRoutingMetadata({
        ...base,
        autoRouting: {
          candidateModelKey: 'vendor/reasoner',
          dispatchModelKey: 'vendor/reasoner',
          mode: 'live',
          tier: AgentChatRoutingTier.COMPLEX,
          tierConfidence: 0.93,
        },
        prompt: 'rewrite this caption',
      }),
    ).toEqual({
      routedModelKey: 'vendor/reasoner',
      routingDecisionMode: 'live',
      routingTier: AgentChatRoutingTier.COMPLEX,
      routingTierConfidence: 0.93,
    });
  });

  it('omits the key when a live candidate was never dispatched', () => {
    expect(
      buildAgentRoutingMetadata({
        ...base,
        autoRouting: {
          candidateModelKey: 'vendor/reasoner',
          mode: 'live',
          tier: AgentChatRoutingTier.COMPLEX,
          tierConfidence: 0.41,
        },
        prompt: 'rewrite this caption',
      }),
    ).toEqual({
      routingDecisionMode: 'live',
      routingTier: AgentChatRoutingTier.COMPLEX,
      routingTierConfidence: 0.41,
    });
  });

  it('marks a shadow turn so the key on it is not read as dispatched', () => {
    expect(
      buildAgentRoutingMetadata({
        ...base,
        autoRouting: {
          candidateModelKey: 'vendor/cheap',
          mode: 'shadow',
          tier: AgentChatRoutingTier.SIMPLE,
          tierConfidence: 0.88,
        },
        prompt: 'rewrite this caption',
      }),
    ).toMatchObject({
      routedModelKey: 'vendor/cheap',
      routingDecisionMode: 'shadow',
    });
  });

  it('reports the decided web-search reason rather than the keyword one', () => {
    expect(
      buildAgentRoutingMetadata({
        ...base,
        autoRouting: { isWebSearchNeeded: true, mode: 'live' },
        prompt: 'rewrite this caption',
      }),
    ).toMatchObject({
      routingPolicy: 'decided-live-data',
      webSearchEnabled: true,
    });
  });
});
