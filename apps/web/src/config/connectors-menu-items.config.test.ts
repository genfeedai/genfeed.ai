import { describe, expect, it } from 'vitest';
import { CONNECTORS_MENU_ITEMS } from './connectors-menu-items.config';

describe('CONNECTORS_MENU_ITEMS', () => {
  it('lists every agent of the MCP setup page under Agents, then the other sections', () => {
    expect(
      CONNECTORS_MENU_ITEMS.map((item) => [item.group, item.label, item.href]),
    ).toEqual([
      ['Agents', 'Claude', '/connectors/agents'],
      ['Agents', 'Codex', '/connectors/agents?client=codex'],
      ['Agents', 'Grok', '/connectors/agents?client=grok'],
      ['Agents', 'Meta Muse', '/connectors/agents?client=meta-muse'],
      ['Agents', 'Other clients', '/connectors/agents?client=other-clients'],
      ['Agents', 'Agent prompt', '/connectors/agents?client=agent-prompt'],
      ['', 'AI providers', '/connectors/providers'],
      ['', 'API keys', '/connectors/api-keys'],
      ['', 'Webhooks', '/connectors/webhooks'],
    ]);
  });

  it('lights one agent row per client query', () => {
    expect(
      CONNECTORS_MENU_ITEMS.filter((item) => item.group === 'Agents').map(
        (item) => item.matchSearchParams,
      ),
    ).toEqual([
      { client: null },
      { client: 'codex' },
      { client: 'grok' },
      { client: 'meta-muse' },
      { client: 'other-clients' },
      { client: 'agent-prompt' },
    ]);
  });
});
