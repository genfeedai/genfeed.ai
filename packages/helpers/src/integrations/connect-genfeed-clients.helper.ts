import type { ConnectGenfeedClient } from '@genfeedai/contracts/interfaces';

/** Official application marks Genfeed shows beside a client. */
export type ConnectClientMarkId = 'claude' | 'codex' | 'grok' | 'meta';

export type ConnectClientTabId =
  | 'agent-prompt'
  | 'chat-agent'
  | 'claude-chat'
  | 'claude-code'
  | 'codex'
  | 'other-clients';

export interface ConnectClientEntry {
  /** The setup the in-app Connect flow runs for this client; null where only the setup page covers it. */
  helperClient: ConnectGenfeedClient | null;
  id: ConnectClientTabId;
  label: string;
  marks: readonly ConnectClientMarkId[];
  /** Shareable route on the MCP setup page that opens this client. */
  path: string;
  /** One line under the client picker in the in-app Connect flow. */
  summary: string;
}

/**
 * The one list of MCP clients Genfeed documents: the MCP setup page, the in-app
 * Connect flow and the onboarding step all read it, so a label, a mark or a new
 * client changes in one place.
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
    helperClient: 'chat-agent',
    id: 'chat-agent',
    label: 'Muse & Grok Bot',
    marks: ['meta', 'grok'],
    path: '/muse-grok-bot',
    summary: 'Paste one prompt into the chat; the agent builds the connector.',
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

/** The clients the in-app Connect flow offers, in the setup page's order. */
export const CONNECT_FLOW_CLIENTS = CONNECT_CLIENTS.filter(
  (
    entry,
  ): entry is ConnectClientEntry & { helperClient: ConnectGenfeedClient } =>
    entry.helperClient !== null,
);

export function getConnectClient(
  client: ConnectGenfeedClient,
): ConnectClientEntry {
  const entry = CONNECT_CLIENTS.find((item) => item.helperClient === client);
  if (!entry) {
    throw new Error(`No Connect client entry for ${client}`);
  }
  return entry;
}
