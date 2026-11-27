import {
  type AgentClientChannelSlug,
  getAgentClientChannelCopy,
} from '@data/agent-client-channels.data';
import { agentClients, GENFEED_PUBLIC_MCP_URL } from '@data/agent-clients.data';
import { getIntegrationBySlug } from '@data/integrations.data';
import { fitDescription } from '@data/seo-copy';
import {
  type ChannelCapability,
  type ChannelMediaKind,
  getChannelCapability,
} from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';

/**
 * Channels that get an `/mcp/<channel>` page, in build order: the channels
 * people search an MCP server for, and only channels the scheduler lists as
 * `supported`. Threads and Bluesky draw almost no searches; Reddit and
 * Pinterest are hidden in `channel-capabilities.contract.ts`, so no page
 * promises them. `mcp-channels.data.test.ts` fails if a slug here stops being
 * supported.
 */
export const MCP_CHANNEL_SLUGS = [
  'linkedin',
  'instagram',
  'youtube',
  'x-twitter',
  'tiktok',
  'facebook',
] as const satisfies readonly AgentClientChannelSlug[];

export type McpChannelSlug = (typeof MCP_CHANNEL_SLUGS)[number];

export function isMcpChannelSlug(slug: string): slug is McpChannelSlug {
  return (MCP_CHANNEL_SLUGS as readonly string[]).includes(slug);
}

/** The scheduler's own platform key for each page. */
const PLATFORM: Record<McpChannelSlug, string> = {
  facebook: 'facebook',
  instagram: 'instagram',
  linkedin: 'linkedin',
  tiktok: 'tiktok',
  'x-twitter': 'twitter',
  youtube: 'youtube',
};

/** The finished example under each channel: a clip for video-first channels. */
const PROOF_FORMAT: Record<McpChannelSlug, 'Images' | 'Short-form video'> = {
  facebook: 'Images',
  instagram: 'Short-form video',
  linkedin: 'Images',
  tiktok: 'Short-form video',
  'x-twitter': 'Images',
  youtube: 'Short-form video',
};

/** Limits the scheduler contract cannot state, written once per channel. */
const EXTRA_LIMITS: Partial<Record<McpChannelSlug, readonly string[]>> = {
  instagram: ['Publishing needs a professional Instagram account.'],
  linkedin: [
    'Posts go out as the person who connected the account, not as a company page. Company page posting is not available yet.',
  ],
  youtube: [
    'Every upload carries an explicit visibility setting, so a draft never goes public by default.',
  ],
};

const MEDIA_KIND_LABEL: Record<ChannelMediaKind, string> = {
  carousel: 'carousels',
  image: 'images',
  link: 'links',
  short_video: 'short video',
  video: 'video',
};

const TRAILING_S = /s$/;

/** "Posts" becomes "post"; "Videos" becomes "video". */
export function singularNoun(noun: string): string {
  return noun.toLowerCase().replace(TRAILING_S, '');
}

export interface McpChannelFaq {
  answer: string;
  question: string;
}

export interface McpChannelPage {
  /** What an agent can do on the channel, from the scheduler contract. */
  canDo: readonly string[];
  channelSlug: McpChannelSlug;
  description: string;
  faq: readonly McpChannelFaq[];
  /** What it cannot do, from the scheduler contract and the notes above. */
  limits: readonly string[];
  name: string;
  noun: string;
  prompts: readonly string[];
  proofFormat: 'Images' | 'Short-form video';
  title: string;
}

function readCapability(slug: McpChannelSlug): ChannelCapability {
  const capability = getChannelCapability(PLATFORM[slug]);

  if (!capability || capability.status !== 'supported') {
    throw new Error(`No supported channel capability for MCP page: ${slug}`);
  }

  return capability;
}

function joinWords(words: readonly string[]): string {
  if (words.length <= 1) {
    return words.join('');
  }

  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

function describeMedia(capability: ChannelCapability): string {
  const kinds = joinWords(
    capability.media.kinds.map((kind) => MEDIA_KIND_LABEL[kind]),
  );
  const { images, maxItems, minItems } = capability.media;
  const count =
    maxItems === 1
      ? 'One media item per post.'
      : `Up to ${maxItems} media items per post.`;
  const requirement = minItems > 0 ? ' A post needs media.' : '';
  const imageSet =
    images && images.minItems > 1
      ? ` An image post takes ${images.minItems} to ${images.maxItems} images.`
      : '';

  return `Supports ${kinds}. ${count}${requirement}${imageSet}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function describeCaption(capability: ChannelCapability): string {
  const { extendedMaxLength, maxHashtags, maxLength, required } =
    capability.caption;
  const length = extendedMaxLength
    ? `Captions run to ${maxLength.toLocaleString('en-US')} characters, and to ${extendedMaxLength.toLocaleString('en-US')} where the account allows long posts.`
    : `Captions run to ${maxLength.toLocaleString('en-US')} characters.`;
  const hashtags = maxHashtags ? ` At most ${maxHashtags} hashtags.` : '';
  const need = required ? ' A caption is required.' : '';

  return `${length}${hashtags}${need}`;
}

export function buildMcpChannelPage(slug: McpChannelSlug): McpChannelPage {
  const capability = readCapability(slug);
  const integration = getIntegrationBySlug(slug);

  if (!integration) {
    throw new Error(`Missing integration for MCP page: ${slug}`);
  }

  const name = integration.name;
  const { noun, prompts } = getAgentClientChannelCopy(slug);
  const lowerNoun = noun.toLowerCase();
  const singular = singularNoun(noun);
  const modes = new Set(capability.publishModes);
  const canDo = [
    modes.has('draft') ? `Draft a ${singular} and hold it for review.` : '',
    modes.has('scheduled') ? `Schedule an approved ${singular}.` : '',
    modes.has('publish_now') ? `Publish an approved ${singular} now.` : '',
    `Generate the ${singular}'s media from your brand context.`,
    `Read how published ${lowerNoun} performed.`,
  ].filter(Boolean);
  const limits = [
    describeMedia(capability),
    describeCaption(capability),
    capability.media.animated.supported
      ? ''
      : (capability.media.animated.consequence ?? ''),
    ...(EXTRA_LIMITS[slug] ?? []),
  ].filter(Boolean);
  const clientNames = joinWords(agentClients.map((client) => client.name));

  return {
    canDo,
    channelSlug: slug,
    description: fitDescription(
      `Connect ${name} to your agent over MCP. Draft, schedule and publish ${lowerNoun}, generate media and read results. Every ${singular} waits for your approval.`,
      `Connect ${name} to your agent over MCP to draft, schedule and publish ${lowerNoun}. Every ${singular} waits for your approval before it goes out.`,
    ),
    faq: [
      {
        answer: `It is Genfeed's MCP server, used for ${name}. It gives an agent tools to draft, schedule and publish ${lowerNoun}, generate media from your brand context and read results. One server covers every channel; this page covers what it does on ${name}.`,
        question: `What is the ${name} MCP server?`,
      },
      {
        answer: `No. Genfeed holds each ${singular} for your review. Nothing goes to ${name} until you approve it, unless you switch on auto-publish for the channel or set up a workflow that publishes.`,
        question: `Can my agent post to ${name} without my approval?`,
      },
      {
        answer: `${clientNames}, or any client that speaks Streamable HTTP MCP. Claude uses the content connector for drafts, scheduling and analytics; clients on the standard MCP connector can also generate media.`,
        question: `Which agents work with ${name}?`,
      },
      {
        answer: limits.join(' '),
        question: `What are the limits on ${name}?`,
      },
      {
        answer: `No. You connect ${name} in Genfeed once by signing in. Your agent reaches Genfeed over MCP with browser sign-in and never sees your ${name} credentials.`,
        question: `Do I need a ${name} API key?`,
      },
    ],
    limits,
    name,
    noun,
    prompts,
    proofFormat: PROOF_FORMAT[slug],
    title: `${name} MCP Server: Draft and Schedule`,
  };
}

export const MCP_CLAUDE_CODE_COMMAND = `claude mcp add --transport http genfeed --scope user ${GENFEED_PUBLIC_MCP_URL}`;

export function buildMcpChannelJsonLd(page: McpChannelPage, url: string) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        description: page.description,
        isPartOf: {
          '@type': 'WebSite',
          name: 'Genfeed',
          url: 'https://genfeed.ai',
        },
        name: page.title,
        url,
      },
      {
        '@type': 'HowTo',
        name: `How to post to ${page.name} from your agent`,
        step: [
          {
            name: 'Connect the MCP server',
            text: `Add ${GENFEED_PUBLIC_MCP_URL} to your agent and sign in.`,
          },
          {
            name: `Connect ${page.name}`,
            text: `Connect your ${page.name} account in Genfeed once.`,
          },
          { name: 'Ask your agent', text: page.prompts[0] },
          {
            name: 'Review and schedule',
            text: `Approve the ${singularNoun(page.noun)} in Genfeed, then schedule or publish it.`,
          },
        ].map((step, index) => ({
          '@type': 'HowToStep',
          position: index + 1,
          ...step,
        })),
      },
      {
        '@type': 'FAQPage',
        mainEntity: page.faq.map((item) => ({
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
            item: 'https://genfeed.ai/mcp',
            name: 'MCP server',
            position: 1,
          },
          { '@type': 'ListItem', item: url, name: page.name, position: 2 },
        ],
      },
    ],
  };
}
