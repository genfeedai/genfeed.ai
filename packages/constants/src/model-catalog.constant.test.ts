import { ModelCategory } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import { SELECTABLE_AGENT_CHAT_MODELS } from './agent-chat-models.constant';
import {
  AGENT_CHAT_CAPABILITY,
  UNIFIED_MODEL_CATALOG,
} from './model-catalog.constant';

describe('UNIFIED_MODEL_CATALOG', () => {
  it('includes media and agent chat models with unique keys', () => {
    expect(UNIFIED_MODEL_CATALOG.length).toBeGreaterThan(50);

    const keys = UNIFIED_MODEL_CATALOG.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('seeds selectable agent models as active TEXT with agent-chat capability', () => {
    const agentRows = UNIFIED_MODEL_CATALOG.filter((entry) =>
      entry.capabilities?.includes(AGENT_CHAT_CAPABILITY),
    );

    expect(agentRows.length).toBeGreaterThanOrEqual(
      SELECTABLE_AGENT_CHAT_MODELS.length,
    );
    expect(
      agentRows.every(
        (entry) =>
          entry.category === ModelCategory.TEXT && entry.isActive === true,
      ),
    ).toBe(true);
  });

  it('includes image and video categories for settings filters', () => {
    const categories = new Set(
      UNIFIED_MODEL_CATALOG.map((entry) => entry.category),
    );
    expect(categories.has(ModelCategory.IMAGE)).toBe(true);
    expect(categories.has(ModelCategory.VIDEO)).toBe(true);
    expect(categories.has(ModelCategory.TEXT)).toBe(true);
  });
});
