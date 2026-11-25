import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { QualityTier, SpeedTier } from '..';
import {
  AGENT_CHAT_MODEL_KEYS,
  AGENT_CHAT_MODELS,
  AGENT_FALLBACK_ROUND_CREDITS,
  calculateAgentExactCredits,
  calculateAgentRoundCredits,
  DEFAULT_AGENT_CHAT_MODEL_KEY,
  DEFAULT_GROK_MODEL_KEY,
  getAgentChatModel,
  getAgentChatModelRoundCredits,
  isRetiredAgentChatModel,
  LLM_DEFAULTS,
  RETIRED_AGENT_CHAT_MODEL_KEYS,
} from './agent-chat-models.constant';
import { LOWEST_COST_AGENT_CHAT_MODEL_KEY } from './lowest-cost-models.constant';
import { MODEL_KEYS } from './model-keys.constant';

describe('calculateAgentExactCredits', () => {
  it('applies the operator multiplier once, defaulting to 2.0', () => {
    expect(calculateAgentExactCredits(0.01)).toBe(2);
    expect(calculateAgentExactCredits(0.01, 1.5)).toBe(1.5);
  });
});

describe('calculateAgentRoundCredits', () => {
  it('derives credits from list price, prompt and completion tokens both', () => {
    // 10K prompt @ $1/M + 2K completion @ $5/M = $0.02 → ×2.0 = $0.04 → 4 credits.
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

  it('assigns a quality and speed tier to every chat model', () => {
    for (const model of AGENT_CHAT_MODELS) {
      expect(Object.values(QualityTier)).toContain(model.qualityTier);
      expect(Object.values(SpeedTier)).toContain(model.speedTier);
    }
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

  it('retires the privacy-incompatible Nemotron free route', () => {
    expect(
      isRetiredAgentChatModel(AGENT_CHAT_MODEL_KEYS.NEMOTRON_3_ULTRA_FREE),
    ).toBe(true);
    expect(
      AGENT_CHAT_MODELS.some(
        (model) => model.key === AGENT_CHAT_MODEL_KEYS.NEMOTRON_3_ULTRA_FREE,
      ),
    ).toBe(false);
  });

  // Zero credits is a claim about the provider, never an accident of a
  // definition that shipped without prices. A hosted model rounds to zero only
  // when it is explicitly marked free.
  it('grants zero credits only to models declared free', () => {
    for (const model of AGENT_CHAT_MODELS.filter(
      (candidate) => candidate.creditCostPerRound === 0,
    )) {
      expect(model.isFree).toBe(true);
    }
  });

  it('uses the current low-cost DeepSeek tool model as the cloud fallback', () => {
    expect(DEFAULT_AGENT_CHAT_MODEL_KEY).toBe(
      AGENT_CHAT_MODEL_KEYS.DEEPSEEK_V4_1_FLASH,
    );
    expect(getAgentChatModel(DEFAULT_AGENT_CHAT_MODEL_KEY)).toMatchObject({
      creditCostPerRound: 1,
      pricing: { completionPerMillion: 0.6, promptPerMillion: 0.15 },
    });
  });

  it('retires the self-hosted local/ models instead of offering them', () => {
    for (const key of ['local/qwen-32b', 'local/mistral-small']) {
      expect(isRetiredAgentChatModel(key)).toBe(true);
      expect(getAgentChatModel(key)).toBeUndefined();
    }
  });

  it('offers explicit Auto and experimental Free routes with exact-cost metadata', () => {
    expect(
      getAgentChatModel(AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO),
    ).toMatchObject({ usesExactProviderCost: true });
    expect(
      getAgentChatModel(AGENT_CHAT_MODEL_KEYS.OPENROUTER_FREE),
    ).toMatchObject({ isFree: true, usesExactProviderCost: true });
  });

  it('catalogues the defaults so they always have a price', () => {
    expect(getAgentChatModel(DEFAULT_AGENT_CHAT_MODEL_KEY)).toBeDefined();
    expect(getAgentChatModel(LOWEST_COST_AGENT_CHAT_MODEL_KEY)).toBeDefined();
  });
});

describe('getAgentChatModel', () => {
  it('never maps a retired key onto another model', () => {
    for (const retiredKey of RETIRED_AGENT_CHAT_MODEL_KEYS) {
      expect(getAgentChatModel(retiredKey), retiredKey).toBeUndefined();
    }
  });

  it('keeps openrouter auto and the curated free router live', () => {
    expect(getAgentChatModel('openrouter/auto')?.key).toBe(
      AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO,
    );
    expect(getAgentChatModel('openrouter/free')?.key).toBe(
      AGENT_CHAT_MODEL_KEYS.OPENROUTER_FREE,
    );
  });

  it('has no model for a blank key', () => {
    expect(getAgentChatModel('   ')).toBeUndefined();
    expect(getAgentChatModel(null)).toBeUndefined();
  });

  it('trims stored whitespace', () => {
    expect(getAgentChatModel(' openrouter/auto ')?.key).toBe(
      AGENT_CHAT_MODEL_KEYS.OPENROUTER_AUTO,
    );
  });
});

describe('getAgentChatModelRoundCredits', () => {
  it('bills a retired key at the fallback rate, never free', () => {
    expect(getAgentChatModelRoundCredits('anthropic/claude-opus-4-6')).toBe(
      AGENT_FALLBACK_ROUND_CREDITS,
    );
  });

  it('falls back rather than billing an uncatalogued model as free', () => {
    expect(getAgentChatModelRoundCredits('vendor/brand-new')).toBe(
      AGENT_FALLBACK_ROUND_CREDITS,
    );
    expect(AGENT_FALLBACK_ROUND_CREDITS).toBeGreaterThan(0);
  });

  it('retires Grok 4 / 4.5 / 4.6 and keeps Grok 4.7 selectable', () => {
    expect(isRetiredAgentChatModel('x-ai/grok-4')).toBe(true);
    expect(isRetiredAgentChatModel('x-ai/grok-4.5')).toBe(true);
    expect(isRetiredAgentChatModel('x-ai/grok-4.6')).toBe(true);
    expect(
      AGENT_CHAT_MODELS.some(
        (model) => model.key === AGENT_CHAT_MODEL_KEYS.GROK_4_7,
      ),
    ).toBe(true);
    expect(
      AGENT_CHAT_MODELS.some((model) => model.key === 'x-ai/grok-4.5'),
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
  });

  it('points every picker-facing role at a catalogued model', () => {
    // grokFast, productTextFallback and contentWriting are deliberately not in
    // the agent chat picker: grokFast is the cheap X-drafts key,
    // productTextFallback is the posts, captions and prompt-enhancement model,
    // and contentWriting is the
    // prose model for articles, newsletters, captions and scripts.
    const NON_PICKER_ROLES = new Set([
      'contentWriting',
      'grokFast',
      'productTextFallback',
    ]);
    for (const [role, key] of Object.entries(LLM_DEFAULTS)) {
      if (NON_PICKER_ROLES.has(role)) {
        continue;
      }

      expect(getAgentChatModel(key), `${role} is not catalogued`).toBeDefined();
    }
  });

  it('keeps grokFast on the cheap xAI key, not the frontier picker row', () => {
    expect(LLM_DEFAULTS.grokFast).toBe(MODEL_KEYS.OPENROUTER_XAI_GROK_4_3);
    expect(LLM_DEFAULTS.grokFast).not.toBe(LLM_DEFAULTS.grok);
    expect(getAgentChatModel(LLM_DEFAULTS.grokFast)).toBeUndefined();
  });

  it('keeps contentWriting on Gemini 4 Neon, off the agent chat picker', () => {
    expect(LLM_DEFAULTS.contentWriting).toBe(
      MODEL_KEYS.OPENROUTER_GOOGLE_GEMINI_4_NEON,
    );
    expect(getAgentChatModel(LLM_DEFAULTS.contentWriting)).toBeUndefined();
  });

  it('keeps productTextFallback off the agent chat picker', () => {
    expect(LLM_DEFAULTS.productTextFallback).toBe(
      MODEL_KEYS.OPENROUTER_GOOGLE_GEMINI_4_HYDROGEN,
    );
    expect(getAgentChatModel(LLM_DEFAULTS.productTextFallback)).toBeUndefined();
  });
});

const constantsDir = fileURLToPath(new URL('./', import.meta.url));
const monorepoRoot = join(constantsDir, '../../..');

const LITERAL_ALLOWLIST = new Set([
  'packages/contracts/src/constants/agent-chat-models.constant.ts',
  'packages/contracts/src/constants/model-keys.constant.ts',
]);

const CATALOGUE_LITERALS = [
  ...Object.values(AGENT_CHAT_MODEL_KEYS),
  MODEL_KEYS.OPENROUTER_XAI_GROK_4_1_FAST,
  MODEL_KEYS.OPENROUTER_XAI_GROK_4_3,
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
