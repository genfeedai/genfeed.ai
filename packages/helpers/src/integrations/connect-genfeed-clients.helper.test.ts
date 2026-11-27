import {
  CONNECT_CLIENTS,
  CONNECT_FLOW_CLIENTS,
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

  it('offers the in-app flow exactly the clients it can set up', () => {
    expect(CONNECT_FLOW_CLIENTS.map((entry) => entry.helperClient)).toEqual([
      'claude-code',
      'codex',
      'chat-agent',
      'generic',
    ]);
  });

  it('labels the chat-agent client the way the setup page does', () => {
    expect(getConnectClient('chat-agent')).toMatchObject({
      label: 'Muse & Grok Bot',
      marks: ['meta', 'grok'],
    });
  });
});
