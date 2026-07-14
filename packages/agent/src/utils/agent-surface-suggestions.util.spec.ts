import { resolveBrandSurfaceSuggestions } from '@genfeedai/agent/utils/agent-surface-suggestions.util';
import type { IBrandAgentConfig } from '@genfeedai/interfaces';

const profile: IBrandAgentConfig = {
  prompting: {
    conversationStarters: [],
    seeds: [
      {
        angle: 'operator playbook',
        audience: 'startup operators',
        preferredFormats: ['carousel'],
        topic: 'AI workflows',
      },
    ],
  },
  strategy: {
    topics: ['AI workflows', 'content systems', 'brand consistency'],
  },
  voice: {
    audience: ['startup operators'],
    messagingPillars: ['proof over hype'],
    tone: 'direct',
  },
};

describe('resolveBrandSurfaceSuggestions', () => {
  it('returns exactly three brand-grounded conversation starters', () => {
    const suggestions = resolveBrandSurfaceSuggestions('/agent', profile);

    expect(suggestions).toHaveLength(3);
    expect(suggestions[0]?.prompt).toContain('AI workflows');
    expect(suggestions[0]?.prompt).toContain('startup operators');
    expect(
      suggestions.every((suggestion) => suggestion.prompt.length <= 220),
    ).toBe(true);
  });

  it('adapts the same profile to another prompt-bar surface', () => {
    const suggestions = resolveBrandSurfaceSuggestions('/calendar', profile);

    expect(suggestions).toHaveLength(3);
    expect(suggestions[0]?.prompt).toContain("next week's content");
    expect(suggestions[2]?.prompt).toContain('brand consistency');
  });

  it('falls back to existing hard-coded actions when no profile topics exist', () => {
    expect(resolveBrandSurfaceSuggestions('/agent', { voice: {} })).toEqual([]);
    expect(resolveBrandSurfaceSuggestions('/settings', profile)).toEqual([]);
  });
});
