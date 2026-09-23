import type {
  ConnectGenfeedClient,
  ConnectGenfeedInstructions,
} from '@genfeedai/contracts/interfaces';
import { buildConnectGenfeedInstructions } from '@genfeedai/helpers/integrations/connect-genfeed.helper';

/**
 * Hosted MCP endpoint the connect helper is called with on marketing pages.
 * Matches the helper's own fixtures. Do not read EnvironmentService.mcpEndpoint
 * here: off-cloud builds rewrite that to localhost, and the helper does not
 * emit a second URL or a `?profile=` query.
 */
export const GENFEED_PUBLIC_MCP_URL = 'https://mcp.genfeed.ai/mcp';

export const GENFEED_AGENT_REPOSITORY_URL =
  'https://github.com/genfeedai/agent';

export const GENFEED_MCP_DOCS_URL = 'https://docs.genfeed.ai/api-reference/mcp';

export const GENFEED_AUTH_DOCS_URL = 'https://genfeed.ai/auth.md';

export const AGENT_CLIENT_MANUAL_KEY_HEADING = 'Advanced: scoped API key';

export const AGENT_CLIENT_SLUGS = [
  'claude',
  'claude-code',
  'claude-cowork',
  'chatgpt',
  'codex',
  'cursor',
  'gemini',
  'openclaw',
  'grok',
] as const;

export type AgentClientSlug = (typeof AGENT_CLIENT_SLUGS)[number];

export interface AgentClientFaq {
  answer: string;
  question: string;
}

export interface AgentClientCommandBlock {
  label: string;
  value: string;
}

export interface AgentClient {
  connectUrl: string;
  description: string;
  faq: readonly AgentClientFaq[];
  helperClient: ConnectGenfeedClient;
  manualKey: ConnectGenfeedInstructions;
  name: string;
  oauth: ConnectGenfeedInstructions;
  preview: string;
  slug: AgentClientSlug;
  title: string;
}

export const AGENT_CLIENT_CAPABILITIES = [
  'Draft posts and hold them for review before anything publishes.',
  'Generate images and video from the same brand context.',
  'Schedule and publish to channels already connected in Genfeed.',
  'Read performance and run the workflows the account is allowed to use.',
] as const;

const HELPER_CLIENT: Record<AgentClientSlug, ConnectGenfeedClient> = {
  chatgpt: 'generic',
  claude: 'generic',
  'claude-code': 'claude-code',
  'claude-cowork': 'generic',
  codex: 'codex',
  cursor: 'generic',
  gemini: 'generic',
  grok: 'generic',
  openclaw: 'generic',
};

interface AgentClientCopy {
  description: string;
  extraFaq: readonly AgentClientFaq[];
  name: string;
  slug: AgentClientSlug;
}

function buildClient(copy: AgentClientCopy): AgentClient {
  const helperClient = HELPER_CLIENT[copy.slug];
  const oauth = buildConnectGenfeedInstructions(
    helperClient,
    GENFEED_PUBLIC_MCP_URL,
    'oauth',
  );
  const manualKey = buildConnectGenfeedInstructions(
    helperClient,
    GENFEED_PUBLIC_MCP_URL,
    'manual-key',
  );

  return {
    connectUrl: GENFEED_PUBLIC_MCP_URL,
    description: copy.description,
    faq: [
      {
        answer: oauth.authorizationInstruction,
        question: `How do I authorize ${copy.name}?`,
      },
      {
        answer: `Every client on this site uses the same hosted MCP endpoint: ${GENFEED_PUBLIC_MCP_URL}.`,
        question: 'What URL do I connect?',
      },
      ...copy.extraFaq,
      {
        answer: `The agent repository is ${GENFEED_AGENT_REPOSITORY_URL}. Connection, OAuth, API keys, and scopes are documented at ${GENFEED_MCP_DOCS_URL}.`,
        question: 'Where is the source and the setup guide?',
      },
    ],
    helperClient,
    manualKey,
    name: copy.name,
    oauth,
    preview: oauth.primaryCommand ?? oauth.configuration,
    slug: copy.slug,
    title: `Connect ${copy.name} to Genfeed`,
  };
}

const AGENT_CLIENT_COPY: readonly AgentClientCopy[] = [
  {
    description:
      'Connect Claude to Genfeed over the hosted MCP server. Approve OAuth in the browser, then draft, review, and schedule posts without leaving Claude.',
    extraFaq: [
      {
        answer:
          'No. Claude uses the generic remote MCP configuration on this page. Claude Code is the client with a dedicated install command.',
        question: 'Does Claude get its own install command?',
      },
    ],
    name: 'Claude',
    slug: 'claude',
  },
  {
    description:
      'Connect Claude Code to Genfeed with the documented MCP install command, approve OAuth in the browser, then return to the session and verify.',
    extraFaq: [
      {
        answer:
          'Run the verify command on this page after you return from the browser. If OAuth is unavailable, use the advanced manual-key path. The key stays in GENFEED_API_KEY and is not pasted into the command.',
        question: 'How do I know Claude Code is connected?',
      },
    ],
    name: 'Claude Code',
    slug: 'claude-code',
  },
  {
    description:
      'Connect Claude Cowork to Genfeed with the shared remote MCP server. Approve OAuth in the browser. Cowork has no separate install command.',
    extraFaq: [
      {
        answer:
          'No. Cowork uses the same hosted MCP URL and generic Streamable HTTP configuration as other clients that do not have a dedicated command.',
        question: 'Does Cowork use a different endpoint?',
      },
    ],
    name: 'Claude Cowork',
    slug: 'claude-cowork',
  },
  {
    description:
      'Connect ChatGPT to Genfeed through the hosted MCP server. Approve OAuth in the browser and use the generic Streamable HTTP configuration.',
    extraFaq: [
      {
        answer:
          'ChatGPT uses the generic remote MCP configuration from the connect helper, not a separate CLI.',
        question: 'Is there a ChatGPT install command?',
      },
    ],
    name: 'ChatGPT',
    slug: 'chatgpt',
  },
  {
    description:
      'Connect Codex to Genfeed with the documented MCP install command and TOML config. Approve OAuth in the browser, then verify the server is listed.',
    extraFaq: [
      {
        answer:
          'Yes. The configuration block on this page is the TOML the connect helper emits for Codex, next to the install command.',
        question: 'Where does the Codex config come from?',
      },
    ],
    name: 'Codex',
    slug: 'codex',
  },
  {
    description:
      'Connect Cursor to Genfeed through the hosted MCP server. Approve OAuth in the browser using the generic Streamable HTTP configuration.',
    extraFaq: [
      {
        answer:
          'Not in the connect helper. Cursor uses the generic Streamable HTTP configuration and browser OAuth.',
        question: 'Does Cursor have a separate CLI?',
      },
    ],
    name: 'Cursor',
    slug: 'cursor',
  },
  {
    description:
      'Connect Gemini to Genfeed through the hosted MCP server. Approve OAuth in the browser using the same remote configuration as other generic clients.',
    extraFaq: [
      {
        answer:
          'Yes. Gemini uses the same hosted MCP URL and generic configuration. Only Claude Code and Codex have client-specific commands.',
        question: 'Can Gemini use the same server as Claude?',
      },
    ],
    name: 'Gemini',
    slug: 'gemini',
  },
  {
    description:
      'Connect OpenClaw to Genfeed through the hosted MCP server. Approve OAuth in the browser using the generic Streamable HTTP configuration.',
    extraFaq: [
      {
        answer:
          'No. OpenClaw uses the generic remote MCP configuration and the same connect URL as every other client.',
        question: 'Is OpenClaw configured differently?',
      },
    ],
    name: 'OpenClaw',
    slug: 'openclaw',
  },
  {
    description:
      'Connect Grok to Genfeed through the hosted MCP server. Approve OAuth in the browser. Every client uses the same connect URL, with no profile query.',
    extraFaq: [
      {
        answer:
          'No. The connect helper emits one MCP URL for every client. Grok uses that URL with the generic Streamable HTTP configuration.',
        question: 'Does Grok add a profile query to the connect URL?',
      },
    ],
    name: 'Grok',
    slug: 'grok',
  },
];

export const agentClients: readonly AgentClient[] = AGENT_CLIENT_COPY.map(
  (copy) => buildClient(copy),
);

const clientsBySlug = new Map(
  agentClients.map((client) => [client.slug, client]),
);

export function getAgentClient(slug: AgentClientSlug): AgentClient {
  const client = clientsBySlug.get(slug);
  if (!client) {
    throw new Error(`Missing agent client page: ${slug}`);
  }
  return client;
}

export function getAllAgentClientSlugs(): AgentClientSlug[] {
  return agentClients.map((client) => client.slug);
}

export function getAgentClientCommandBlocks(
  client: AgentClient,
): readonly AgentClientCommandBlock[] {
  const blocks: AgentClientCommandBlock[] = [
    { label: 'Connect URL', value: client.connectUrl },
  ];

  if (client.oauth.primaryCommand) {
    blocks.push({
      label: 'Install command',
      value: client.oauth.primaryCommand,
    });
  }

  blocks.push({
    label: 'Configuration',
    value: client.oauth.configuration,
  });

  if (client.oauth.verifyCommand) {
    blocks.push({ label: 'Verify', value: client.oauth.verifyCommand });
  }

  return blocks;
}

export function getAgentClientManualBlocks(
  client: AgentClient,
): readonly AgentClientCommandBlock[] {
  const blocks: AgentClientCommandBlock[] = [];

  if (client.manualKey.environmentCommand) {
    blocks.push({
      label: 'Environment',
      value: client.manualKey.environmentCommand,
    });
  }

  if (client.manualKey.primaryCommand) {
    blocks.push({
      label: 'Install command',
      value: client.manualKey.primaryCommand,
    });
  }

  blocks.push({
    label: 'Configuration',
    value: client.manualKey.configuration,
  });

  if (client.manualKey.verifyCommand) {
    blocks.push({
      label: 'Verify',
      value: client.manualKey.verifyCommand,
    });
  }

  return blocks;
}

function pushCommand(lines: string[], label: string, value: string): void {
  lines.push(`**${label}**`);
  lines.push('');
  lines.push('```');
  lines.push(value);
  lines.push('```');
  lines.push('');
}

function pushClientInstall(
  lines: string[],
  client: AgentClient,
  includeManualKey: boolean,
): void {
  lines.push(`### ${client.name}`);
  lines.push('');
  lines.push(`- Page: https://genfeed.ai/${client.slug}`);
  lines.push(`- Connect URL: ${client.connectUrl}`);
  lines.push('');
  lines.push(client.oauth.authorizationInstruction);
  lines.push('');

  if (client.oauth.primaryCommand) {
    pushCommand(lines, 'Install command', client.oauth.primaryCommand);
  }

  pushCommand(lines, 'Configuration', client.oauth.configuration);

  if (client.oauth.verifyCommand) {
    pushCommand(lines, 'Verify', client.oauth.verifyCommand);
  }

  if (!includeManualKey) {
    return;
  }

  lines.push(`#### ${AGENT_CLIENT_MANUAL_KEY_HEADING}`);
  lines.push('');
  lines.push(client.manualKey.authorizationInstruction);
  lines.push('');

  for (const block of getAgentClientManualBlocks(client)) {
    pushCommand(lines, block.label, block.value);
  }
}

export function renderAgentConnectMarkdown(input: {
  includeManualKey: boolean;
  pricingSummary: string;
}): string {
  const lines: string[] = [];

  lines.push('## Connect an agent');
  lines.push('');
  lines.push(
    'Genfeed is the open-source AI operating system for content creation. Agents connect over MCP, draft and generate with review gates, and publish to connected channels.',
  );
  lines.push('');
  lines.push(`- MCP URL: ${GENFEED_PUBLIC_MCP_URL}`);
  lines.push(
    '- Auth: OAuth in the browser. The advanced path is a scoped API key exported as GENFEED_API_KEY.',
  );
  lines.push(`- Pricing: ${input.pricingSummary}`);
  lines.push(`- Agent repository: ${GENFEED_AGENT_REPOSITORY_URL}`);
  lines.push(`- MCP docs: ${GENFEED_MCP_DOCS_URL}`);
  lines.push(`- Auth guide: ${GENFEED_AUTH_DOCS_URL}`);
  lines.push('- Pricing page: https://genfeed.ai/pricing');
  lines.push('');
  lines.push(
    'Claude Code and Codex have client-specific install commands. Every other client uses the same connect URL and the generic Streamable HTTP configuration.',
  );
  lines.push('');

  for (const client of agentClients) {
    pushClientInstall(lines, client, input.includeManualKey);
  }

  return lines.join('\n');
}
