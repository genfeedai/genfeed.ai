import type {
  ServiceLandingConfig,
  ServiceLandingFaq,
} from '@web-components/landing/service-landings.data';
import {
  Briefcase,
  CalendarRange,
  Clapperboard,
  Film,
  ImageIcon,
  LayoutGrid,
  MessageCircle,
  Play,
  Search,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';

/**
 * One growth page per social platform, each built to be the link in that
 * platform's bio. Solo founders connect the agent they already use and
 * review its work in Genfeed before publishing.
 * Only list a platform here once Genfeed can publish to it.
 */

interface SocialGrowthFaqCopy {
  /** Platform display name, e.g. "LinkedIn". */
  platform: string;
  /** Who the page is for, answering "Who is this for?". */
  audience: string;
  /** What the self-serve workspace does on this platform. */
  selfServe: string;
  /**
   * Tactics we refuse on this platform, completing "We do not …" in the
   * fake-engagement answer.
   */
  refusedTactics: string;
}

function socialGrowthFaqs({
  audience,
  platform,
  refusedTactics,
  selfServe,
}: SocialGrowthFaqCopy): ServiceLandingFaq[] {
  return [
    { answer: audience, question: 'Who is this for?' },
    {
      answer: `Yes. Connect your agent to Genfeed, then connect your ${platform} account when you are ready to publish. Ask your agent for ${selfServe}. Review the drafts before scheduling or publishing.`,
      question: 'Can I use the agent I already work with?',
    },
    {
      answer:
        'Yes. Give Genfeed your past posts, notes, and brand context. Your agent uses that context to draft in your voice. You review and approve the content before publishing.',
      question: 'Will it sound like me?',
    },
    {
      answer: `No. Genfeed handles the research, production, scheduling, and analytics. We do not ${refusedTactics}, or use anything that puts the account at risk.`,
      question: 'Is this bots and fake engagement?',
    },
    {
      answer:
        'It depends on your niche, your starting point, and the content you publish. Genfeed does not promise follower counts. Use a steady cadence and ask your agent to review the data each week.',
      question: 'How fast will the account grow?',
    },
    {
      answer:
        'Add your brand context once, then ask your agent for drafts and review the results. You choose the cadence and when to publish.',
      question: 'How much of my time does it take?',
    },
    {
      answer:
        'Start for $0. Paid usage follows your Genfeed plan and credits. Connect your agent to the same workspace; no sales call is required.',
      question: 'How does pricing work?',
    },
  ];
}

export function agentLandingProcess(
  draftDescription: string,
): ServiceLandingConfig['process'] {
  return [
    {
      description:
        'Connect Codex, Claude, or the agent you already use to Genfeed. Authorize access to your workspace.',
      step: 'Connect',
    },
    { description: draftDescription, step: 'Draft' },
    {
      description:
        'Review the drafts in Genfeed. Refine the content and approve what you want to publish.',
      step: 'Review',
    },
    {
      description:
        'Connect your social account, schedule approved content, and ask your agent to review performance before the next batch.',
      step: 'Publish and learn',
    },
  ];
}

const SOCIAL_GROWTH_FIT_LABEL = 'Good Fit Signals';
const SOCIAL_GROWTH_FAQ_DESCRIPTION =
  'What to know before connecting your agent.';
const SOCIAL_GROWTH_PROCESS_DESCRIPTION =
  'Your agent drafts. You review. Genfeed schedules approved content and tracks the results.';

export const socialGrowthLandingConfigs: ServiceLandingConfig[] = [
  {
    isAgentFirst: true,
    badge: 'X Growth',
    closingDescription:
      'Connect your agent and turn your next product update into content for X. Review the drafts in Genfeed, then publish when you are ready.',
    closingTitle: 'Grow On X Without Living On X',
    deliverableBuckets: [
      {
        items: [
          'Positioning and content pillars for your niche',
          'Voice calibration from your past posts and notes',
          'Target accounts and conversations to show up in',
          'Weekly themes tied to your launches and news',
        ],
        title: 'Strategy',
      },
      {
        items: [
          'Daily posts with hooks written for the timeline',
          'Threads built from your long-form, calls, and notes',
          'Short video clips and visuals sized for X',
          'Reply and quote-post drafts on relevant conversations',
        ],
        title: 'Content',
      },
      {
        items: [
          'Scheduling around when your audience is online',
          'Tracking impressions, replies, reposts, and profile clicks',
          'Doubling down on the topics and formats that grow followers',
          'Monthly review of what is working and what changes next',
        ],
        title: 'Growth Ops',
      },
    ],
    deliverablesDescription:
      'The full X growth loop inside your Genfeed workspace. Ask your connected agent to create and schedule approved content. You keep the account, the assets, and the data.',
    deliverablesTitle: 'What You Get',
    faqDescription: SOCIAL_GROWTH_FAQ_DESCRIPTION,
    faqs: socialGrowthFaqs({
      audience:
        'Solo founders and operators whose buyers, peers, or future hires are on X, and who want to turn what they ship into content from the agent they already use.',
      platform: 'X',
      refusedTactics:
        'buy followers, run engagement pods, or use follow/unfollow tactics',
      selfServe:
        'trend monitoring, posts and threads, reply drafts, scheduling, and analytics',
    }),
    faqTitle: 'Common Questions',
    fitLabel: SOCIAL_GROWTH_FIT_LABEL,
    fitSignals: [
      'Your buyers, investors, or future hires already read X, and your account is not where it should be.',
      'You have opinions and expertise, but posting daily and replying in real time does not fit your calendar.',
      'You want an account that sounds like you, not like an engagement-bait ghostwriter.',
    ],
    heroAccent: 'X account',
    heroDescription:
      'Turn what you ship into X posts, threads, and visuals with the agent you already use. Genfeed adds your brand voice, scheduling, and analytics. You approve what publishes.',
    heroTitle: 'Grow your',
    includes: [
      'X growth strategy and content pillars',
      'Voice calibration',
      'Daily posts and threads',
      'Video clips and visuals',
      'Trend monitoring in your niche',
      'Reply and quote-post drafts',
      'Scheduling and publishing',
      'Monthly performance review',
    ],
    intro:
      'X rewards accounts that show up every day with a sharp point of view and join the conversation while it is still moving. Almost nobody can sustain that on top of a real job. Genfeed handles trend monitoring, drafting in your voice, replies, scheduling, and analytics. Ask your connected agent for the next batch from your product updates, notes, or customer insights. Review the drafts in Genfeed before publishing.',
    metaDescription:
      'Grow on X with your existing AI agent. Create posts, threads, and reply drafts in Genfeed, review the results, then schedule approved content.',
    metaTitle: 'X (Twitter) Growth With Your Agent | Genfeed.ai',
    outcomes: [
      {
        description:
          'Genfeed watches the trends and conversations in your niche, so your takes land while the topic is still moving.',
        icon: TrendingUp,
        title: 'Timely, Not Late',
      },
      {
        description:
          'A steady queue of posts, threads, and clips, scheduled for when your audience is actually online.',
        icon: CalendarRange,
        title: 'A Daily Cadence',
      },
      {
        description:
          'Reply and quote-post drafts on the accounts that matter in your space, the fastest way in front of new followers.',
        icon: MessageCircle,
        title: 'Replies That Build Reach',
      },
    ],
    outcomesDescription:
      'Growth on X comes from consistency, timing, and conversation. Those are the first three things to break when you are busy.',
    outcomesTitle: 'What This Solves',
    process: agentLandingProcess(
      'Ask your agent to turn a product update or note into X posts, threads, and reply drafts in your voice.',
    ),
    processDescription: SOCIAL_GROWTH_PROCESS_DESCRIPTION,
    processTitle: 'How It Works',
    slug: 'x',
    title: 'X Growth With Your Agent',
  },
  {
    isAgentFirst: true,
    badge: 'LinkedIn Growth',
    closingDescription:
      'Connect your agent and turn your next product update into content for LinkedIn. Review the drafts in Genfeed, then publish when you are ready.',
    closingTitle: 'Become The Name Your Buyers Already Know',
    deliverableBuckets: [
      {
        items: [
          'Positioning and content pillars your buyers care about',
          'Voice calibration from your past posts, calls, and notes',
          'The creators and conversations your buyers follow',
          'Weekly themes tied to your launches, wins, and opinions',
        ],
        title: 'Strategy',
      },
      {
        items: [
          'Text posts with hooks that earn the "see more" click',
          'Image posts and native video clips cut from your calls',
          'Carousel slide designs from your frameworks and data',
          'Comment drafts on the posts your buyers are reading',
        ],
        title: 'Content',
      },
      {
        items: [
          'Scheduling to your profile when your network is at work',
          'Tracking impressions, reactions, comments, and profile views',
          'Doubling down on the topics that start sales conversations',
          'Monthly review of what is working and what changes next',
        ],
        title: 'Growth Ops',
      },
    ],
    deliverablesDescription:
      'The full LinkedIn growth loop inside your Genfeed workspace. Ask your connected agent to create and schedule approved content. You keep the profile, the assets, and the data.',
    deliverablesTitle: 'What You Get',
    faqDescription: SOCIAL_GROWTH_FAQ_DESCRIPTION,
    faqs: socialGrowthFaqs({
      audience:
        'Solo founders and B2B operators whose buyers, hires, or investors check LinkedIn, and who want their existing agent to turn product updates and expertise into regular posts.',
      platform: 'LinkedIn',
      refusedTactics:
        'buy followers, run engagement pods, or send automated connection and DM sequences',
      selfServe: 'topic research, drafting, scheduling, and analytics',
    }),
    faqTitle: 'Common Questions',
    fitLabel: SOCIAL_GROWTH_FIT_LABEL,
    fitSignals: [
      'Your buyers look you up on LinkedIn before a call, and your profile does not reflect what you actually know.',
      'You post in bursts, then go quiet for weeks when real work takes over.',
      'You want posts that sound like an operator, not like a broetry ghostwriter.',
    ],
    heroAccent: 'LinkedIn audience',
    heroDescription:
      'Turn product updates and customer insights into LinkedIn posts, clips, and carousels with your existing agent. Review in Genfeed, then schedule approved content and learn what gets a response.',
    heroTitle: 'Grow your',
    includes: [
      'LinkedIn strategy and content pillars',
      'Voice calibration',
      'Posts several times a week',
      'Native video and carousel slides',
      'Topic research in your industry',
      'Comment drafts on buyer conversations',
      'Scheduling and publishing',
      'Monthly performance review',
    ],
    intro:
      'LinkedIn rewards people who post a clear point of view every week and show up in the comments of the conversations their buyers read. That is a second job on top of running the business. Genfeed handles research, drafting in your voice, visuals, scheduling, and analytics. Ask your connected agent for the next batch from your product updates, notes, or customer insights. Review the drafts in Genfeed before publishing.',
    metaDescription:
      'Create LinkedIn posts, clips, and carousels with your existing AI agent. Review in Genfeed, schedule approved content, and track results.',
    metaTitle: 'LinkedIn Growth With Your Agent | Genfeed.ai',
    outcomes: [
      {
        description:
          'Turn what you already say on calls into posts that make buyers trust you before the first meeting.',
        icon: Briefcase,
        title: 'Authority That Sells',
      },
      {
        description:
          'A steady queue of posts, clips, and carousels, scheduled for when your network is at work.',
        icon: CalendarRange,
        title: 'A Weekly Cadence',
      },
      {
        description:
          'Comment drafts on the posts your buyers already read, the fastest way in front of the right new followers.',
        icon: MessageCircle,
        title: 'Comments That Build Reach',
      },
    ],
    outcomesDescription:
      'Growth on LinkedIn comes from a sharp point of view, consistency, and showing up in the comments. Those are the first three things to break when you are busy.',
    outcomesTitle: 'What This Solves',
    process: agentLandingProcess(
      'Ask your agent to turn a product update or customer insight into LinkedIn posts, clips, and comment drafts.',
    ),
    processDescription: SOCIAL_GROWTH_PROCESS_DESCRIPTION,
    processTitle: 'How It Works',
    slug: 'linkedin',
    title: 'LinkedIn Growth With Your Agent',
  },
  {
    isAgentFirst: true,
    badge: 'Instagram Growth',
    closingDescription:
      'Connect your agent and turn your next product update into content for Instagram. Review the drafts in Genfeed, then publish when you are ready.',
    closingTitle: 'Post Like A Media Team Without Hiring One',
    deliverableBuckets: [
      {
        items: [
          'Positioning and content pillars for your niche',
          'Visual direction that fits your brand',
          'Reel formats and trending audio in your space',
          'Weekly themes tied to your launches and offers',
        ],
        title: 'Strategy',
      },
      {
        items: [
          'Reels with hooks built for the first second',
          'Carousels that get saved and shared',
          'Feed images and visual variations',
          'Captions, CTAs, and hashtags',
        ],
        title: 'Content',
      },
      {
        items: [
          'Scheduling to the feed and Reels',
          'Tracking reach, saves, shares, and follows',
          'Doubling down on the formats that bring new followers',
          'Monthly review of what is working and what changes next',
        ],
        title: 'Growth Ops',
      },
    ],
    deliverablesDescription:
      'The full Instagram growth loop inside your Genfeed workspace. Ask your connected agent to create and schedule approved content. You keep the account, the assets, and the data.',
    deliverablesTitle: 'What You Get',
    faqDescription: SOCIAL_GROWTH_FAQ_DESCRIPTION,
    faqs: socialGrowthFaqs({
      audience:
        'Creators, founders, and consumer brands where Instagram drives sales, bookings, or community, and the account stalls because producing Reels every week is a production job nobody has time for.',
      platform: 'Instagram',
      refusedTactics:
        'buy followers, run engagement pods, or mass follow, unfollow, and DM',
      selfServe:
        'trend research, image and video generation, captions, scheduling, and analytics',
    }),
    faqTitle: 'Common Questions',
    fitLabel: SOCIAL_GROWTH_FIT_LABEL,
    fitSignals: [
      'Your customers find you on Instagram, and the account is not posting enough to be found.',
      'You know Reels are the growth lever, but editing video every week does not fit your calendar.',
      'You want content that looks like your brand, not like a stock-template account.',
    ],
    heroAccent: 'Instagram',
    heroDescription:
      'Ask your existing agent for Instagram Reels, carousels, and captions from your product and brand context. Review the results in Genfeed, then schedule approved content and track its reach.',
    heroTitle: 'Grow your',
    includes: [
      'Instagram strategy and content pillars',
      'Visual and voice calibration',
      'Reels every week',
      'Carousels and feed images',
      'Trend and audio research in your niche',
      'Captions, CTAs, and hashtags',
      'Scheduling and publishing',
      'Monthly performance review',
    ],
    intro:
      'Instagram rewards accounts that ship Reels consistently, ride formats while they are moving, and make carousels people save. That is a small media team worth of work. Genfeed handles trend research, image and video generation, captions, scheduling, and analytics. Ask your connected agent for the next batch from your product updates, notes, or customer insights. Review the drafts in Genfeed before publishing.',
    metaDescription:
      'Create Instagram Reels, carousels, and captions with your existing AI agent. Review in Genfeed, schedule approved posts, and track reach.',
    metaTitle: 'Instagram Growth With Your Agent | Genfeed.ai',
    outcomes: [
      {
        description:
          'Reels, carousels, and images produced every week, without a shoot or an editor on payroll.',
        icon: Clapperboard,
        title: 'Reels Without A Studio',
      },
      {
        description:
          'Genfeed watches the formats and audio moving in your niche, so you post into a trend, not after it.',
        icon: TrendingUp,
        title: 'On Trend, Not Late',
      },
      {
        description:
          'Carousels and Reels built to be saved and shared, the signals that push posts to new accounts.',
        icon: Users,
        title: 'Reach Beyond Followers',
      },
    ],
    outcomesDescription:
      'Growth on Instagram comes from video volume, timing, and shareable posts. Those are the first three things to break when you are busy.',
    outcomesTitle: 'What This Solves',
    process: agentLandingProcess(
      'Ask your agent for Instagram Reels, carousels, and captions from your product and brand context.',
    ),
    processDescription: SOCIAL_GROWTH_PROCESS_DESCRIPTION,
    processTitle: 'How It Works',
    slug: 'instagram',
    title: 'Instagram Growth With Your Agent',
  },
  {
    isAgentFirst: true,
    badge: 'TikTok Growth',
    closingDescription:
      'Connect your agent and turn your next product update into content for TikTok. Review the drafts in Genfeed, then publish when you are ready.',
    closingTitle: 'Post Every Day Without Filming Every Day',
    deliverableBuckets: [
      {
        items: [
          'Positioning and content pillars for your niche',
          'Hook formats that work in your category',
          'Trending sounds and formats to ride',
          'Weekly themes tied to your launches and offers',
        ],
        title: 'Strategy',
      },
      {
        items: [
          'Short videos with hooks built for the first second',
          'Clips cut from your podcasts, calls, and long-form',
          'Photo carousels for the slideshow format',
          'Captions, on-screen text, and hashtags',
        ],
        title: 'Content',
      },
      {
        items: [
          'Scheduling around when your audience scrolls',
          'Tracking views, watch time, shares, and follows',
          'Doubling down on the hooks and formats that go wide',
          'Monthly review of what is working and what changes next',
        ],
        title: 'Growth Ops',
      },
    ],
    deliverablesDescription:
      'The full TikTok growth loop inside your Genfeed workspace. Ask your connected agent to create and schedule approved content. You keep the account, the assets, and the data.',
    deliverablesTitle: 'What You Get',
    faqDescription: SOCIAL_GROWTH_FAQ_DESCRIPTION,
    faqs: socialGrowthFaqs({
      audience:
        'Creators, founders, and consumer brands that know their audience is on TikTok but cannot sustain the daily video volume the algorithm rewards.',
      platform: 'TikTok',
      refusedTactics: 'buy followers or views, or run engagement pods',
      selfServe:
        'trend and sound research, video generation and clipping, captions, scheduling, and analytics',
    }),
    faqTitle: 'Common Questions',
    fitLabel: SOCIAL_GROWTH_FIT_LABEL,
    fitSignals: [
      'Your audience is on TikTok and you are posting a few times a month when the algorithm wants daily.',
      'You have long-form footage, podcasts, or calls that never get cut into clips.',
      'You want videos that feel native to the feed, not like repurposed ads.',
    ],
    heroAccent: 'TikTok',
    heroDescription:
      'Turn product ideas and source footage into TikTok videos, slideshows, and captions with your existing agent. Review in Genfeed, schedule approved content, and see which hooks work.',
    heroTitle: 'Grow your',
    includes: [
      'TikTok strategy and content pillars',
      'Hook and voice calibration',
      'Daily short videos',
      'Clips from your long-form',
      'Trend and sound research',
      'Photo carousels',
      'Scheduling and publishing',
      'Monthly performance review',
    ],
    intro:
      'TikTok rewards accounts that post every day, test hooks fast, and jump on formats while they are still climbing. Almost nobody can film and edit at that pace. Genfeed handles trend research, video generation and clipping, captions, scheduling, and analytics. Ask your connected agent for the next batch from your product updates, notes, or customer insights. Review the drafts in Genfeed before publishing.',
    metaDescription:
      'Create TikTok videos, slideshows, and captions with your existing AI agent. Review in Genfeed, schedule approved posts, and track results.',
    metaTitle: 'TikTok Growth With Your Agent | Genfeed.ai',
    outcomes: [
      {
        description:
          'A daily queue of short videos and clips, without filming or editing every day.',
        icon: Film,
        title: 'Daily Volume',
      },
      {
        description:
          'Genfeed watches the sounds and formats climbing in your niche, so you post into a trend, not after it.',
        icon: TrendingUp,
        title: 'On Trend, Not Late',
      },
      {
        description:
          'More hooks tested every week means you find the ones that break out of your follower base faster.',
        icon: Target,
        title: 'Hooks That Get Tested',
      },
    ],
    outcomesDescription:
      'Growth on TikTok comes from volume, timing, and testing hooks. Those are the first three things to break when you are busy.',
    outcomesTitle: 'What This Solves',
    process: agentLandingProcess(
      'Ask your agent for TikTok short videos, slideshows, hooks, and captions from your source material.',
    ),
    processDescription: SOCIAL_GROWTH_PROCESS_DESCRIPTION,
    processTitle: 'How It Works',
    slug: 'tiktok',
    title: 'TikTok Growth With Your Agent',
  },
  {
    isAgentFirst: true,
    badge: 'YouTube Growth',
    closingDescription:
      'Connect your agent and turn your next product update into content for YouTube. Review the drafts in Genfeed, then publish when you are ready.',
    closingTitle: 'Build The Channel Without Becoming An Editor',
    deliverableBuckets: [
      {
        items: [
          'Positioning and content pillars for your niche',
          'Topics people are already searching for',
          'A Shorts and long-form mix that feeds each other',
          'Weekly themes tied to your launches and news',
        ],
        title: 'Strategy',
      },
      {
        items: [
          'Shorts cut from your long-form, podcasts, and calls',
          'Long-form scripts and outlines',
          'Title and thumbnail concepts built for the click',
          'Descriptions, chapters, and tags',
        ],
        title: 'Content',
      },
      {
        items: [
          'Scheduling uploads on a steady cadence',
          'Tracking views, watch time, and subscribers',
          'Doubling down on the topics that bring subscribers',
          'Monthly review of what is working and what changes next',
        ],
        title: 'Growth Ops',
      },
    ],
    deliverablesDescription:
      'The full YouTube growth loop inside your Genfeed workspace. Ask your connected agent to create and schedule approved content. You keep the channel, the assets, and the data.',
    deliverablesTitle: 'What You Get',
    faqDescription: SOCIAL_GROWTH_FAQ_DESCRIPTION,
    faqs: socialGrowthFaqs({
      audience:
        'Founders, experts, and brands with things worth watching, where YouTube search could bring buyers for years, and the channel stalls because editing and packaging take longer than recording.',
      platform: 'YouTube',
      refusedTactics: 'buy views or subscribers, or run sub-for-sub schemes',
      selfServe:
        'topic research, Shorts clipping, titles and descriptions, scheduling, and analytics',
    }),
    faqTitle: 'Common Questions',
    fitLabel: SOCIAL_GROWTH_FIT_LABEL,
    fitSignals: [
      'Your buyers search YouTube for the problems you solve, and your channel is not showing up.',
      'You record long-form, podcasts, or webinars that never get turned into Shorts.',
      'You want a channel that compounds in search, not one upload a quarter.',
    ],
    heroAccent: 'YouTube channel',
    heroDescription:
      'Turn your recordings into YouTube Shorts, scripts, titles, and descriptions with your existing agent. Genfeed gives you a place to review, schedule approved uploads, and track performance.',
    heroTitle: 'Grow your',
    includes: [
      'YouTube strategy and content pillars',
      'Voice calibration',
      'Shorts every week',
      'Long-form scripts and outlines',
      'Search-driven topic research',
      'Titles, thumbnails, and descriptions',
      'Scheduling and publishing',
      'Monthly performance review',
    ],
    intro:
      'YouTube rewards channels that pick searchable topics, package them well, and feed the channel with Shorts between long-form uploads. The recording is the easy part; the editing and packaging are what stall most channels. Genfeed handles topic research, clipping, titles and descriptions, scheduling, and analytics. Ask your connected agent for the next batch from your product updates, notes, or customer insights. Review the drafts in Genfeed before publishing.',
    metaDescription:
      'Create YouTube Shorts, scripts, and descriptions with your existing AI agent. Review in Genfeed, schedule approved uploads, and track results.',
    metaTitle: 'YouTube Growth With Your Agent | Genfeed.ai',
    outcomes: [
      {
        description:
          'Every long-form video, podcast, or call becomes a week of Shorts that send viewers back to the channel.',
        icon: Play,
        title: 'Shorts From Everything',
      },
      {
        description:
          'Topics picked from what people already search, so videos keep bringing views long after upload.',
        icon: Search,
        title: 'Found In Search',
      },
      {
        description:
          'Titles and thumbnails worked as hard as the video, because the click decides whether anyone watches.',
        icon: ImageIcon,
        title: 'Packaging That Gets Clicked',
      },
    ],
    outcomesDescription:
      'Growth on YouTube comes from searchable topics, packaging, and a steady upload rhythm. Those are the first three things to break when you are busy.',
    outcomesTitle: 'What This Solves',
    process: agentLandingProcess(
      'Ask your agent to turn your source footage into Shorts and draft titles, descriptions, and scripts.',
    ),
    processDescription: SOCIAL_GROWTH_PROCESS_DESCRIPTION,
    processTitle: 'How It Works',
    slug: 'youtube',
    title: 'YouTube Growth With Your Agent',
  },
  {
    isAgentFirst: true,
    badge: 'Threads Growth',
    closingDescription:
      'Connect your agent and turn your next product update into content for Threads. Review the drafts in Genfeed, then publish when you are ready.',
    closingTitle: 'Show Up In The Conversation Every Day',
    deliverableBuckets: [
      {
        items: [
          'Positioning and content pillars for your niche',
          'Voice calibration from your past posts and notes',
          'Topics and conversations to show up in',
          'Weekly themes tied to your launches and news',
        ],
        title: 'Strategy',
      },
      {
        items: [
          'Daily text posts with a sharp point of view',
          'Multi-part posts built from your long-form',
          'Image and video carousels',
          'Reply drafts on relevant conversations',
        ],
        title: 'Content',
      },
      {
        items: [
          'Scheduling around when your audience is online',
          'Tracking views, replies, reposts, and follows',
          'Doubling down on the topics that grow followers',
          'Monthly review of what is working and what changes next',
        ],
        title: 'Growth Ops',
      },
    ],
    deliverablesDescription:
      'The full Threads growth loop inside your Genfeed workspace. Ask your connected agent to create and schedule approved content. You keep the account, the assets, and the data.',
    deliverablesTitle: 'What You Get',
    faqDescription: SOCIAL_GROWTH_FAQ_DESCRIPTION,
    faqs: socialGrowthFaqs({
      audience:
        'Founders, creators, and brands that already have an Instagram audience or a point of view, and want to build on Threads while the platform is still early.',
      platform: 'Threads',
      refusedTactics:
        'buy followers, run engagement pods, or mass follow and unfollow',
      selfServe: 'trend research, drafting, scheduling, and analytics',
    }),
    faqTitle: 'Common Questions',
    fitLabel: SOCIAL_GROWTH_FIT_LABEL,
    fitSignals: [
      'You have an Instagram audience or a point of view, and nothing on Threads to show for it.',
      'You know text-first platforms reward daily posting, and daily does not fit your calendar.',
      'You want to build on a platform while reach is still cheap.',
    ],
    heroAccent: 'Threads',
    heroDescription:
      'Turn your notes and product updates into Threads posts, carousels, and reply drafts with your existing agent. Review in Genfeed, schedule approved posts, and learn what resonates.',
    heroTitle: 'Grow on',
    includes: [
      'Threads strategy and content pillars',
      'Voice calibration',
      'Daily posts',
      'Image and video carousels',
      'Trend monitoring in your niche',
      'Reply drafts',
      'Scheduling and publishing',
      'Monthly performance review',
    ],
    intro:
      'Threads rewards accounts that post every day and join conversations while they are moving, and reach is still cheaper than on older platforms. Genfeed handles trend monitoring, drafting in your voice, carousels, scheduling, and analytics. Ask your connected agent for the next batch from your product updates, notes, or customer insights. Review the drafts in Genfeed before publishing.',
    metaDescription:
      'Create Threads posts, carousels, and reply drafts with your existing AI agent. Review in Genfeed, schedule approved posts, and track results.',
    metaTitle: 'Threads Growth With Your Agent | Genfeed.ai',
    outcomes: [
      {
        description:
          'A steady queue of posts and carousels, scheduled for when your audience is online.',
        icon: CalendarRange,
        title: 'A Daily Cadence',
      },
      {
        description:
          'Genfeed watches the conversations in your niche, so your takes land while the topic is still moving.',
        icon: TrendingUp,
        title: 'Timely, Not Late',
      },
      {
        description:
          'Reply drafts on the accounts that matter in your space, the fastest way in front of new followers.',
        icon: MessageCircle,
        title: 'Replies That Build Reach',
      },
    ],
    outcomesDescription:
      'Growth on Threads comes from consistency, timing, and conversation. Those are the first three things to break when you are busy.',
    outcomesTitle: 'What This Solves',
    process: agentLandingProcess(
      'Ask your agent for Threads posts, carousels, and reply drafts from your notes and product updates.',
    ),
    processDescription: SOCIAL_GROWTH_PROCESS_DESCRIPTION,
    processTitle: 'How It Works',
    slug: 'threads',
    title: 'Threads Growth With Your Agent',
  },
  {
    isAgentFirst: true,
    badge: 'Facebook Growth',
    closingDescription:
      'Connect your agent and turn your next product update into content for Facebook. Review the drafts in Genfeed, then publish when you are ready.',
    closingTitle: 'Keep Your Page Alive Without Babysitting It',
    deliverableBuckets: [
      {
        items: [
          'Positioning and content pillars for your audience',
          'Voice calibration from your past posts',
          'Topics your community reacts to and shares',
          'Weekly themes tied to your offers, events, and news',
        ],
        title: 'Strategy',
      },
      {
        items: [
          'Reels built for the Facebook feed',
          'Image posts and visual variations',
          'Link posts and announcements that drive clicks',
          'Captions and CTAs',
        ],
        title: 'Content',
      },
      {
        items: [
          'Scheduling to your Page on a steady cadence',
          'Tracking reach, reactions, shares, and clicks',
          'Doubling down on the posts that bring new followers',
          'Monthly review of what is working and what changes next',
        ],
        title: 'Growth Ops',
      },
    ],
    deliverablesDescription:
      'The full Facebook growth loop inside your Genfeed workspace. Ask your connected agent to create and schedule approved content. You keep the Page, the assets, and the data.',
    deliverablesTitle: 'What You Get',
    faqDescription: SOCIAL_GROWTH_FAQ_DESCRIPTION,
    faqs: socialGrowthFaqs({
      audience:
        'Local businesses, service brands, and communities whose customers still live on Facebook, and whose Page goes quiet because nobody owns it.',
      platform: 'Facebook',
      refusedTactics:
        'buy Page likes, or run like farms and engagement-bait schemes',
      selfServe:
        'image and video generation, captions, scheduling to your Page, and analytics',
    }),
    faqTitle: 'Common Questions',
    fitLabel: SOCIAL_GROWTH_FIT_LABEL,
    fitSignals: [
      'Your customers still find and check you on Facebook, and the Page has not posted in weeks.',
      'You need Reels and posts every week but have nobody to produce them.',
      'You want a Page that looks active and on-brand every time someone checks it.',
    ],
    heroAccent: 'Facebook Page',
    heroDescription:
      'Create Facebook Reels, image posts, and captions from your product updates and offers with your existing agent. Review in Genfeed, schedule approved posts to your Page, and track results.',
    heroTitle: 'Grow your',
    includes: [
      'Facebook strategy and content pillars',
      'Voice calibration',
      'Posts several times a week',
      'Reels and images',
      'Topic research for your audience',
      'Captions and CTAs',
      'Page scheduling and publishing',
      'Monthly performance review',
    ],
    intro:
      'Facebook still drives real customers for local and community brands, but only for Pages that post consistently and lean into Reels. Genfeed handles image and video generation, captions, scheduling, and analytics. Ask your connected agent for the next batch from your product updates, notes, or customer insights. Review the drafts in Genfeed before publishing.',
    metaDescription:
      'Create Facebook Reels, image posts, and captions with your existing AI agent. Review in Genfeed, schedule approved posts, and track results.',
    metaTitle: 'Facebook Growth With Your Agent | Genfeed.ai',
    outcomes: [
      {
        description:
          'A Page that posts several times a week, so everyone who checks you sees an active business.',
        icon: CalendarRange,
        title: 'A Page That Looks Alive',
      },
      {
        description:
          'Reels produced every week, the format Facebook pushes furthest beyond your followers.',
        icon: Clapperboard,
        title: 'Reels Without A Studio',
      },
      {
        description:
          'Posts built to be shared into the groups and feeds where your next customers are.',
        icon: Users,
        title: 'Reach Through Shares',
      },
    ],
    outcomesDescription:
      'Growth on Facebook comes from consistency, video, and shareable posts. Those are the first three things to break when you are busy.',
    outcomesTitle: 'What This Solves',
    process: agentLandingProcess(
      'Ask your agent for Facebook Reels, image posts, and captions from your product updates and offers.',
    ),
    processDescription: SOCIAL_GROWTH_PROCESS_DESCRIPTION,
    processTitle: 'How It Works',
    slug: 'facebook',
    title: 'Facebook Growth With Your Agent',
  },
  {
    isAgentFirst: true,
    badge: 'Pinterest Growth',
    closingDescription:
      'Connect your agent and turn your next product update into content for Pinterest. Review the drafts in Genfeed, then publish when you are ready.',
    closingTitle: 'Turn Pinterest Into A Traffic Channel',
    deliverableBuckets: [
      {
        items: [
          'Keywords your buyers search on Pinterest',
          'Board structure around your products and topics',
          'Seasonal themes planned ahead of the search curve',
          'Visual direction that fits your brand',
        ],
        title: 'Strategy',
      },
      {
        items: [
          'Fresh pin images for every product and post',
          'Several design variations per link',
          'Keyword-rich titles and descriptions',
          'Destination links to your site, shop, or blog',
        ],
        title: 'Content',
      },
      {
        items: [
          'Scheduling pins to the right boards',
          'Tracking impressions, saves, and outbound clicks',
          'Doubling down on the pins that drive traffic',
          'Monthly review of what is working and what changes next',
        ],
        title: 'Growth Ops',
      },
    ],
    deliverablesDescription:
      'The full Pinterest growth loop inside your Genfeed workspace. Ask your connected agent to create and schedule approved content. You keep the account, the assets, and the data.',
    deliverablesTitle: 'What You Get',
    faqDescription: SOCIAL_GROWTH_FAQ_DESCRIPTION,
    faqs: socialGrowthFaqs({
      audience:
        'E-commerce brands, bloggers, and creators in visual niches (home, food, fashion, travel, design) where Pinterest search can send buyers to the site for months.',
      platform: 'Pinterest',
      refusedTactics:
        'buy followers, spam group boards, or mass follow and unfollow',
      selfServe:
        'keyword research, pin image generation, descriptions, scheduling to your boards, and analytics',
    }),
    faqTitle: 'Common Questions',
    fitLabel: SOCIAL_GROWTH_FIT_LABEL,
    fitSignals: [
      'You sell or write about something visual, and Pinterest is sending you almost no traffic.',
      'You know Pinterest wants fresh pins every week, and designing them does not fit your calendar.',
      'You want traffic that keeps coming for months, not a post that dies in a day.',
    ],
    heroAccent: 'Pinterest traffic',
    heroDescription:
      'Ask your existing agent for Pinterest pin images, titles, and descriptions linked to your products or articles. Review in Genfeed, schedule approved pins, and track saves and outbound clicks.',
    heroTitle: 'Grow your',
    includes: [
      'Pinterest strategy and keyword map',
      'Visual calibration',
      'Fresh pins every week',
      'Design variations per link',
      'Seasonal planning',
      'Titles and descriptions',
      'Board scheduling and publishing',
      'Monthly performance review',
    ],
    intro:
      'Pinterest is a search engine that rewards fresh pins, good keywords, and consistency, and a pin can send clicks for months. Most brands stop after a few boards because designing pins every week is tedious. Genfeed handles keyword research, pin image generation, descriptions, scheduling, and analytics. Ask your connected agent for the next batch from your product updates, notes, or customer insights. Review the drafts in Genfeed before publishing.',
    metaDescription:
      'Create Pinterest pins, titles, and descriptions with your existing AI agent. Review in Genfeed, schedule approved pins, and track traffic.',
    metaTitle: 'Pinterest Growth With Your Agent | Genfeed.ai',
    outcomes: [
      {
        description:
          'Pins built around what your buyers type into Pinterest search, so they keep surfacing long after they go live.',
        icon: Search,
        title: 'Found In Search',
      },
      {
        description:
          'Several fresh designs per product or post every week, without a designer on payroll.',
        icon: LayoutGrid,
        title: 'Fresh Pins, Every Week',
      },
      {
        description:
          'Every pin links to your site, shop, or blog, so growth shows up as visits, not just saves.',
        icon: Target,
        title: 'Traffic, Not Vanity',
      },
    ],
    outcomesDescription:
      'Growth on Pinterest comes from keywords, fresh pins, and consistency. Those are the first three things to break when you are busy.',
    outcomesTitle: 'What This Solves',
    process: agentLandingProcess(
      'Ask your agent for Pinterest pin images, titles, and descriptions linked to your products or articles.',
    ),
    processDescription: SOCIAL_GROWTH_PROCESS_DESCRIPTION,
    processTitle: 'How It Works',
    slug: 'pinterest',
    title: 'Pinterest Growth With Your Agent',
  },
];

export const socialGrowthSlugs = socialGrowthLandingConfigs.map(
  (config) => config.slug,
);
