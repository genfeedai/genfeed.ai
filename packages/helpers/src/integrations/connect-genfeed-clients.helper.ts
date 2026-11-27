import type { ConnectGenfeedClient } from '@genfeedai/contracts/interfaces';

/** Official application marks Genfeed shows beside a client. */
export type ConnectClientMarkId = 'claude' | 'codex' | 'grok' | 'meta';

export type ConnectClientTabId =
  | 'agent-prompt'
  | 'claude-chat'
  | 'claude-code'
  | 'codex'
  | 'grok'
  | 'meta-muse'
  | 'other-clients';

export interface ConnectClientEntry {
  /** The client the onboarding step connects; null where only the setup guide covers it. */
  helperClient: ConnectGenfeedClient | null;
  id: ConnectClientTabId;
  label: string;
  marks: readonly ConnectClientMarkId[];
  /** Shareable route on the MCP setup page that opens this client. */
  path: string;
  /** One line under the client in the in-app picker. */
  summary: string;
}

/**
 * The one list of MCP clients Genfeed documents: the MCP setup page, the in-app
 * Connectors page and the onboarding step all read it, so a label, a mark or a
 * new client changes in one place.
 *
 * Claude Code and Claude & Cowork stay separate: the first registers the
 * server with `claude mcp add` and authorizes through `/mcp`, the second adds a
 * custom connector in the Claude UI. Both use the same full-access URL as every
 * other client.
 */
export const CONNECT_CLIENTS: readonly ConnectClientEntry[] = [
  {
    helperClient: 'claude-code',
    id: 'claude-code',
    label: 'Claude Code',
    marks: ['claude'],
    path: '/claude-code',
    summary: 'Register Genfeed, then authorize in your browser.',
  },
  {
    helperClient: null,
    id: 'claude-chat',
    label: 'Claude & Cowork',
    marks: ['claude'],
    path: '/claude-cowork',
    summary: 'Add Genfeed as a custom connector in Claude.',
  },
  {
    helperClient: 'codex',
    id: 'codex',
    label: 'Codex',
    marks: ['codex'],
    path: '/codex',
    summary: 'Browser authorization with CLI setup or config.toml.',
  },
  {
    helperClient: null,
    id: 'grok',
    label: 'Grok',
    marks: ['grok'],
    path: '/grok',
    summary: 'Paste one prompt into Grok; it builds the connector.',
  },
  {
    helperClient: null,
    id: 'meta-muse',
    label: 'Meta Muse',
    marks: ['meta'],
    path: '/meta-muse',
    summary: 'Paste one prompt into Muse; it builds the connector.',
  },
  {
    helperClient: 'generic',
    id: 'other-clients',
    label: 'Other clients',
    marks: [],
    path: '/other-clients',
    summary: 'Portable Streamable HTTP configuration.',
  },
  {
    helperClient: null,
    id: 'agent-prompt',
    label: 'Agent prompt',
    marks: [],
    path: '/agent-prompt',
    summary: 'Hand your local agent one setup prompt.',
  },
];

export function getConnectClient(
  client: ConnectGenfeedClient,
): ConnectClientEntry {
  const entry = CONNECT_CLIENTS.find((item) => item.helperClient === client);
  if (!entry) {
    throw new Error(`No Connect client entry for ${client}`);
  }
  return entry;
}
