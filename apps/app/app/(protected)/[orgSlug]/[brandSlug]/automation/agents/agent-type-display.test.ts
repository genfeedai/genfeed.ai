import { AgentType } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';
import {
  AGENT_TYPE_DEFAULTS,
  AGENT_TYPE_ICON_COMPONENTS,
  AGENT_TYPE_LABELS,
  AGENT_TYPE_OPTIONS,
  getAgentTypeIcon,
  getAgentTypeLabel,
} from './agent-type-display';

describe('agent-type-display', () => {
  it('covers every AgentType with a label, icon, and default budget', () => {
    for (const type of Object.values(AgentType)) {
      expect(AGENT_TYPE_LABELS[type].length).toBeGreaterThan(0);
      expect(AGENT_TYPE_ICON_COMPONENTS[type]).toBeTruthy();
      expect(AGENT_TYPE_DEFAULTS[type].defaultBudget).toBeGreaterThan(0);
      expect(AGENT_TYPE_DEFAULTS[type].platforms.length).toBeGreaterThan(0);
    }
  });

  it('exposes one option per AgentType and falls back for unknown values', () => {
    expect(AGENT_TYPE_OPTIONS).toHaveLength(Object.values(AgentType).length);
    expect(getAgentTypeLabel(AgentType.X_CONTENT)).toBe('X Content');
    expect(getAgentTypeLabel('not-a-type')).toBe('not-a-type');
    expect(getAgentTypeLabel(undefined)).toBe('');
    expect(getAgentTypeIcon(undefined)).toBe(
      AGENT_TYPE_ICON_COMPONENTS[AgentType.GENERAL],
    );
  });
});
