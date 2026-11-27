import { getAgentClientChannels } from '@data/agent-client-channels.data';
import { GENFEED_PUBLIC_MCP_URL } from '@data/agent-clients.data';
import { buildSoftwareApplicationJsonLd } from '@data/software-jsonld';

export const DEVELOPERS_PATH = '/developers';
export const DEVELOPERS_URL = `https://genfeed.ai${DEVELOPERS_PATH}`;

export const DEVELOPERS_TITLE =
  'Social Media API for Developers: REST, CLI, MCP';
export const DEVELOPERS_DESCRIPTION =
  'A social media API to draft, generate and schedule posts, images and video from REST, the CLI or MCP. Open source, with a hosted or self-hosted API.';

export const DOCS_ORIGIN = 'https://docs.genfeed.ai';
export const DOCS_API_URL = `${DOCS_ORIGIN}/api-reference`;
export const DOCS_REFERENCE_URL = `${DOCS_API_URL}/reference`;
export const DOCS_API_KEYS_URL = `${DOCS_API_URL}/api-keys`;
export const DOCS_CLI_URL = `${DOCS_API_URL}/cli`;
export const DOCS_MCP_URL = `${DOCS_API_URL}/mcp`;
export const DOCS_WEBHOOKS_URL = `${DOCS_API_URL}/webhooks`;

export const HOSTED_API_URL = 'https://api.genfeed.ai/v1';

/** The config block every MCP client accepts: the hosted endpoint. */
export const MCP_CONFIG_SNIPPET = `{
  "mcpServers": {
    "genfeed": {
      "url": "${GENFEED_PUBLIC_MCP_URL}"
    }
  }
}`;

export type QuickStartTabId = 'mcp' | 'cli' | 'rest';

export interface QuickStartBlock {
  label: string;
  value: string;
}

export interface QuickStartTab {
  /** What the call gives back, in words. */
  returns: string;
  /** What the response looks like, for the tabs that return a document. */
  response?: QuickStartBlock;
  blocks: readonly QuickStartBlock[];
  id: QuickStartTabId;
  label: string;
}

export const QUICK_START_TABS: readonly QuickStartTab[] = [
  {
    blocks: [
      {
        label: 'Add the server to any MCP client',
        value: MCP_CONFIG_SNIPPET,
      },
      {
        label: 'Then ask your agent',
        value:
          'Draft a LinkedIn post about this release and hold it for review.',
      },
    ],
    id: 'mcp',
    label: 'MCP',
    returns:
      'The agent calls generate_text, which saves a draft and returns its postId. Media comes from generate_media, which runs asynchronously: check_job until it finishes. Nothing publishes until you approve it.',
  },
  {
    blocks: [
      {
        label: 'Install and sign in',
        value: `bun add -g @genfeedai/cli
gf login -k gf_live_xxx`,
      },
      {
        label: 'Generate and hold a draft',
        value: `gf gen image "A launch poster for v2.4, flat colors" --json
gf publish <ingredientId> --platforms linkedin --status draft`,
      },
    ],
    id: 'cli',
    label: 'CLI',
    returns:
      'Every command takes --json for machine-readable output. Add --no-wait to get an ID back at once and poll it with gf status <id>.',
  },
  {
    blocks: [
      {
        label: 'Create a draft release with an API key',
        value: `curl -X POST ${HOSTED_API_URL}/post-groups \\
  -H "Authorization: Bearer $GENFEED_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "v2.4 release",
    "baseContent": "v2.4 ships webhooks for every publish.",
    "timezone": "Europe/Paris",
    "status": "draft",
    "targets": [{ "platform": "linkedin", "credentialId": "CREDENTIAL_ID" }]
  }'`,
      },
    ],
    id: 'rest',
    label: 'REST',
    response: {
      label: 'Response (trimmed)',
      value: `{
  "data": {
    "type": "release-group",
    "id": "...",
    "attributes": {
      "title": "v2.4 release",
      "status": "draft",
      "timezone": "Europe/Paris"
    }
  }
}`,
    },
    returns:
      'A release group with one target per channel, as a JSON:API document. The key needs the posts:draft scope; scheduling needs posts:schedule.',
  },
];

export interface CallGroup {
  /** The MCP tool that covers it. */
  mcp: string;
  cli?: string;
  description: string;
  docsHref: string;
  title: string;
}

export const CALL_GROUPS: readonly CallGroup[] = [
  {
    description: 'Read the brand, its voice and its connected accounts.',
    docsHref: DOCS_REFERENCE_URL,
    mcp: 'get_context',
    cli: 'gf brand',
    title: 'Brand context',
  },
  {
    description: 'Write post copy and articles in the brand voice.',
    docsHref: DOCS_REFERENCE_URL,
    mcp: 'generate_text',
    cli: 'gf gen article',
    title: 'Text',
  },
  {
    description:
      'Generate images, with your choice of model or automatic routing.',
    docsHref: DOCS_CLI_URL,
    mcp: 'generate_media',
    cli: 'gf gen image',
    title: 'Images',
  },
  {
    description: 'Generate short video from a brief or a still.',
    docsHref: DOCS_CLI_URL,
    mcp: 'generate_media',
    cli: 'gf gen video',
    title: 'Video',
  },
  {
    description: 'Voice and audio from the same media tool.',
    docsHref: DOCS_MCP_URL,
    mcp: 'generate_media',
    title: 'Voice',
  },
  {
    description: 'Save a post with its media and hold it for review.',
    docsHref: DOCS_REFERENCE_URL,
    mcp: 'save_post',
    cli: 'gf publish --status draft',
    title: 'Drafts',
  },
  {
    description: 'Schedule a release to one or more channels, then publish it.',
    docsHref: DOCS_REFERENCE_URL,
    mcp: 'schedule_release',
    cli: 'gf schedule',
    title: 'Scheduling and publishing',
  },
  {
    description: 'Read what worked: views, engagement, best posting times.',
    docsHref: DOCS_CLI_URL,
    mcp: 'get_insights',
    cli: 'gf performance',
    title: 'Analytics',
  },
  {
    description:
      'Signed events when a publish, a generation or a workflow run ends.',
    docsHref: DOCS_WEBHOOKS_URL,
    mcp: 'manage_workflow',
    title: 'Webhooks and workflows',
  },
];

export const SELF_HOST_COMMAND = 'npx @genfeedai/create my-genfeed';

const CHANNEL_NAMES = getAgentClientChannels().map((channel) => channel.name);

export interface DevelopersFaq {
  answer: string;
  question: string;
}

export const DEVELOPERS_FAQ: readonly DevelopersFaq[] = [
  {
    answer:
      'It is the REST API, the CLI and the MCP server of Genfeed. They draft and edit posts, generate images, video and voice, schedule and publish to your connected channels, and read analytics. All three act on the same brand, library and review queue.',
    question: 'What is the Genfeed social media API?',
  },
  {
    answer:
      'Create a key in your organization settings under API keys and pick a preset: MCP, Read or Content. Keys start with gf_live_, are shown once, and carry explicit scopes. Send the key as a bearer token.',
    question: 'How do I get an API key?',
  },
  {
    answer:
      'No, not by default. The MCP key preset is approval-first and leaves out direct publishing. On the REST API, drafting, scheduling, approving and publishing are separate scopes (posts:draft, posts:schedule, posts:approve, posts:publish), so a key can be limited to drafts. Auto-publish is a setting you switch on channel by channel.',
    question: 'Can my code publish without approval?',
  },
  {
    answer: `Genfeed publishes to ${CHANNEL_NAMES.join(', ')}. Each channel has its own page with what it accepts. Connect the account in Genfeed first; a channel that is not connected is not a valid target.`,
    question: 'Which channels can I publish to?',
  },
  {
    answer:
      'Yes. The code is AGPL-3.0, with the API, the MCP server, the CLI and the workflow engine in one repository. Run the Docker stack on your own infrastructure with your own provider keys and there is no Genfeed platform fee. Self-hosted instances have no Genfeed credits.',
    question: 'Is it open source, and can I self-host it?',
  },
  {
    answer:
      'On the hosted API you pay in credits for what you generate: pay as you go from $10, or a plan. Calls that only read, draft or schedule do not generate anything. Self-hosting has no platform fee; you pay your infrastructure and model providers.',
    question: 'What does it cost?',
  },
  {
    answer:
      'Use Genfeed from your agent instead. Connect Claude, ChatGPT, Codex or Cursor, then brief it in plain language. This page is for people who call Genfeed from their own code.',
    question: 'I use an agent and write no code. Is this page for me?',
  },
];

/** WebPage, SoftwareApplication, FAQPage and BreadcrumbList for the hub. */
export function buildDevelopersJsonLd() {
  const { '@context': _context, ...software } = buildSoftwareApplicationJsonLd(
    DEVELOPERS_DESCRIPTION,
  );

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        description: DEVELOPERS_DESCRIPTION,
        isPartOf: {
          '@type': 'WebSite',
          name: 'Genfeed',
          url: 'https://genfeed.ai',
        },
        name: DEVELOPERS_TITLE,
        url: DEVELOPERS_URL,
      },
      software,
      {
        '@type': 'FAQPage',
        mainEntity: DEVELOPERS_FAQ.map((item) => ({
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
            item: 'https://genfeed.ai',
            name: 'Genfeed',
            position: 1,
          },
          {
            '@type': 'ListItem',
            item: DEVELOPERS_URL,
            name: 'Developers',
            position: 2,
          },
        ],
      },
    ],
  };
}
