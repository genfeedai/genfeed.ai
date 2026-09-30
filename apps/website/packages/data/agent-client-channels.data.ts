import {
  type AgentClient,
  type AgentClientFaq,
  GENFEED_PUBLIC_MCP_URL,
  getAgentClientCommandBlocks,
} from '@data/agent-clients.data';
import { getIntegrationBySlug } from '@data/integrations.data';

/**
 * Channels an agent can publish to through Genfeed. Each slug has a publisher
 * in `apps/server/api/src/services/integrations/publishers`, a user-connected
 * account, and a page under `/integrations/<slug>`. Channels without a
 * publisher (Discord, Telegram, Slack, Twitch, Medium) and WhatsApp, which
 * sends from Genfeed's own number rather than a connected account, stay off
 * this list so no page promises posting there. Shopify and Fanvue have
 * publishers but are storefront and creator-subscription destinations, not
 * the social scheduling these agent pages target, so they are left out too.
 */
export const AGENT_CLIENT_CHANNEL_SLUGS = [
  'x-twitter',
  'linkedin',
  'instagram',
  'tiktok',
  'youtube',
  'facebook',
  'threads',
  'pinterest',
  'reddit',
  'snapchat',
  'mastodon',
  'wordpress',
  'ghost',
  'beehiiv',
] as const;

export type AgentClientChannelSlug =
  (typeof AGENT_CLIENT_CHANNEL_SLUGS)[number];

interface ChannelCopy {
  /**
   * Set when Genfeed connects the channel with a key the user pastes into
   * Genfeed (Ghost Admin API key, Beehiiv API key) instead of OAuth.
   */
  keyName?: string;
  /** Plural noun for what gets scheduled, title-cased: "Posts", "Videos". */
  noun: string;
  prompts: readonly [string, string, string];
}

const CHANNEL_COPY: Record<AgentClientChannelSlug, ChannelCopy> = {
  beehiiv: {
    keyName: 'Beehiiv API key',
    noun: 'Newsletters',
    prompts: [
      'Turn this week’s three best posts into a Beehiiv newsletter draft.',
      'Write a subject line and preview text for Thursday’s issue, then hold it for review.',
      'Schedule the approved newsletter for Tuesday at 7am.',
    ],
  },
  facebook: {
    noun: 'Posts',
    prompts: [
      'Draft five Facebook Page posts announcing our spring launch.',
      'Generate a square product image for each post and hold them for review.',
      'Schedule the approved posts across next week at lunchtime.',
    ],
  },
  ghost: {
    keyName: 'Ghost Admin API key',
    noun: 'Posts',
    prompts: [
      'Turn this podcast transcript into a Ghost blog post draft.',
      'Generate a featured image in our brand style for the draft.',
      'Publish the approved post on Monday morning.',
    ],
  },
  instagram: {
    noun: 'Posts',
    prompts: [
      'Create a 5-slide Instagram carousel from our latest case study.',
      'Generate a vertical Reel from this product brief and write the caption.',
      'Schedule the approved carousel for Wednesday at 6pm.',
    ],
  },
  linkedin: {
    noun: 'Posts',
    prompts: [
      'Draft three LinkedIn posts from my latest blog article and hold them for review.',
      'Rewrite this announcement as a founder-voice LinkedIn post.',
      'Schedule the approved posts for Tuesday, Wednesday, and Thursday at 9am.',
    ],
  },
  mastodon: {
    noun: 'Posts',
    prompts: [
      'Draft a Mastodon post for our release notes, under 500 characters.',
      'Add alt text to every image before scheduling.',
      'Schedule the approved post for tomorrow morning.',
    ],
  },
  pinterest: {
    noun: 'Pins',
    prompts: [
      'Generate five vertical Pin images for our recipe collection.',
      'Write keyword-rich Pin titles and descriptions for each image.',
      'Schedule the approved Pins across the next two weeks.',
    ],
  },
  reddit: {
    noun: 'Posts',
    prompts: [
      'Draft a Reddit post sharing our open-source release, written for the community, not as an ad.',
      'Suggest a title that fits the subreddit’s rules and hold the post for review.',
      'Publish the approved post on Tuesday morning.',
    ],
  },
  snapchat: {
    noun: 'Posts',
    prompts: [
      'Generate a vertical behind-the-scenes clip from these product photos.',
      'Write a short caption in our brand voice and hold it for review.',
      'Schedule the approved clip for Friday afternoon.',
    ],
  },
  threads: {
    noun: 'Posts',
    prompts: [
      'Turn my latest LinkedIn post into three short Threads posts.',
      'Draft a reply-friendly question to post after the launch.',
      'Schedule the approved posts for this afternoon.',
    ],
  },
  tiktok: {
    noun: 'Videos',
    prompts: [
      'Generate a vertical product video for TikTok and schedule it for Friday at 9am.',
      'Write three hook variations for this clip and hold them for review.',
      'Cut this podcast episode into five TikTok clips with captions.',
    ],
  },
  wordpress: {
    noun: 'Posts',
    prompts: [
      'Write a WordPress blog post from these interview notes.',
      'Generate a featured image and an SEO meta description for the draft.',
      'Publish the approved post on Monday at 8am.',
    ],
  },
  'x-twitter': {
    noun: 'Posts',
    prompts: [
      'Turn this podcast transcript into an X thread and hold it for review.',
      'Draft five X posts from our changelog, each under 280 characters.',
      'Schedule the approved posts across tomorrow at peak times.',
    ],
  },
  youtube: {
    noun: 'Videos',
    prompts: [
      'Turn this podcast transcript into a YouTube Shorts script and generate the video.',
      'Write an SEO title, description, and tags for this upload.',
      'Schedule the approved Short for Saturday at 10am.',
    ],
  },
};

export interface AgentClientChannelPage {
  channelName: string;
  channelSlug: AgentClientChannelSlug;
  description: string;
  faq: readonly AgentClientFaq[];
  features: readonly string[];
  noun: string;
  prompts: readonly string[];
  title: string;
}

export function isAgentClientChannelSlug(
  slug: string,
): slug is AgentClientChannelSlug {
  return (AGENT_CLIENT_CHANNEL_SLUGS as readonly string[]).includes(slug);
}

export function getAgentClientChannels(): readonly {
  name: string;
  slug: AgentClientChannelSlug;
}[] {
  return AGENT_CLIENT_CHANNEL_SLUGS.map((slug) => ({
    name: getChannelName(slug),
    slug,
  }));
}

function getChannelName(slug: AgentClientChannelSlug): string {
  const integration = getIntegrationBySlug(slug);
  if (!integration) {
    throw new Error(`Missing integration for agent channel: ${slug}`);
  }
  return integration.name;
}

export function buildAgentClientChannelPage(
  client: AgentClient,
  channelSlug: AgentClientChannelSlug,
): AgentClientChannelPage {
  const integration = getIntegrationBySlug(channelSlug);
  if (!integration) {
    throw new Error(`Missing integration for agent channel: ${channelSlug}`);
  }

  const { keyName, noun, prompts } = CHANNEL_COPY[channelSlug];
  const lowerNoun = noun.toLowerCase();
  const channelName = integration.name;

  return {
    channelName,
    channelSlug,
    description: `Connect ${client.name} to Genfeed for ${channelName}. Bring your brand context, media tools, and ${lowerNoun} into one creative workflow.`,
    faq: [
      {
        answer: `Yes. Once your ${channelName} account is connected in Genfeed, ${client.name} can draft, schedule, and publish ${channelName} ${lowerNoun} through the Genfeed MCP server.`,
        question: `Can ${client.name} post to ${channelName}?`,
      },
      {
        answer: keyName
          ? `Yes, once. Genfeed connects ${channelName} with your ${keyName}, which you add in Genfeed. ${client.name} reaches Genfeed over MCP with browser OAuth and never receives that key.`
          : `No. You connect ${channelName} in Genfeed once by signing in. ${client.name} reaches Genfeed over MCP with browser OAuth and never sees your ${channelName} credentials.`,
        question: `Do I need a ${channelName} API key?`,
      },
      {
        answer: `No. Genfeed holds ${lowerNoun} for review, and you approve before anything goes to ${channelName}, unless you set up a workflow that publishes directly.`,
        question: `Does ${client.name} publish to ${channelName} without my approval?`,
      },
      {
        answer: client.connectInstruction,
        question: `How do I connect ${client.name} to Genfeed?`,
      },
      {
        answer: `Every client uses the same hosted MCP endpoint: ${GENFEED_PUBLIC_MCP_URL}.`,
        question: 'What URL do I connect?',
      },
    ],
    features: integration.features,
    noun,
    prompts,
    title: `${channelName} in ${client.name}, powered by Genfeed`,
  };
}

export function buildAgentClientChannelJsonLd(
  client: AgentClient,
  page: AgentClientChannelPage,
  url: string,
  clientUrl: string,
) {
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
        name: `How to schedule ${page.channelName} ${page.noun.toLowerCase()} with ${client.name}`,
        step: [
          ...getAgentClientCommandBlocks(client).map((block) => ({
            name: block.label,
            text: block.value,
          })),
          {
            name: `Connect ${page.channelName}`,
            text: `Connect your ${page.channelName} account in Genfeed once.`,
          },
          {
            name: 'Ask, review, schedule',
            text: page.prompts[0],
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
            item: 'https://genfeed.ai/agent',
            name: 'Genfeed Agent',
            position: 1,
          },
          {
            '@type': 'ListItem',
            item: clientUrl,
            name: client.name,
            position: 2,
          },
          {
            '@type': 'ListItem',
            item: url,
            name: page.channelName,
            position: 3,
          },
        ],
      },
    ],
  };
}
