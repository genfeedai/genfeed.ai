import { describe, expect, it } from 'vitest';
import {
  AGENT_CHAT_MODEL_KEYS,
  AGENT_CHAT_MODELS,
  AGENT_FALLBACK_ROUND_CREDITS,
  calculateAgentRoundCredits,
  DEFAULT_AGENT_CHAT_MODEL_KEY,
  getAgentChatModel,
  getAgentChatModelRoundCredits,
  isRetiredAgentChatModel,
  LOCAL_DEFAULT_AGENT_CHAT_MODEL_KEY,
  RETIRED_AGENT_CHAT_MODELS,
  resolveAgentChatModelKey,
  SELECTABLE_AGENT_CHAT_MODELS,
} from './agent-chat-models.constant';
import { LOWEST_COST_AGENT_CHAT_MODEL_KEY } from './lowest-cost-models.constant';

describe('calculateAgentRoundCredits', () => {
  it('derives credits from list price, prompt and completion tokens both', () => {
    // 10K prompt @ $1/M + 2K completion @ $5/M = $0.02 → ×1.7 = $0.034 → 4 credits.
    expect(
      calculateAgentRoundCredits({
        completionPerMillion: 5,
        promptPerMillion: 1,
      }),
    ).toBe(4);
  });

  it('never returns a free round for a paid model', () => {
    expect(
      calculateAgentRoundCredits({
        completionPerMillion: 0.0001,
        promptPerMillion: 0.0001,
      }),
    ).toBe(1);
  });

  it('prices a frontier model above a budget model', () => {
    const budget = calculateAgentRoundCredits({
      completionPerMillion: 0.4,
      promptPerMillion: 0.1,
    });
    const frontier = calculateAgentRoundCredits({
      completionPerMillion: 75,
      promptPerMillion: 15,
    });

    expect(frontier).toBeGreaterThan(budget);
  });
});

describe('AGENT_CHAT_MODELS', () => {
  it('has no duplicate keys', () => {
    const keys = AGENT_CHAT_MODELS.map((model) => model.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('charges every hosted model at least one credit per round', () => {
    for (const model of AGENT_CHAT_MODELS.filter(
      (candidate) => !candidate.isSelfHosted,
    )) {
      expect(model.creditCostPerRound).toBeGreaterThanOrEqual(1);
    }
  });

  it('bills self-hosted models to the platform, not the round', () => {
    for (const model of AGENT_CHAT_MODELS.filter(
      (candidate) => candidate.isSelfHosted,
    )) {
      expect(model.creditCostPerRound).toBe(0);
    }
  });

  it('keeps self-hosted models out of the picker', () => {
    expect(
      SELECTABLE_AGENT_CHAT_MODELS.some((model) => model.isSelfHosted),
    ).toBe(false);
  });

  it('offers no auto-routing entry', () => {
    expect(
      AGENT_CHAT_MODELS.some((model) => model.key.startsWith('openrouter/')),
    ).toBe(false);
  });

  it('catalogues both defaults so they always have a price', () => {
    expect(getAgentChatModel(DEFAULT_AGENT_CHAT_MODEL_KEY)).toBeDefined();
    expect(getAgentChatModel(LOCAL_DEFAULT_AGENT_CHAT_MODEL_KEY)).toBeDefined();
    expect(getAgentChatModel(LOWEST_COST_AGENT_CHAT_MODEL_KEY)).toBeDefined();
  });
});

describe('resolveAgentChatModelKey', () => {
  it('maps every retired key onto a catalogued successor', () => {
    for (const retiredKey of Object.keys(RETIRED_AGENT_CHAT_MODELS)) {
      expect(
        getAgentChatModel(resolveAgentChatModelKey(retiredKey)),
      ).toBeDefined();
    }
  });

  it('retires openrouter auto onto the platform default', () => {
    expect(resolveAgentChatModelKey('openrouter/auto')).toBe(
      DEFAULT_AGENT_CHAT_MODEL_KEY,
    );
  });

  it('falls back to the default for a blank stored key', () => {
    expect(resolveAgentChatModelKey('   ')).toBe(DEFAULT_AGENT_CHAT_MODEL_KEY);
    expect(resolveAgentChatModelKey(null)).toBe(DEFAULT_AGENT_CHAT_MODEL_KEY);
  });

  it('leaves an uncatalogued key alone so a new provider model still runs', () => {
    expect(resolveAgentChatModelKey('vendor/brand-new')).toBe(
      'vendor/brand-new',
    );
  });

  it('trims stored whitespace', () => {
    expect(resolveAgentChatModelKey(' openrouter/auto ')).toBe(
      DEFAULT_AGENT_CHAT_MODEL_KEY,
    );
  });
});

describe('getAgentChatModelRoundCredits', () => {
  it('prices a retired key at its successor rate', () => {
    expect(getAgentChatModelRoundCredits('anthropic/claude-opus-4-6')).toBe(
      getAgentChatModelRoundCredits('anthropic/claude-opus-5'),
    );
  });

  it('falls back rather than billing an uncatalogued model as free', () => {
    expect(getAgentChatModelRoundCredits('vendor/brand-new')).toBe(
      AGENT_FALLBACK_ROUND_CREDITS,
    );
    expect(AGENT_FALLBACK_ROUND_CREDITS).toBeGreaterThan(0);
  });

  // A successor is chosen by price tier, not by brand. `x-ai/grok-4-fast`
  // ($0.20/$0.50) once pointed at Grok 4.5 ($2/$6) purely because it was the
  // only xAI row in the catalogue, which moved every stale binding onto a 10x
  // model. Pin the direction so a brand-match cannot creep back in.
  it('retires a budget model onto a budget successor, not its premium sibling', () => {
    expect(getAgentChatModelRoundCredits('x-ai/grok-4-fast')).toBeLessThan(
      getAgentChatModelRoundCredits(AGENT_CHAT_MODEL_KEYS.GROK_4_5),
    );
  });
});

describe('isRetiredAgentChatModel', () => {
  it('flags a retired key and clears a current one', () => {
    expect(isRetiredAgentChatModel('openrouter/auto')).toBe(true);
    expect(isRetiredAgentChatModel(DEFAULT_AGENT_CHAT_MODEL_KEY)).toBe(false);
  });
});
