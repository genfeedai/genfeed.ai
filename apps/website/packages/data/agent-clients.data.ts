import {
  agentInstallations,
  buildCursorInstallUrl,
} from '@data/agent-installation.data';
import type {
  ConnectGenfeedClient,
  ConnectGenfeedInstructions,
} from '@genfeedai/contracts/interfaces';
import type { AgentInstallation } from '@genfeedai/contracts/interfaces/website/agent-installation.interface';
import {
  buildConnectGenfeedChatPrompt,
  buildConnectGenfeedInstructions,
} from '@genfeedai/helpers/integrations/connect-genfeed.helper';

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
  'grok-bot',
  'muse',
] as const;

export type AgentClientSlug = (typeof AGENT_CLIENT_SLUGS)[number];

export interface AgentClientFaq {
  answer: string;
  question: string;
}

export interface AgentClientChannel {
  name: string;
  slug: string;
}

export interface AgentClientCommandBlock {
  label: string;
  value: string;
}

export interface AgentClient {
  about: string;
  /** Paste-into-chat prompt for agents that build their own connector. */
  chatPrompt?: string;
  connectInstruction: string;
  connectUrl: string;
  description: string;
  faq: readonly AgentClientFaq[];
  helperClient: ConnectGenfeedClient;
  installation: AgentInstallation;
  /** First-party application mark, served locally instead of hotlinked. */
  logo: string;
  /** Chat agents only take OAuth; a pasted key would land in the chat log. */
  manualKey?: ConnectGenfeedInstructions;
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

export const AGENT_CLIENT_EXAMPLE_PROMPTS = [
  'Draft three LinkedIn posts from my latest blog article and hold them for review.',
  'Generate a vertical product video for TikTok and schedule it for Friday at 9am.',
  'Show last week’s best-performing posts across my connected channels.',
  'Turn this podcast transcript into an X thread and a YouTube Shorts script.',
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
  'grok-bot': 'generic',
  muse: 'generic',
  openclaw: 'generic',
};

const CLIENT_LOGOS = {
  chatgpt: '/agent-logos/openai.svg',
  claude: '/agent-logos/claude.svg',
  'claude-code': '/agent-logos/claude.svg',
  'claude-cowork': '/agent-logos/claude.svg',
  codex: '/agent-logos/openai.svg',
  cursor: '/agent-logos/cursor.svg',
  gemini: '/agent-logos/gemini.png',
  grok: '/agent-logos/grok.svg',
  'grok-bot': '/agent-logos/grok.svg',
  muse: '/agent-logos/meta.svg',
  openclaw: '/agent-logos/openclaw.svg',
} as const satisfies Record<AgentClientSlug, string>;

interface AgentClientCopy {
  about: string;
  description: string;
  extraFaq: readonly AgentClientFaq[];
  isChatConnector?: boolean;
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
  const isOAuthOnly =
    copy.isChatConnector ||
    ['chatgpt', 'claude', 'claude-cowork', 'grok'].includes(copy.slug);
  const installation: AgentInstallation = { ...agentInstallations[copy.slug] };
  if (copy.slug === 'cursor')
    installation.destination = buildCursorInstallUrl(GENFEED_PUBLIC_MCP_URL);
  const manualKey = isOAuthOnly
    ? undefined
    : buildConnectGenfeedInstructions(
        helperClient,
        GENFEED_PUBLIC_MCP_URL,
        'manual-key',
      );
  const chatPrompt = copy.isChatConnector
    ? buildConnectGenfeedChatPrompt(GENFEED_PUBLIC_MCP_URL)
    : undefined;
  const connectInstruction = installation.instruction;
  return {
    about: copy.about,
    chatPrompt,
    connectInstruction,
    connectUrl: GENFEED_PUBLIC_MCP_URL,
    description: copy.description,
    logo: CLIENT_LOGOS[copy.slug],
    faq: [
      {
        answer: connectInstruction,
        question: `How do I connect ${copy.name} to Genfeed?`,
      },
      {
        answer: copy.about,
        question: `What is ${copy.name}?`,
      },
      {
        answer: `Every client uses the same hosted MCP endpoint: ${GENFEED_PUBLIC_MCP_URL}.`,
        question: 'What URL do I connect?',
      },
      {
        answer: isOAuthOnly
          ? 'No. You approve OAuth in your browser. Never paste an API key or password into the chat.'
          : 'No. Browser OAuth is the default. A scoped API key is the advanced fallback for clients without OAuth, and it stays in the GENFEED_API_KEY environment variable.',
        question: `Do I need an API key to use Genfeed with ${copy.name}?`,
      },
      {
        answer: `No. ${copy.name} drafts posts and Genfeed holds them for review. You approve before anything publishes, unless you set up a workflow that publishes directly.`,
        question: `Can ${copy.name} publish without my approval?`,
      },
      ...copy.extraFaq,
      {
        answer:
          'Yes. Creating a Genfeed account is free. Generation and publishing follow your plan; see https://genfeed.ai/pricing.',
        question: 'Is it free to start?',
      },
      {
        answer: `The agent repository is ${GENFEED_AGENT_REPOSITORY_URL}. Connection, OAuth, API keys, and scopes are documented at ${GENFEED_MCP_DOCS_URL}.`,
        question: 'Where is the source and the setup guide?',
      },
    ],
    helperClient,
    installation,
    manualKey,
    name: copy.name,
    oauth,
    preview:
      chatPrompt ??
      installation.command ??
      oauth.primaryCommand ??
      GENFEED_PUBLIC_MCP_URL,
    slug: copy.slug,
    title: `Genfeed for ${copy.name}`,
  };
}

const AGENT_CLIENT_COPY: readonly AgentClientCopy[] = [
  {
    about:
      'Claude is Anthropic’s AI assistant on the web, desktop, and mobile. It can add a remote MCP server as a custom connector, so Genfeed tools work inside a normal Claude chat.',
    description:
      'Bring your brand, content library, and creative tools into Claude. Connect Genfeed to create images, video, and campaigns from one conversation.',
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
    about:
      'Claude Code is Anthropic’s agentic coding tool for the terminal and IDE. It adds a remote MCP server with one command, so the session that ships code can also draft, generate, and schedule posts.',
    description:
      'Add Genfeed’s creative tools to Claude Code. Install the plugin to access your brands, generate media, and prepare content alongside your code.',
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
    about:
      'Claude Cowork is Anthropic’s desktop agent for knowledge work outside the terminal. It uses the same remote MCP connectors as Claude, so Genfeed connects with the shared URL.',
    description:
      'Give Cowork access to your Genfeed workspace. Turn briefs, files, and research into on-brand content with a connected creative workflow.',
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
    about:
      'ChatGPT is OpenAI’s AI assistant. It can connect remote MCP servers, so Genfeed tools run from a ChatGPT conversation.',
    description:
      'Bring Genfeed into ChatGPT. Connect your brand context, generate images and video, and turn a conversation into content ready for review.',
    extraFaq: [
      {
        answer:
          'ChatGPT connects through a custom MCP app. Follow the ChatGPT setup on this page; account and workspace permissions determine availability.',
        question: 'Is there a ChatGPT install command?',
      },
    ],
    name: 'ChatGPT',
    slug: 'chatgpt',
  },
  {
    about:
      'Codex is OpenAI’s coding agent for the terminal and IDE. It reads MCP servers from ~/.codex/config.toml and adds them with codex mcp add.',
    description:
      'Give Codex a creative toolkit. Install Genfeed to work with your brands, generate campaign assets, and manage content from the same workspace.',
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
    about:
      'Cursor is an AI code editor. Its agent loads remote MCP servers, so Genfeed tools sit next to your code.',
    description:
      'Bring Genfeed’s creative tools into Cursor. Add the connector to access brand context, generate media, and prepare launch content in your editor.',
    extraFaq: [
      {
        answer:
          'Use Add to Cursor to open the native connector installation flow, then complete browser OAuth. You can also add the server manually in Cursor MCP settings.',
        question: 'Does Cursor have a separate CLI?',
      },
    ],
    name: 'Cursor',
    slug: 'cursor',
  },
  {
    about:
      'Gemini is Google’s AI model family, available in the Gemini app and Gemini CLI. Gemini clients that support remote MCP servers connect to Genfeed with the shared URL.',
    description:
      'Extend Gemini CLI with Genfeed. Install the extension to bring brand context, media generation, and content workflows into your terminal.',
    extraFaq: [
      {
        answer:
          'Install the Genfeed extension in Gemini CLI with the command on this page. It includes the playbook and connects to the same hosted MCP server.',
        question: 'Can Gemini use the same server as Claude?',
      },
    ],
    name: 'Gemini',
    slug: 'gemini',
  },
  {
    about:
      'OpenClaw is an open-source personal AI agent you run yourself. It loads remote MCP servers, so Genfeed tools are available wherever OpenClaw already listens.',
    description:
      'Connect your OpenClaw agent to Genfeed. Add the playbook and creative tools for brand-aware media, content, and repeatable workflows.',
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
    about:
      'Grok is xAI’s AI assistant. It supports remote MCP servers, so Genfeed tools can run from a Grok conversation.',
    description:
      'Connect Grok to your Genfeed workspace. Explore your brands, generate media, and develop campaigns from one conversation.',
    extraFaq: [
      {
        answer:
          'No. Grok is the chat assistant. Grok Bot is the always-on teammate with its own cloud computer and has its own page at https://genfeed.ai/grok-bot. Both use the same MCP URL.',
        question: 'Is Grok the same as Grok Bot?',
      },
    ],
    name: 'Grok',
    slug: 'grok',
  },
  {
    about:
      'Grok Bot is the always-on AI teammate from xAI and Cursor. Each Bot runs on its own cloud computer and uses plugins and remote MCP servers, so routines keep running while you are offline.',
    description:
      'Give Grok Bot a connected creative workspace. Use Genfeed’s brand context and media tools in the routines you already run.',
    extraFaq: [
      {
        answer:
          'Yes. Ask the Bot to turn a request into a routine. Each run drafts in Genfeed and holds posts for your review, so nothing publishes while you are away unless you allow it.',
        question: 'Can Grok Bot post on a schedule?',
      },
      {
        answer:
          'No. Grok is xAI’s chat assistant (https://genfeed.ai/grok). Grok Bot is the always-on teammate that runs routines on its own cloud computer.',
        question: 'Is Grok Bot the same as Grok?',
      },
    ],
    isChatConnector: true,
    name: 'Grok Bot',
    slug: 'grok-bot',
  },
  {
    about:
      'Meta Muse is Meta’s personal AI agent. It completes tasks through connectors and can build a custom connector from a remote MCP server URL you give it in chat. It is separate from Meta AI, the assistant inside Facebook, Instagram, and Messenger.',
    description:
      'Bring Genfeed into Meta Muse. Connect once to work with your brands, generate creative assets, and prepare campaigns from a conversation.',
    extraFaq: [
      {
        answer:
          'Not yet. Genfeed connects as a Muse custom connector. Paste the prompt on this page into a Muse chat and approve the sign-in link it sends back.',
        question: 'Is Genfeed in the Muse connector directory?',
      },
      {
        answer:
          'No. Meta AI is the assistant inside Facebook, Instagram, and Messenger. Meta Muse is the separate agent that takes actions through connectors.',
        question: 'Is Meta Muse the same as Meta AI?',
      },
    ],
    isChatConnector: true,
    name: 'Meta Muse',
    slug: 'muse',
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
  const blocks: AgentClientCommandBlock[] = [];

  if (client.chatPrompt) {
    blocks.push({
      label: `Paste into ${client.name}`,
      value: client.chatPrompt,
    });
  }

  if (client.installation.command) {
    blocks.push({
      label: client.installation.method,
      value: client.installation.command,
    });
  }

  blocks.push({ label: 'Connect URL', value: client.connectUrl });

  if (client.oauth.primaryCommand) {
    blocks.push({
      label: 'Install command',
      value: client.oauth.primaryCommand,
    });
  }

  if (!client.chatPrompt && (client.oauth.primaryCommand || client.manualKey)) {
    blocks.push({
      label: 'Configuration',
      value: client.oauth.configuration,
    });
  }

  if (client.oauth.verifyCommand) {
    blocks.push({ label: 'Verify', value: client.oauth.verifyCommand });
  }

  return blocks;
}

export function getAgentClientManualBlocks(
  client: AgentClient,
): readonly AgentClientCommandBlock[] {
  const { manualKey } = client;
  if (!manualKey) {
    return [];
  }

  const blocks: AgentClientCommandBlock[] = [];

  if (manualKey.environmentCommand) {
    blocks.push({
      label: 'Environment',
      value: manualKey.environmentCommand,
    });
  }

  if (manualKey.primaryCommand) {
    blocks.push({
      label: 'Install command',
      value: manualKey.primaryCommand,
    });
  }

  blocks.push({
    label: 'Configuration',
    value: manualKey.configuration,
  });

  if (manualKey.verifyCommand) {
    blocks.push({
      label: 'Verify',
      value: manualKey.verifyCommand,
    });
  }

  return blocks;
}

export function buildAgentClientJsonLd(client: AgentClient, url: string) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        about: {
          '@type': 'SoftwareApplication',
          applicationCategory: 'BusinessApplication',
          name: 'Genfeed MCP Server',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          operatingSystem: 'Web',
          url: GENFEED_PUBLIC_MCP_URL,
        },
        description: client.description,
        isPartOf: {
          '@type': 'WebSite',
          name: 'Genfeed',
          url: 'https://genfeed.ai',
        },
        name: client.title,
        url,
      },
      {
        '@type': 'HowTo',
        name: `How to connect ${client.name} to Genfeed`,
        step: getAgentClientCommandBlocks(client).map((block, index) => ({
          '@type': 'HowToStep',
          name: block.label,
          position: index + 1,
          text: block.value,
        })),
      },
      {
        '@type': 'FAQPage',
        mainEntity: client.faq.map((item) => ({
          '@type': 'Question',
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
          name: item.question,
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            item: 'https://genfeed.ai/agent',
            name: 'Genfeed Agent',
            position: 1,
          },
          { '@type': 'ListItem', item: url, name: client.name, position: 2 },
        ],
      },
    ],
  };
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
  lines.push(client.connectInstruction);
  lines.push('');

  for (const block of getAgentClientCommandBlocks(client)) {
    if (block.label === 'Connect URL') {
      continue;
    }
    pushCommand(lines, block.label, block.value);
  }

  if (!includeManualKey || !client.manualKey) {
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
    'Genfeed is an open-source content agent. Agents connect over MCP, draft and generate with review gates, and publish to connected channels.',
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
    'Claude Code and Codex offer packaged plugins; Gemini CLI offers an extension. Cursor has a native MCP install link. ChatGPT, Claude, Cowork, and Grok use custom OAuth connectors. Meta Muse and Grok Bot connect from a pasted chat prompt. OpenClaw needs the playbook and a separately configured connector.',
  );
  lines.push('');

  for (const client of agentClients) {
    pushClientInstall(lines, client, input.includeManualKey);
  }

  return lines.join('\n');
}
