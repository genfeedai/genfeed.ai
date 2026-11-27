import {
  CONNECT_CLIENTS,
  getConnectClient,
} from './connect-genfeed-clients.helper';

describe('CONNECT_CLIENTS', () => {
  it('gives every client a unique id and shareable path', () => {
    expect(new Set(CONNECT_CLIENTS.map((entry) => entry.id)).size).toBe(
      CONNECT_CLIENTS.length,
    );
    expect(new Set(CONNECT_CLIENTS.map((entry) => entry.path)).size).toBe(
      CONNECT_CLIENTS.length,
    );
  });

  it.each([
    ['grok', 'Grok', ['grok']],
    ['meta-muse', 'Meta Muse', ['meta']],
  ] as const)(
    'gives the %s chat agent its own tab and mark',
    (id, label, marks) => {
      expect(CONNECT_CLIENTS.find((entry) => entry.id === id)).toMatchObject({
        label,
        marks,
      });
    },
  );

  it.each([
    ['claude-code', 'Claude'],
    ['codex', 'Codex'],
    ['generic', 'Other clients'],
  ] as const)(
    'labels the %s onboarding client from the same list',
    (client, label) => {
      expect(getConnectClient(client).label).toBe(label);
    },
  );
});
