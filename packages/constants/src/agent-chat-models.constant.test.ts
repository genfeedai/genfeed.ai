import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AGENT_CHAT_MODEL_KEYS,
  AGENT_CHAT_MODELS,
  AGENT_FALLBACK_ROUND_CREDITS,
  calculateAgentRoundCredits,
  DEFAULT_AGENT_CHAT_MODEL_KEY,
  DEFAULT_GROK_MODEL_KEY,
  getAgentChatModel,
  getAgentChatModelRoundCredits,
  isRetiredAgentChatModel,
  LLM_DEFAULTS,
  LOCAL_DEFAULT_AGENT_CHAT_MODEL_KEY,
  RETIRED_AGENT_CHAT_MODELS,
  resolveAgentChatModelKey,
  SELECTABLE_AGENT_CHAT_MODELS,
} from './agent-chat-models.constant';
import { LOWEST_COST_AGENT_CHAT_MODEL_KEY } from './lowest-cost-models.constant';
import { MODEL_KEYS } from './model-keys.constant';

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

  it('charges every paid hosted model at least one credit per round', () => {
    for (const model of AGENT_CHAT_MODELS.filter(
      (candidate) =>
        !candidate.isSelfHosted &&
        (candidate.pricing.promptPerMillion > 0 ||
          candidate.pricing.completionPerMillion > 0),
    )) {
      expect(model.creditCostPerRound).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps the free tier at zero credits', () => {
    expect(
      getAgentChatModel(AGENT_CHAT_MODEL_KEYS.NEMOTRON_3_ULTRA_FREE)
        ?.creditCostPerRound,
    ).toBe(0);
  });

  // Zero credits is a claim about the provider, never an accident of a
  // definition that shipped without prices. A hosted model rounds to zero only
  // when it is explicitly marked free.
  it('grants zero credits only to models declared free or self-hosted', () => {
    for (const model of AGENT_CHAT_MODELS.filter(
      (candidate) => candidate.creditCostPerRound === 0,
    )) {
      expect(Boolean(model.isFree || model.isSelfHosted)).toBe(true);
    }
  });

  it('declares the pinned free default free', () => {
    expect(
      getAgentChatModel(AGENT_CHAT_MODEL_KEYS.NEMOTRON_3_ULTRA_FREE)?.isFree,
    ).toBe(true);
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

  it('offers explicit Auto and experimental Free routes with exact-cost metadata', () => {
    expect(
      getAgentChatModel(AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO),
    ).toMatchObject({ usesExactProviderCost: true });
    expect(
      getAgentChatModel(AGENT_CHAT_MODEL_KEYS.OPENROUTER_FREE),
    ).toMatchObject({ isFree: true, usesExactProviderCost: true });
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

  it('keeps openrouter auto live', () => {
    expect(resolveAgentChatModelKey('openrouter/auto')).toBe(
      AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO,
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
      AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO,
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
      getAgentChatModelRoundCredits(AGENT_CHAT_MODEL_KEYS.GROK_4_6),
    );
  });

  it('promotes retired Grok 4 / 4.5 bindings onto Grok 4.6', () => {
    expect(resolveAgentChatModelKey('x-ai/grok-4')).toBe(
      AGENT_CHAT_MODEL_KEYS.GROK_4_6,
    );
    expect(resolveAgentChatModelKey('x-ai/grok-4.5')).toBe(
      AGENT_CHAT_MODEL_KEYS.GROK_4_6,
    );
    expect(
      SELECTABLE_AGENT_CHAT_MODELS.some(
        (model) => model.key === AGENT_CHAT_MODEL_KEYS.GROK_4_6,
      ),
    ).toBe(true);
    expect(
      SELECTABLE_AGENT_CHAT_MODELS.some(
        (model) => model.key === 'x-ai/grok-4.5',
      ),
    ).toBe(false);
  });
});

describe('isRetiredAgentChatModel', () => {
  it('flags a retired key and clears a current one', () => {
    expect(isRetiredAgentChatModel('openrouter/auto')).toBe(false);
    expect(isRetiredAgentChatModel('openrouter/auto-beta')).toBe(true);
    expect(isRetiredAgentChatModel(DEFAULT_AGENT_CHAT_MODEL_KEY)).toBe(false);
  });
});

describe('LLM_DEFAULTS', () => {
  it('aliases the historical default exports', () => {
    expect(DEFAULT_AGENT_CHAT_MODEL_KEY).toBe(LLM_DEFAULTS.agentChat);
    expect(DEFAULT_GROK_MODEL_KEY).toBe(LLM_DEFAULTS.grok);
    expect(LOCAL_DEFAULT_AGENT_CHAT_MODEL_KEY).toBe(LLM_DEFAULTS.localFleet);
  });

  it('points every picker-facing role at a catalogued model', () => {
    for (const [role, key] of Object.entries(LLM_DEFAULTS)) {
      if (role === 'grokFast') {
        continue;
      }

      expect(getAgentChatModel(key), `${role} is not catalogued`).toBeDefined();
    }
  });

  it('keeps grokFast on the cheap xAI key, not the frontier picker row', () => {
    expect(LLM_DEFAULTS.grokFast).toBe(MODEL_KEYS.OPENROUTER_XAI_GROK_4_1_FAST);
    expect(LLM_DEFAULTS.grokFast).not.toBe(LLM_DEFAULTS.grok);
    expect(getAgentChatModel(LLM_DEFAULTS.grokFast)).toBeUndefined();
  });
});

const constantsDir = fileURLToPath(new URL('./', import.meta.url));
const monorepoRoot = join(constantsDir, '../../..');

const LITERAL_ALLOWLIST = new Set([
  'packages/constants/src/agent-chat-models.constant.ts',
  'packages/constants/src/model-keys.constant.ts',
]);

const CATALOGUE_LITERALS = [
  ...Object.values(AGENT_CHAT_MODEL_KEYS),
  MODEL_KEYS.OPENROUTER_XAI_GROK_4_1_FAST,
];

function walkProductionTsFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }

  for (const name of entries) {
    if (
      name === 'node_modules' ||
      name === 'dist' ||
      name === '.next' ||
      name === 'coverage' ||
      name === 'scripts' ||
      name === 'playwright' ||
      name === '.agents' ||
      name === '.turbo' ||
      name === 'generated' ||
      name === 'build' ||
      name === 'release'
    ) {
      continue;
    }

    const full = join(dir, name);
    let st: ReturnType<typeof lstatSync>;
    try {
      st = lstatSync(full);
    } catch {
      continue;
    }

    // Never follow symlinks — CI and local agent scratch both plant
    // machine-local links that either dangle or explode the walk.
    if (st.isSymbolicLink()) {
      continue;
    }

    if (st.isDirectory()) {
      walkProductionTsFiles(full, out);
      continue;
    }

    if (
      (name.endsWith('.ts') || name.endsWith('.tsx')) &&
      !name.includes('.spec.') &&
      !name.includes('.test.')
    ) {
      out.push(full);
    }
  }

  return out;
}

function findForbiddenModelLiterals(source: string): string[] {
  const hits: string[] = [];

  for (const key of CATALOGUE_LITERALS) {
    if (source.includes(`'${key}'`) || source.includes(`"${key}"`)) {
      hits.push(key);
    }
  }

  const grokLiterals = source.match(/['"]x-ai\/grok-[^'"]+['"]/g);
  if (grokLiterals) {
    hits.push(...grokLiterals);
  }

  if (/XAI_MODEL\s*\|\|\s*['"]/.test(source)) {
    hits.push("XAI_MODEL || '…'");
  }

  return [...new Set(hits)];
}

describe('LLM default centralization ratchet', () => {
  it('does not copy catalogue model ids into production providers', () => {
    const offenders: string[] = [];

    for (const root of ['apps', 'packages']) {
      for (const file of walkProductionTsFiles(join(monorepoRoot, root))) {
        const relative = file.replace(`${monorepoRoot}/`, '');
        if (LITERAL_ALLOWLIST.has(relative)) {
          continue;
        }

        const hits = findForbiddenModelLiterals(readFileSync(file, 'utf8'));
        for (const hit of hits) {
          offenders.push(`${relative} → ${hit}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  }, 30_000);
});
